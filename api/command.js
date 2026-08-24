const crypto = require("node:crypto");
const { COMMAND_STATES } = require("../lib/command-state");
const {
  createGithubIssueCommandStore,
} = require("../lib/stores/github-issue-command-store");

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 10_000;
const PRODUCTION_VERIFY_TIMEOUT_MS = 8_000;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function setSecurityHeaders(response, requestId) {
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

function validCommandId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value || "");
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "routalk-pilot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function github(url, token, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    const result = await fetch(url, {
      ...options,
      headers: { ...githubHeaders(token), ...(options.headers || {}) },
      signal: controller.signal,
    });
    const data = await result.json().catch(() => ({}));
    return { ok: result.ok, status: result.status, data };
  } catch (error) {
    return { ok: false, status: 0, timedOut: error?.name === "AbortError" };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyProduction(request, triggerSecret) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRODUCTION_VERIFY_TIMEOUT_MS);

  try {
    const protocol = request.headers["x-forwarded-proto"] || "https";
    const host = request.headers["x-forwarded-host"] || request.headers.host;
    const target = `${protocol}://${host}/api/verify-production`;

    const result = await fetch(target, {
      method: "GET",
      headers: { Authorization: `Bearer ${triggerSecret}` },
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await result.json().catch(() => ({}));

    return {
      checked: true,
      ready: result.ok && data.state === "READY",
      state: data.state || (result.ok ? "UNKNOWN" : "FAILED"),
      http_status: result.status,
      verified_at: data.verified_at || new Date().toISOString(),
    };
  } catch (error) {
    return {
      checked: true,
      ready: false,
      state: error?.name === "AbortError" ? "TIMEOUT" : "FAILED",
      verified_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function deriveState(queueRecord, pullRequest, productionVerification = null) {
  if (!queueRecord) return null;
  if (queueRecord.state === "open") return COMMAND_STATES.QUEUED;
  if (!pullRequest) return COMMAND_STATES.RUNNING;

  if (pullRequest.merged_at) {
    return productionVerification?.ready
      ? COMMAND_STATES.COMPLETED
      : COMMAND_STATES.MERGED;
  }

  if (pullRequest.state === "open") return COMMAND_STATES.AWAITING_APPROVAL;
  return COMMAND_STATES.COMPLETED;
}

module.exports = async function handler(request, response) {
  const requestId = crypto.randomUUID();
  setSecurityHeaders(response, requestId);

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed", request_id: requestId });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const githubToken = process.env.PILOT_GITHUB_TOKEN;
  if (!triggerSecret || !githubToken) {
    return response.status(503).json({ error: "Command lookup is not configured", request_id: requestId });
  }

  const authorization = request.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!safeEqual(suppliedSecret, triggerSecret)) {
    return response.status(401).json({ error: "Unauthorized", request_id: requestId });
  }

  const commandIdValue = Array.isArray(request.query.command_id)
    ? request.query.command_id[0]
    : request.query.command_id;
  const commandId = typeof commandIdValue === "string" ? commandIdValue : "";
  if (!validCommandId(commandId)) {
    return response.status(400).json({ error: "Invalid command_id", request_id: requestId });
  }

  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const repository = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  if (!validRepositoryPart(owner) || !validRepositoryPart(repository)) {
    return response.status(503).json({ error: "Command lookup configuration is invalid", request_id: requestId });
  }

  const baseUrl = `${GITHUB_API}/repos/${owner}/${repository}`;
  const store = createGithubIssueCommandStore({ baseUrl, githubToken, githubRequest: github });

  let queueRecord;
  let pullRequest;
  try {
    [queueRecord, pullRequest] = await Promise.all([
      store.findByCommandId(commandId),
      store.findPullRequestByCommandId(commandId),
    ]);
  } catch (error) {
    console.error("Pilot command lookup failed", { requestId, code: error.code });
    return response.status(error.timedOut ? 504 : 502).json({
      error: error.message || "Command lookup failed",
      request_id: requestId,
    });
  }

  if (!queueRecord) {
    return response.status(404).json({
      error: "Command not found",
      command_id: commandId,
      request_id: requestId,
    });
  }

  let productionVerification = null;
  if (pullRequest?.merged_at) {
    productionVerification = await verifyProduction(request, triggerSecret);
  }

  const state = deriveState(queueRecord, pullRequest, productionVerification);

  return response.status(200).json({
    command_id: commandId,
    state,
    state_source: "pilot_command_model",
    storage: {
      adapter: store.name,
      record: queueRecord.number,
      processed: queueRecord.state === "closed",
      created_at: queueRecord.created_at,
      updated_at: queueRecord.updated_at,
    },
    pull_request: pullRequest
      ? {
          number: pullRequest.number,
          title: pullRequest.title,
          state: pullRequest.state,
          merged: Boolean(pullRequest.merged_at),
          html_url: pullRequest.html_url,
          created_at: pullRequest.created_at,
          updated_at: pullRequest.updated_at,
        }
      : null,
    production_verification: productionVerification,
    request_id: requestId,
  });
};

module.exports._test = { deriveState, validCommandId };
