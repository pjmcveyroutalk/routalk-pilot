const crypto = require("node:crypto");
const projects = require("../config/projects");

const READINESS_STATUS = Object.freeze({ READY: "READY", BLOCKED: "BLOCKED" });
const VERIFIER_BOOTSTRAP_PATH = "api/pilot-verify-production.js";
const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 10_000;

function safeEqual(a, b) {
  const x = Buffer.from(a || "");
  const y = Buffer.from(b || "");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(body);
}
function blocked(repository, reason, message, nextAction, details = {}) {
  return { ready: false, status: READINESS_STATUS.BLOCKED, repository, reason, message, next_action: nextAction, retryable: true, ...details };
}
function registryReadiness(repository) {
  const project = projects[repository];
  if (!project || project.role !== "target") {
    return blocked(repository, "PROJECT_NOT_REGISTERED",
      "Project is not ready for Pilot: register this repository in Pilot first.",
      "REGISTER_PROJECT",
      { checks: { registration: "BLOCKED", target_repository: "NOT_CHECKED", production_verifier: "NOT_CHECKED" } });
  }
  const verifier = project.production_verifier || null;
  if (!verifier?.url || verifier.auth !== "vercel_oidc") {
    return blocked(repository, "REGISTER_PRODUCTION_VERIFIER",
      "Project is registered, but its production verifier is not ready yet.",
      "BOOTSTRAP_PRODUCTION_VERIFIER",
      {
        registered: true,
        production_verifier: verifier ? { configured: true, auth: verifier.auth, url: verifier.url } : { configured: false },
        verifier_bootstrap: { allowed: true, action: "apply", paths: [VERIFIER_BOOTSTRAP_PATH] },
        checks: { registration: "PASS", target_repository: "NOT_CHECKED", production_verifier: "BLOCKED" }
      });
  }
  return {
    ready: true, status: READINESS_STATUS.READY, repository, registered: true,
    production_verifier: { configured: true, auth: verifier.auth, url: verifier.url },
    checks: { registration: "PASS", target_repository: "NOT_CHECKED", production_verifier: "PASS" },
    next: "READY_FOR_PILOT", next_action: "QUEUE_BUILD", retryable: false
  };
}
function validRepository(repository) {
  return /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repository || "");
}
function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "routalk-pilot",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}
async function githubGet(url, token, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { method: "GET", headers: githubHeaders(token), signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, timed_out: error?.name === "AbortError" };
  } finally { clearTimeout(timeout); }
}
async function targetRepositoryReadiness(repository, token, fetchImpl = fetch) {
  if (!token) {
    return blocked(repository, "TARGET_ACCESS_NOT_CONFIGURED",
      "Project is not ready for Pilot: target repository access is not configured.",
      "AUTHORIZE_TARGET_REPOSITORY",
      { checks: { target_repository: "BLOCKED" } });
  }
  if (!validRepository(repository)) {
    return blocked(repository, "TARGET_REPO_CHECK_FAILED",
      "Pilot could not verify target repository access.",
      "RETRY_PROJECT_PREFLIGHT",
      { checks: { target_repository: "BLOCKED" } });
  }
  const encodedRepository = repository.split("/").map(encodeURIComponent).join("/");
  const repoResult = await githubGet(`${GITHUB_API}/repos/${encodedRepository}`, token, fetchImpl);
  if ([401, 403, 404].includes(repoResult.status)) {
    return blocked(repository, "TARGET_REPO_NOT_ACCESSIBLE",
      "Project is not ready for Pilot: target repository access is missing. Add this repository to Pilot's target GitHub credential, then retry.",
      "AUTHORIZE_TARGET_REPOSITORY",
      { checks: { target_repository: "BLOCKED" }, provider_status: repoResult.status });
  }
  if (!repoResult.ok) {
    return blocked(repository, "TARGET_REPO_CHECK_FAILED",
      "Pilot could not verify target repository access. Try the preflight again before submitting a build.",
      "RETRY_PROJECT_PREFLIGHT",
      { checks: { target_repository: "BLOCKED" }, provider_status: repoResult.status });
  }
  const defaultBranch = typeof repoResult.data?.default_branch === "string" && repoResult.data.default_branch.trim()
    ? repoResult.data.default_branch.trim() : "main";
  const branchResult = await githubGet(
    `${GITHUB_API}/repos/${encodedRepository}/branches/${encodeURIComponent(defaultBranch)}`,
    token, fetchImpl);
  if (branchResult.status === 404) {
    return blocked(repository, "INITIALIZE_MAIN",
      `Project is not ready for Pilot: initialize the repository's ${defaultBranch} branch first.`,
      "INITIALIZE_MAIN",
      { default_branch: defaultBranch, checks: { target_repository: "PASS", main_branch: "BLOCKED" } });
  }
  if (!branchResult.ok) {
    return blocked(repository, "TARGET_REPO_CHECK_FAILED",
      "Pilot could not verify the target repository's default branch. Try the preflight again before submitting a build.",
      "RETRY_PROJECT_PREFLIGHT",
      { default_branch: defaultBranch, checks: { target_repository: "PASS", main_branch: "BLOCKED" }, provider_status: branchResult.status });
  }
  return {
    ready: true, status: READINESS_STATUS.READY, repository, default_branch: defaultBranch,
    checks: { target_repository: "PASS", main_branch: "PASS" }, retryable: false
  };
}
async function checkProjectReadiness(repository, targetToken, options = {}) {
  const registry = registryReadiness(repository);
  if (registry.reason === "PROJECT_NOT_REGISTERED") return registry;
  const access = await targetRepositoryReadiness(repository, targetToken, options.fetchImpl || fetch);
  if (!access.ready) {
    return {
      ...access, registered: true,
      production_verifier: registry.production_verifier,
      verifier_bootstrap: registry.verifier_bootstrap,
      checks: {
        registration: "PASS",
        ...(access.checks || {}),
        production_verifier: registry.checks?.production_verifier || "NOT_CHECKED"
      }
    };
  }
  return {
    ...registry, default_branch: access.default_branch,
    checks: { ...(registry.checks || {}), target_repository: "PASS", main_branch: "PASS" }
  };
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }
  const trigger = process.env.PILOT_TRIGGER_SECRET;
  const auth = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!trigger || !safeEqual(auth, trigger)) return send(res, 401, { error: "Unauthorized" });
  const repository = String(req.body?.repository || "");
  const targetToken = process.env.PILOT_TARGET_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
  const readiness = await checkProjectReadiness(repository, targetToken);
  return send(res, readiness.ready ? 200 : 400, readiness);
};
module.exports._test = {
  READINESS_STATUS, VERIFIER_BOOTSTRAP_PATH, registryReadiness, targetRepositoryReadiness, checkProjectReadiness
};
