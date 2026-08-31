const MAX_MESSAGE_LENGTH = 12000;

function json(response, status, body) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.json(body);
}

function deviceSessionToken(request) {
  const value = request.headers["x-pilot-device-session"];
  return Array.isArray(value) ? value[0] : value || "";
}

async function pilotSessionAuthenticated(request) {
  const host = request.headers.host;
  if (!host) return false;
  const protocol = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const sessionUrl = `${protocol}://${host}/api/session`;
  const headers = {};
  const cookie = request.headers.cookie;
  if (cookie) headers.Cookie = cookie;
  const token = deviceSessionToken(request);
  if (token) headers["X-Pilot-Device-Session"] = token;

  const result = await fetch(sessionUrl, {
    method: "GET",
    headers,
    cache: "no-store"
  });
  if (!result.ok) return false;
  const body = await result.json().catch(() => ({}));
  return body.authenticated === true;
}

function extractOutputText(result) {
  if (typeof result.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }
  const parts = [];
  for (const item of Array.isArray(result.output) ? result.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  if (!(await pilotSessionAuthenticated(request))) {
    return json(response, 401, { error: "Pilot is locked." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(response, 503, { error: "Pilot intelligence is not configured yet." });
  }

  const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return json(response, 400, { error: "Message must be between 1 and 12,000 characters." });
  }

  const model = process.env.PILOT_OPENAI_MODEL || "gpt-5.6";
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: message,
      instructions:
        "You are Routalk Pilot's planning intelligence. Help the user reason about software work in concise mobile-friendly language. " +
        "Do not claim that code, files, pull requests, deployments, or external actions have happened. " +
        "Do not bypass Pilot's existing package review, explicit approval, merge, deployment, or production-verification lifecycle. " +
        "When a requested change is visual or affects an existing project, explicitly preserve unrelated design, routes, behavior, and functionality by default. " +
        "This endpoint is conversation/planning only; execution remains governed by Pilot."
    })
  });

  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = result?.error?.message || "OpenAI request failed.";
    return json(response, 502, { error: message });
  }

  const text = extractOutputText(result);
  if (!text) return json(response, 502, { error: "Pilot received an empty intelligence response." });
  return json(response, 200, { ok: true, text, model });
}
