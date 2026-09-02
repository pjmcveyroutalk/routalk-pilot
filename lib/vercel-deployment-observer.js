const VERCEL_API = "https://api.vercel.com";
const TIMEOUT_MS = 12000;
const MAX_DEPLOYMENT_DETAILS = 25;

function validSha(value) {
  return /^[a-f0-9]{40}$/i.test(value || "");
}

function validDeploymentId(value) {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value || "");
}

async function vercel(path, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${VERCEL_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      timed_out: error?.name === "AbortError",
      data: {},
    };
  } finally {
    clearTimeout(timeout);
  }
}

function deploymentSha(deployment) {
  const meta = deployment?.meta || {};
  return String(
    meta.githubCommitSha ||
    meta.githubCommitSHA ||
    deployment?.gitSource?.sha ||
    ""
  ).trim();
}

function normalize(deployment, expectedSha = "") {
  const sha = deploymentSha(deployment);
  return {
    id: deployment?.uid || deployment?.id || null,
    url: deployment?.url ? `https://${deployment.url}` : null,
    ready_state: deployment?.readyState || deployment?.state || null,
    target: deployment?.target || null,
    git_sha: sha || null,
    revision_match:
      validSha(expectedSha) &&
      Boolean(sha) &&
      sha.toLowerCase() === expectedSha.toLowerCase(),
    created_at: deployment?.createdAt || deployment?.created || null,
  };
}

async function resolveProjectId(projectIdOrName, token, teamId) {
  if (!projectIdOrName || !token || !teamId) {
    return { ok: false, state: "INVALID_OBSERVER_INPUT" };
  }

  if (String(projectIdOrName).startsWith("prj_")) {
    return { ok: true, project_id: String(projectIdOrName), resolved: false };
  }

  const result = await vercel(
    `/v9/projects/${encodeURIComponent(projectIdOrName)}?teamId=${encodeURIComponent(teamId)}`,
    token,
  );

  if (!result.ok) {
    return {
      ok: false,
      state: result.timed_out ? "VERCEL_TIMEOUT" : "VERCEL_PROJECT_LOOKUP_FAILED",
      http_status: result.status || null,
    };
  }

  const resolved = String(result.data?.id || "").trim();
  if (!resolved) {
    return {
      ok: false,
      state: "VERCEL_PROJECT_ID_MISSING",
      http_status: result.status || null,
    };
  }

  return { ok: true, project_id: resolved, resolved: true };
}

async function deploymentDetails(deployment, token, teamId) {
  const id = deployment?.uid || deployment?.id || "";
  if (!validDeploymentId(id)) return null;

  const result = await vercel(
    `/v13/deployments/${encodeURIComponent(id)}?withGitRepoInfo=true&teamId=${encodeURIComponent(teamId)}`,
    token,
  );

  return result.ok ? result.data : null;
}

async function hydrateMissingRevision(deployments, expectedSha, token, teamId) {
  const hydrated = [];

  for (const item of deployments.slice(0, MAX_DEPLOYMENT_DETAILS)) {
    let candidate = item;

    if (!deploymentSha(candidate)) {
      const details = await deploymentDetails(candidate, token, teamId);
      if (details) candidate = { ...item, ...details };
    }

    hydrated.push(normalize(candidate, expectedSha));
  }

  return hydrated;
}

async function observeDeploymentById({ deploymentId, token, teamId }) {
  if (!validDeploymentId(deploymentId) || !token || !teamId) {
    return {
      checked: false,
      state: "INVALID_OBSERVER_INPUT",
      ready: false,
      revision_match: false,
    };
  }

  const result = await vercel(
    `/v13/deployments/${encodeURIComponent(deploymentId)}?withGitRepoInfo=true&teamId=${encodeURIComponent(teamId)}`,
    token,
  );

  if (!result.ok) {
    return {
      checked: true,
      state: result.timed_out ? "VERCEL_TIMEOUT" : "VERCEL_LOOKUP_FAILED",
      ready: false,
      revision_match: false,
      http_status: result.status || null,
      deployment_id: deploymentId,
    };
  }

  const selected = normalize(result.data);
  return {
    checked: true,
    state:
      selected.ready_state === "READY"
        ? "DEPLOYMENT_READY"
        : `DEPLOYMENT_${selected.ready_state || "UNKNOWN"}`,
    ready: selected.ready_state === "READY",
    revision_match: null,
    observed_revision: selected.git_sha,
    deployment: selected,
    observed_at: new Date().toISOString(),
  };
}

async function observeDeploymentByRevision({
  projectId,
  revision,
  token,
  teamId,
}) {
  if (!projectId || !validSha(revision) || !token || !teamId) {
    return {
      checked: false,
      state: "INVALID_OBSERVER_INPUT",
      ready: false,
      revision_match: false,
    };
  }

  const project = await resolveProjectId(projectId, token, teamId);
  if (!project.ok) {
    return {
      checked: true,
      state: project.state,
      ready: false,
      revision_match: false,
      http_status: project.http_status || null,
      project_identifier: projectId,
    };
  }

  const params = new URLSearchParams({
    projectId: project.project_id,
    teamId,
    target: "production",
    limit: "100",
  });

  const result = await vercel(`/v6/deployments?${params.toString()}`, token);
  if (!result.ok) {
    return {
      checked: true,
      state: result.timed_out ? "VERCEL_TIMEOUT" : "VERCEL_LOOKUP_FAILED",
      ready: false,
      revision_match: false,
      http_status: result.status || null,
      project_id: project.project_id,
    };
  }

  const deployments = Array.isArray(result.data?.deployments)
    ? result.data.deployments
    : [];

  const normalized = await hydrateMissingRevision(
    deployments,
    revision,
    token,
    teamId,
  );

  const matches = normalized
    .filter((item) => item.revision_match)
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));

  if (!matches.length) {
    return {
      checked: true,
      state: "WAITING_FOR_DEPLOYMENT",
      ready: false,
      revision_match: false,
      expected_revision: revision,
      project_id: project.project_id,
      project_identifier: projectId,
      deployments_examined: normalized.length,
      deployments_with_revision: normalized.filter((item) => item.git_sha).length,
      matching_deployments: [],
    };
  }

  const selected =
    matches.find((item) => item.ready_state === "READY") || matches[0];

  return {
    checked: true,
    state:
      selected.ready_state === "READY"
        ? "DEPLOYMENT_READY"
        : `DEPLOYMENT_${selected.ready_state || "UNKNOWN"}`,
    ready: selected.ready_state === "READY",
    revision_match: selected.revision_match,
    expected_revision: revision,
    project_id: project.project_id,
    project_identifier: projectId,
    deployment: selected,
    matching_deployments: matches,
    observed_at: new Date().toISOString(),
  };
}

module.exports = {
  observeDeploymentByRevision,
  observeDeploymentById,
  deploymentSha,
  normalize,
  resolveProjectId,
};
