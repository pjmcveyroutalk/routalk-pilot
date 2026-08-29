const crypto = require("node:crypto");
const PROJECTS = require("../config/projects");
const { COMMAND_STATES } = require("../lib/command-state");
const {
  createGithubIssueCommandStore,
} = require("../lib/stores/github-issue-command-store");

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 10_000;
const PRODUCTION_VERIFY_TIMEOUT_MS = 8_000;
const DEFAULT_TARGET_REPOSITORY = "pjmcveyroutalk/routalk-pilot";

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

function validRepository(value) {
  if (typeof value !== "string") return false;
  const parts = value.split("/");
  return (
    parts.length === 2 &&
    validRepositoryPart(parts[0]) &&
    validRepositoryPart(parts[1])
  );
}

function configuredTargetRepositories() {
  const configured = process.env.PILOT_TARGET_REPOSITORIES || "";
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(validRepository);
}

function registeredTargetRepositories() {
  return Object.keys(PROJECTS).filter(validRepository);
}

function allowedTargetRepositories() {
  return [
    ...new Set([
      DEFAULT_TARGET_REPOSITORY,
      ...registeredTargetRepositories(),
      ...configuredTargetRepositories(),
    ]),
  ];
}

function validCommandId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value || "");
}

function validSha(value) {
  return /^[a-f0-9]{40}$/i.test(value || "");
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

async function observeDeployment(baseUrl, token, revision) {
  if (!validSha(revision)) {
    return { checked: false, state: "UNKNOWN", ready: false };
  }

  const result = await github(`${baseUrl}/commits/${revision}/status`, token);
  if (!result.ok) {
    return {
      checked: true,
      state: "UNKNOWN",
      ready: false,
      http_status: result.status,
    };
  }

  const statuses = Array.isArray(result.data.statuses) ? result.data.statuses : [];
  const deploymentStatuses = statuses.filter((status) => {
    if (!status || typeof status.context !== "string" || !status.context.trim()) return false;
    if (typeof status.target_url !== "string" || !status.target_url.trim()) return false;
    try {
      return new URL(status.target_url).protocol === "https:";
    } catch {
      return false;
    }
  });
  const successful = deploymentStatuses.find((status) => status.state === "success");
  const pending = deploymentStatuses.find(
    (status) => status.state === "pending" || status.state === "expected",
  );
  const failed = deploymentStatuses.find(
    (status) => status.state === "failure" || status.state === "error",
  );
  const observed = failed || pending || successful || deploymentStatuses[0] || null;

  return {
    checked: true,
    state: observed?.state || "UNKNOWN",
    ready: Boolean(successful) && !failed && !pending,
    context: observed?.context || null,
    target_url: observed?.target_url || null,
    observed_at: new Date().toISOString(),
  };
}

function validVerifierUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function registeredVerifier(repository) {
  const config = PROJECTS[repository]?.production_verifier;
  if (
    !config ||
    typeof config !== "object" ||
    !validVerifierUrl(config.url) ||
    config.auth !== "vercel_oidc"
  ) {
    return null;
  }

  return {
    url: new URL(config.url).toString(),
    auth: "vercel_oidc",
  };
}

function parseExternalVerifiers() {
  const raw = process.env.PILOT_TARGET_PRODUCTION_VERIFIERS || "";
  if (!raw.trim()) return new Map();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Map();
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return new Map();
  }

  const result = new Map();
  for (const [repository, config] of Object.entries(parsed)) {
    if (
      !validRepository(repository) ||
      !config ||
      typeof config !== "object" ||
      typeof config.url !== "string" ||
      typeof config.secret_env !== "string"
    ) {
      continue;
    }

    if (
      !validVerifierUrl(config.url) ||
      !/^[A-Z][A-Z0-9_]{2,120}$/.test(config.secret_env)
    ) {
      continue;
    }

    result.set(repository, {
      url: new URL(config.url).toString(),
      auth: "shared_secret",
      secretEnv: config.secret_env,
    });
  }

  return result;
}

function verifierForRepository(repository) {
  return registeredVerifier(repository) || parseExternalVerifiers().get(repository) || null;
}

function runtimeOidcToken() {
  const token = process.env.VERCEL_OIDC_TOKEN || "";
  return typeof token === "string" ? token.trim() : "";
}

async function verifyConfiguredTarget(repository, expectedRevision) {
  const config = verifierForRepository(repository);
  if (!config) {
    return {
      checked: false,
      ready: false,
      revision_match: false,
      expected_revision: expectedRevision || null,
      observed_revision: null,
      state: "TARGET_VERIFICATION_NOT_CONFIGURED",
      verified_at: null,
    };
  }

  let authorization;
  if (config.auth === "vercel_oidc") {
    const oidcToken = runtimeOidcToken();
    if (!oidcToken) {
      return {
        checked: false,
        ready: false,
        revision_match: false,
        expected_revision: expectedRevision || null,
        observed_revision: null,
        state: "TARGET_OIDC_TOKEN_MISSING",
        verified_at: null,
      };
    }
    authorization = `Bearer ${oidcToken}`;
  } else {
    const secret = process.env[config.secretEnv] || "";
    if (!secret) {
      return {
        checked: false,
        ready: false,
        revision_match: false,
        expected_revision: expectedRevision || null,
        observed_revision: null,
        state: "TARGET_VERIFICATION_SECRET_MISSING",
        verified_at: null,
      };
    }
    authorization = `Bearer ${secret}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRODUCTION_VERIFY_TIMEOUT_MS);

  try {
    const target = new URL(config.url);
    if (validSha(expectedRevision)) {
      target.searchParams.set("expected_revision", expectedRevision);
    }

    const result = await fetch(target, {
      method: "GET",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    const data = await result.json().catch(() => ({}));

    return {
      checked: true,
      ready:
        result.ok &&
        data.state === "READY" &&
        data.revision_match === true,
      revision_match: data.revision_match === true,
      expected_revision: data.expected_revision || expectedRevision || null,
      observed_revision: data.observed_revision || null,
      state: data.state || (result.ok ? "UNKNOWN" : "FAILED"),
      http_status: result.status,
      verified_at: data.verified_at || new Date().toISOString(),
    };
  } catch (error) {
    return {
      checked: true,
      ready: false,
      revision_match: false,
      expected_revision: expectedRevision || null,
      observed_revision: null,
      state: error?.name === "AbortError" ? "TIMEOUT" : "FAILED",
      verified_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyControlProduction(request, triggerSecret, expectedRevision) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRODUCTION_VERIFY_TIMEOUT_MS);

  try {
    const forwardedHost = String(request.headers["x-forwarded-host"] || "")
      .split(",")[0]
      .trim();
    const host =
      forwardedHost || String(request.headers.host || "").split(",")[0].trim();
    const forwardedProto = String(request.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim();
    const protocol = forwardedProto === "http" ? "http" : "https";

    if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) {
      return {
        checked: true,
        ready: false,
        revision_match: false,
        state: "INVALID_ORIGIN",
        verified_at: new Date().toISOString(),
      };
    }

    const query = validSha(expectedRevision)
      ? `?expected_revision=${encodeURIComponent(expectedRevision)}`
      : "";
    const target = `${protocol}://${host}/api/verify-production${query}`;

    const result = await fetch(target, {
      method: "GET",
      headers: { Authorization: `Bearer ${triggerSecret}` },
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await result.json().catch(() => ({}));

    return {
      checked: true,
      ready:
        result.ok &&
        data.state === "READY" &&
        data.revision_match === true,
      revision_match: data.revision_match === true,
      expected_revision: data.expected_revision || expectedRevision || null,
      observed_revision: data.observed_revision || null,
      state: data.state || (result.ok ? "UNKNOWN" : "FAILED"),
      http_status: result.status,
      verified_at: data.verified_at || new Date().toISOString(),
    };
  } catch (error) {
    return {
      checked: true,
      ready: false,
      revision_match: false,
      expected_revision: expectedRevision || null,
      observed_revision: null,
      state: error?.name === "AbortError" ? "TIMEOUT" : "FAILED",
      verified_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isTerminalQueueFailure(queueRecord) {
  return (
    queueRecord?.state === "closed" &&
    queueRecord?.state_reason === "not_planned"
  );
}

function deriveState(queueRecord, pullRequest, deployment, verification) {
  if (!queueRecord) return null;
  if (queueRecord.state === "open") return COMMAND_STATES.QUEUED;
  if (isTerminalQueueFailure(queueRecord)) return COMMAND_STATES.FAILED;
  if (!pullRequest) return COMMAND_STATES.RUNNING;

  if (pullRequest.merged_at) {
    return deployment?.ready &&
      verification?.ready &&
      verification?.revision_match
      ? COMMAND_STATES.COMPLETED
      : COMMAND_STATES.MERGED;
  }

  if (pullRequest.state === "open") return COMMAND_STATES.AWAITING_APPROVAL;
  return COMMAND_STATES.FAILED;
}

function createStore(repository, githubToken) {
  return createGithubIssueCommandStore({
    baseUrl: `${GITHUB_API}/repos/${repository}`,
    githubToken,
    githubRequest: github,
  });
}

async function findPullRequestAcrossTargets(commandId, githubToken) {
  for (const repository of allowedTargetRepositories()) {
    const store = createStore(repository, githubToken);
    const pullRequest = await store.findPullRequestByCommandId(commandId);
    if (pullRequest) return { repository, pullRequest };
  }
  return { repository: null, pullRequest: null };
}

module.exports = async function handler(request, response) {
  const requestId = crypto.randomUUID();
  setSecurityHeaders(response, requestId);

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response
      .status(405)
      .json({ error: "Method not allowed", request_id: requestId });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const githubToken = process.env.PILOT_GITHUB_TOKEN;
  if (!triggerSecret || !githubToken) {
    return response.status(503).json({
      error: "Command lookup is not configured",
      request_id: requestId,
    });
  }

  const authorization = request.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!safeEqual(suppliedSecret, triggerSecret)) {
    return response
      .status(401)
      .json({ error: "Unauthorized", request_id: requestId });
  }

  const commandIdValue = Array.isArray(request.query.command_id)
    ? request.query.command_id[0]
    : request.query.command_id;
  const commandId =
    typeof commandIdValue === "string" ? commandIdValue : "";
  if (!validCommandId(commandId)) {
    return response
      .status(400)
      .json({ error: "Invalid command_id", request_id: requestId });
  }

  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const repository = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  if (!validRepositoryPart(owner) || !validRepositoryPart(repository)) {
    return response.status(503).json({
      error: "Command lookup configuration is invalid",
      request_id: requestId,
    });
  }

  const controlRepository = `${owner}/${repository}`;
  const controlStore = createStore(controlRepository, githubToken);

  let queueRecord;
  let targetRepository;
  let pullRequest;
  try {
    queueRecord = await controlStore.findByCommandId(commandId);
    const found = await findPullRequestAcrossTargets(commandId, githubToken);
    targetRepository = found.repository;
    pullRequest = found.pullRequest;
  } catch (error) {
    console.error("Pilot command lookup failed", {
      requestId,
      code: error.code,
    });
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

  const mergedRevision = pullRequest?.merge_commit_sha || null;
  let deploymentObservation = null;
  let productionVerification = null;

  if (pullRequest?.merged_at && targetRepository) {
    const targetBaseUrl = `${GITHUB_API}/repos/${targetRepository}`;
    deploymentObservation = await observeDeployment(
      targetBaseUrl,
      githubToken,
      mergedRevision,
    );

    productionVerification =
      targetRepository === controlRepository
        ? await verifyControlProduction(request, triggerSecret, mergedRevision)
        : await verifyConfiguredTarget(targetRepository, mergedRevision);
  }

  const state = deriveState(
    queueRecord,
    pullRequest,
    deploymentObservation,
    productionVerification,
  );

  return response.status(200).json({
    command_id: commandId,
    repository: targetRepository,
    state,
    state_source: "pilot_command_model",
    storage: {
      adapter: controlStore.name,
      record: queueRecord.number,
      processed: queueRecord.state === "closed",
      terminal: isTerminalQueueFailure(queueRecord),
      state_reason: queueRecord.state_reason || null,
      created_at: queueRecord.created_at,
      updated_at: queueRecord.updated_at,
    },
    pull_request: pullRequest
      ? {
          repository: targetRepository,
          number: pullRequest.number,
          title: pullRequest.title,
          state: pullRequest.state,
          merged: Boolean(pullRequest.merged_at),
          merge_commit_sha: mergedRevision,
          html_url: pullRequest.html_url,
          created_at: pullRequest.created_at,
          updated_at: pullRequest.updated_at,
        }
      : null,
    deployment_observation: deploymentObservation,
    production_verification: productionVerification,
    request_id: requestId,
  });
};

module.exports._test = {
  allowedTargetRepositories,
  deriveState,
  isTerminalQueueFailure,
  observeDeployment,
  parseExternalVerifiers,
  registeredVerifier,
  runtimeOidcToken,
  validCommandId,
  validRepository,
  validSha,
  verifierForRepository,
};
