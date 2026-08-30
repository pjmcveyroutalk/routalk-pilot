const VERCEL_API = "https://api.vercel.com";
const TIMEOUT_MS = 12000;

function validSha(value) {
  return /^[a-f0-9]{40}$/i.test(value || "");
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

function normalize(deployment, expectedSha) {
  const sha = deploymentSha(deployment);
  return {
    id: deployment?.uid || deployment?.id || null,
    url: deployment?.url ? `https://${deployment.url}` : null,
    ready_state: deployment?.readyState || deployment?.state || null,
    target: deployment?.target || null,
    git_sha: sha || null,
    revision_match: Boolean(sha) && sha.toLowerCase() === expectedSha.toLowerCase(),
    created_at: deployment?.createdAt || deployment?.created || null,
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

  const params = new URLSearchParams({
    projectId,
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
    };
  }

  const deployments = Array.isArray(result.data?.deployments)
    ? result.data.deployments
    : [];

  const matches = deployments
    .map((item) => normalize(item, revision))
    .filter((item) => item.revision_match)
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));

  if (!matches.length) {
    return {
      checked: true,
      state: "WAITING_FOR_DEPLOYMENT",
      ready: false,
      revision_match: false,
      expected_revision: revision,
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
    deployment: selected,
    matching_deployments: matches,
    observed_at: new Date().toISOString(),
  };
}

module.exports = {
  observeDeploymentByRevision,
  deploymentSha,
  normalize,
};
