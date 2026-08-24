const crypto = require("node:crypto");

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function forwardedValue(value) {
  if (typeof value !== "string") return "";
  return value.split(",")[0].trim();
}

function resolveOrigin(request) {
  const forwardedHost = forwardedValue(request.headers["x-forwarded-host"]);
  const host = forwardedHost || forwardedValue(request.headers.host);
  const forwardedProto = forwardedValue(request.headers["x-forwarded-proto"]);
  const protocol = forwardedProto === "http" ? "http" : "https";

  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    return null;
  }

  return `${protocol}://${host}`;
}

module.exports = async function handler(request, response) {
  const requestId = crypto.randomUUID();
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Pilot-Request-Id", requestId);

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed", request_id: requestId });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  if (!triggerSecret) {
    return response.status(503).json({ error: "Verification is not configured", request_id: requestId });
  }

  const authorization = request.headers.authorization || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!safeEqual(supplied, triggerSecret)) {
    return response.status(401).json({ error: "Unauthorized", request_id: requestId });
  }

  const origin = resolveOrigin(request);
  if (!origin) {
    return response.status(400).json({ error: "Verification origin is invalid", request_id: requestId });
  }

  const target = new URL("/", origin);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const result = await fetch(target, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });

    const body = await result.text();
    const healthy =
      result.ok &&
      body.includes("<title>Routalk Pilot</title>") &&
      body.includes("Routalk Pilot");

    return response.status(healthy ? 200 : 503).json({
      state: healthy ? "READY" : "FAILED",
      http_status: result.status,
      target: "/",
      verified_at: new Date().toISOString(),
      request_id: requestId,
    });
  } catch (error) {
    return response.status(504).json({
      state: "FAILED",
      error: error?.name === "AbortError" ? "Verification timed out" : "Verification request failed",
      request_id: requestId,
    });
  } finally {
    clearTimeout(timeout);
  }
};

module.exports._test = { forwardedValue, resolveOrigin };
