const DEFAULT_PRODUCTION_URL = "https://routalk-pilot.vercel.app";

function envConfig() {
  return {
    token: process.env.VERCEL_TOKEN || "",
    projectId: process.env.VERCEL_PROJECT_ID || "",
    productionUrl:
      process.env.PILOT_PRODUCTION_URL ||
      process.env.PRODUCTION_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      DEFAULT_PRODUCTION_URL
  };
}

async function request(path, init = {}) {
  const { token } = envConfig();
  if (!token) return { ok: false, status: null, error: "missing_vercel_token", body: null };
  try {
    const response = await fetch(`https://api.vercel.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {})
      },
      cache: "no-store"
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : (body?.error?.code || body?.error?.message || `vercel_http_${response.status}`),
      body
    };
  } catch (error) {
    return { ok: false, status: null, error: error?.message || "vercel_request_failed", body: null };
  }
}

async function requireRequest(path, init = {}) {
  const result = await request(path, init);
  if (!result.ok) {
    const error = new Error(result.error || "vercel_request_failed");
    error.status = result.status;
    throw error;
  }
  return result.body;
}

async function inspectProjectAccess() {
  const config = envConfig();
  if (!config.projectId) return { ok: false, status: null, error: "missing_vercel_project_id" };
  const result = await request(`/v9/projects/${encodeURIComponent(config.projectId)}`);
  return { ok: result.ok, status: result.status, error: result.error };
}

async function getProject() {
  const { projectId } = envConfig();
  if (!projectId) throw new Error("missing_vercel_project_id");
  return requireRequest(`/v9/projects/${encodeURIComponent(projectId)}`);
}

async function waitForDeployment(id, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const deployment = await requireRequest(`/v13/deployments/${encodeURIComponent(id)}`);
    const state = deployment.readyState || deployment.status;
    if (state === "READY") return deployment;
    if (state === "ERROR" || state === "CANCELED") throw new Error(`deployment_${String(state).toLowerCase()}`);
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  throw new Error("deployment_wait_timeout");
}

async function deployProduction(requestInput) {
  const project = await getProject();
  const repoId = project?.link?.repoId;
  if (!repoId) throw new Error("vercel_project_missing_github_repo_id");
  const { projectId } = envConfig();
  const created = await requireRequest("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: project.name || "routalk-pilot",
      project: projectId,
      target: "production",
      gitSource: { type: "github", repoId, ref: "main", sha: requestInput.sourceRevision },
      meta: {
        pilotLiveProviderProof: requestInput.releaseCandidateId,
        pilotSourceRevision: requestInput.sourceRevision
      }
    })
  });
  const deploymentId = created.id || created.uid;
  if (!deploymentId) throw new Error("vercel_deployment_missing_id");
  const ready = await waitForDeployment(deploymentId);
  return {
    deploymentId,
    status: "DEPLOYED",
    evidence: { providerReadyState: ready.readyState || ready.status || null, createdAt: ready.createdAt || null }
  };
}

async function observeProduction({ deploymentId, expectedRevision }) {
  const deployment = await requireRequest(`/v13/deployments/${encodeURIComponent(deploymentId)}`);
  const observedRevision =
    deployment?.meta?.githubCommitSha ||
    deployment?.gitSource?.sha ||
    deployment?.meta?.pilotSourceRevision ||
    null;
  const target = envConfig().productionUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let status = "FAILED", httpStatus = null;
  try {
    const response = await fetch(target.replace(/\/+$/, "") + "/", {
      method: "GET", redirect: "follow", cache: "no-store", signal: controller.signal
    });
    httpStatus = response.status;
    const body = await response.text();
    if (response.ok && body.includes("<title>Routalk Pilot</title>") && body.includes("Routalk Pilot")) status = "PASSED";
  } finally { clearTimeout(timeout); }
  return {
    observedRevision,
    expectedRevision,
    healthChecks: [{ id: "canonical-production-root", required: true, status, httpStatus }]
  };
}

function sanitizedStatus() {
  const config = envConfig();
  return {
    provider: "vercel",
    providerSubsystem: "v1",
    configured: {
      token: Boolean(config.token),
      project: Boolean(config.projectId),
      productionUrl: Boolean(config.productionUrl)
    }
  };
}

module.exports = {
  envConfig,
  inspectProjectAccess,
  deployProduction,
  observeProduction,
  sanitizedStatus
};
