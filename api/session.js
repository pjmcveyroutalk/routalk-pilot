const crypto = require("node:crypto");
const queueHandler = require("./queue");
const commandHandler = require("./command");
const mergeHandler = require("./merge");
const {
  clearSessionCookie,
  createSessionToken,
  isAuthenticated,
  setSessionCookie,
  verifySessionToken,
} = require("../lib/session-auth");

const DEVICE_HEADER = "x-pilot-device-session";
const MAX_INTELLIGENCE_MESSAGE_LENGTH = 12000;

function setSecurityHeaders(response, requestId) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Pilot-Request-Id", requestId);
}

function send(response, status, requestId, body) {
  return response.status(status).json({ ...body, request_id: requestId });
}

function requestedAction(request) {
  const value = Array.isArray(request.query?.action) ? request.query.action[0] : request.query?.action;
  return typeof value === "string" ? value : "";
}

function deviceSessionToken(request) {
  const value = request?.headers?.[DEVICE_HEADER];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function hasValidSession(request, triggerSecret) {
  if (isAuthenticated(request, triggerSecret)) return true;
  return verifySessionToken(deviceSessionToken(request), triggerSecret);
}

function extractOpenAIText(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim())
    return result.output_text.trim();

  const parts = [];
  for (const item of Array.isArray(result?.output) ? result.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string")
        parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function intelligenceHandler(request, response, requestId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    return send(response, 503, requestId, { error: "Pilot intelligence is not configured yet" });

  const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
  if (!message || message.length > MAX_INTELLIGENCE_MESSAGE_LENGTH)
    return send(response, 400, requestId, { error: "Message must be between 1 and 12,000 characters" });

  const model = process.env.PILOT_OPENAI_MODEL || "gpt-5.6";
  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: message,
        instructions:
          "You are Routalk Pilot's planning intelligence. Help the user reason about software work in concise mobile-friendly language. " +
          "Do not claim that code, files, pull requests, deployments, or external actions have happened. " +
          "Do not bypass Pilot's existing package review, explicit approval, merge, deployment, or production-verification lifecycle. " +
          "When a requested change is visual or affects an existing project, explicitly preserve unrelated design, routes, behavior, and functionality by default. " +
          "This action is conversation/planning only; execution remains governed by Pilot.",
      }),
    });
  } catch {
    return send(response, 502, requestId, { error: "Pilot could not reach OpenAI" });
  }

  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok)
    return send(response, 502, requestId, {
      error: result?.error?.message || "OpenAI request failed",
    });

  const text = extractOpenAIText(result);
  if (!text)
    return send(response, 502, requestId, { error: "Pilot received an empty intelligence response" });

  return send(response, 200, requestId, { ok: true, text, model });
}

async function delegateAuthenticated(request, response, triggerSecret, action) {
  const requestId = crypto.randomUUID();
  if (!hasValidSession(request, triggerSecret))
    return send(response, 401, requestId, { error: "Unauthorized" });

  request.headers.authorization = `Bearer ${triggerSecret}`;

  if (action === "queue" && request.method === "POST") return queueHandler(request, response);
  if (action === "command" && request.method === "GET") return commandHandler(request, response);
  if (action === "merge" && request.method === "POST") return mergeHandler(request, response);
  if (action === "intelligence" && request.method === "POST")
    return intelligenceHandler(request, response, requestId);

  response.setHeader("Allow", action === "command" ? "GET" : "POST");
  return send(response, 405, requestId, { error: "Method not allowed" });
}

module.exports = async function handler(request, response) {
  const requestId = crypto.randomUUID();
  setSecurityHeaders(response, requestId);

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  if (!triggerSecret)
    return send(response, 503, requestId, { error: "Pilot session is not configured" });

  const action = requestedAction(request);
  if (action) {
    if (!["queue", "command", "merge", "intelligence"].includes(action))
      return send(response, 400, requestId, { error: "Invalid session action" });
    return delegateAuthenticated(request, response, triggerSecret, action);
  }

  if (request.method === "POST") {
    if (!isAuthenticated(request, triggerSecret))
      return send(response, 401, requestId, { error: "Unauthorized" });

    const deviceSession = createSessionToken(triggerSecret);
    setSessionCookie(response, triggerSecret);
    return send(response, 200, requestId, {
      authenticated: true,
      session_created: true,
      device_session: deviceSession,
    });
  }

  if (request.method === "GET")
    return send(response, 200, requestId, {
      authenticated: hasValidSession(request, triggerSecret),
    });

  if (request.method === "DELETE") {
    clearSessionCookie(response);
    return send(response, 200, requestId, {
      authenticated: false,
      session_cleared: true,
    });
  }

  response.setHeader("Allow", "GET, POST, DELETE");
  return send(response, 405, requestId, { error: "Method not allowed" });
};
