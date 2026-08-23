const crypto = require("node:crypto");

const MAX_CONTENT_LENGTH = 4096;
const GITHUB_TIMEOUT_MS = 10000;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function applySecurityHeaders(response, requestId) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Pilot-Request-Id", requestId);
}

function validRepositoryPart(value) {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(value || "");
}

function validWorkflow(value) {
  return /^[A-Za-z0-9_.-]{1,100}\.ya?ml$/.test(value || "");
}

function validRef(value) {
  return /^[A-Za-z0-9._/-]{1,120}$/.test(value || "") &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.endsWith("/");
}

module.exports = async function handler(request, response) {
  const requestId = crypto.randomUUID();
  applySecurityHeaders(response, requestId);

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({
      error: "Method not allowed",
      request_id: requestId,
    });
  }

  const contentLength = Number(request.headers["content-length"] || 0);

  if (!Number.isFinite(contentLength) || contentLength > MAX_CONTENT_LENGTH) {
    return response.status(413).json({
      error: "Request is too large",
      request_id: requestId,
    });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const githubToken = process.env.PILOT_GITHUB_TOKEN;

  if (!triggerSecret || !githubToken) {
    return response.status(503).json({
      error: "Dispatch is not configured",
      request_id: requestId,
    });
  }

  const authorization = request.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!safeEqual(suppliedSecret, triggerSecret)) {
    return response.status(401).json({
      error: "Unauthorized",
      request_id: requestId,
    });
  }

  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const repository = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  const workflow =
    process.env.PILOT_GITHUB_WORKFLOW || "routalk-pilot-bridge.yml";
  const ref = process.env.PILOT_GITHUB_REF || "main";

  if (
    !validRepositoryPart(owner) ||
    !validRepositoryPart(repository) ||
    !validWorkflow(workflow) ||
    !validRef(ref)
  ) {
    console.error("Invalid Pilot dispatch configuration", { requestId });
    return response.status(503).json({
      error: "Dispatch configuration is invalid",
      request_id: requestId,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  let githubResponse;

  try {
    githubResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "Content-Type": "application/json",
          "User-Agent": "routalk-pilot",
          "X-GitHub-Api-Version": "2022-11-28",
          "X-Pilot-Request-Id": requestId,
        },
        body: JSON.stringify({ ref }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    const timedOut = error && error.name === "AbortError";
    console.error("GitHub workflow dispatch request failed", {
      requestId,
      timedOut,
    });
    return response.status(502).json({
      error: timedOut
        ? "GitHub workflow dispatch timed out"
        : "GitHub workflow dispatch failed",
      request_id: requestId,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!githubResponse.ok) {
    console.error("GitHub workflow dispatch was rejected", {
      requestId,
      status: githubResponse.status,
    });
    return response.status(502).json({
      error: "GitHub workflow dispatch failed",
      status: githubResponse.status,
      request_id: requestId,
    });
  }

  return response.status(202).json({
    accepted: true,
    workflow,
    ref,
    request_id: requestId,
  });
};
