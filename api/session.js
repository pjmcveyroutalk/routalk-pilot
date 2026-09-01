const crypto = require("node:crypto");
const queueHandler = require("./queue");
const commandHandler = require("./command");
const mergeHandler = require("./merge");
const createProjectHandler = require("./create-project");
const provisionVercelProjectHandler = require("./provision-vercel-project");
const teardownProjectHandler = require("../lib/project-teardown");
const {
  clearSessionCookie,
  createSessionToken,
  isAuthenticated,
  setSessionCookie,
  verifySessionToken,
} = require("../lib/session-auth");

const DEVICE_HEADER = "x-pilot-device-session";

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

async function delegateAuthenticated(request, response, triggerSecret, action) {
  if (!hasValidSession(request, triggerSecret))
    return send(response, 401, crypto.randomUUID(), { error: "Unauthorized" });

  request.headers.authorization = `Bearer ${triggerSecret}`;

  if (action === "queue" && request.method === "POST") return queueHandler(request, response);
  if (action === "command" && request.method === "GET") return commandHandler(request, response);
  if (action === "merge" && request.method === "POST") return mergeHandler(request, response);
  if (action === "create-project" && request.method === "POST") return createProjectHandler(request, response);
  if (action === "provision-vercel-project" && request.method === "POST")
    return provisionVercelProjectHandler(request, response);
  if (action === "teardown-project" && request.method === "POST")
    return teardownProjectHandler(request, response);

  response.setHeader("Allow", action === "command" ? "GET" : "POST");
  return send(response, 405, crypto.randomUUID(), { error: "Method not allowed" });
}

module.exports = async function handler(request, response) {
  const requestId = crypto.randomUUID();
  setSecurityHeaders(response, requestId);

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  if (!triggerSecret)
    return send(response, 503, requestId, { error: "Pilot session is not configured" });

  const action = requestedAction(request);
  if (action) {
    if (!["queue", "command", "merge", "create-project", "provision-vercel-project", "teardown-project"].includes(action))
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
