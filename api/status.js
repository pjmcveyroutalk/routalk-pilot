const crypto = require("node:crypto");

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 10000;
const RECENT_RUN_WINDOW_MS = 10 * 60 * 1000;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");

  if (leftBuffer.length !== rightBuffer.length) return false;
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

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "routalk-pilot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function validRepositoryPart(value) {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(value || "");
}

function validWorkflow(value) {
  return /^[A-Za-z0-9_.-]{1,100}\.ya?ml$/.test(value || "");
}

function validRef(value) {
  return (
    /^[A-Za-z0-9._/-]{1,120}$/.test(value || "") &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.endsWith("/")
  );
}

async function readJson(url, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);

  try {
    const result = await fetch(url, { headers, signal: controller.signal });
    if (!result.ok) return { ok: false, status: result.status };
    return { ok: true, data: await result.json() };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      timedOut: Boolean(error && error.name === "AbortError"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function eligiblePullRequest(pull, owner, repository, ref) {
  return (
    pull &&
    pull.state === "open" &&
    pull.base &&
    pull.base.ref === ref &&
    pull.head &&
    typeof pull.head.ref === "string" &&
    pull.head.ref.startsWith("chatgpt/") &&
    pull.head.repo &&
    pull.head.repo.full_name === `${owner}/${repository}`
  );
}

module.exports = async function handler(request, response) {
  const requestId = crypto.randomUUID();
  applySecurityHeaders(response, requestId);

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed", request_id: requestId });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const githubToken = process.env.PILOT_GITHUB_TOKEN;

  if (!triggerSecret || !githubToken) {
    return response.status(503).json({ error: "Status is not configured", request_id: requestId });
  }

  const authorization = request.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!safeEqual(suppliedSecret, triggerSecret)) {
    return response.status(401).json({ error: "Unauthorized", request_id: requestId });
  }

  const startedAtValue = Array.isArray(request.query.started_at)
    ? request.query.started_at[0]
    : request.query.started_at;
  const startedAt = Date.parse(startedAtValue || "");
  const now = Date.now();

  if (
    !Number.isFinite(startedAt) ||
    startedAt < now - RECENT_RUN_WINDOW_MS ||
    startedAt > now + 60 * 1000
  ) {
    return response.status(400).json({ error: "Invalid start time", request_id: requestId });
  }

  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const repository = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  const workflow = process.env.PILOT_GITHUB_WORKFLOW || "routalk-pilot-bridge.yml";
  const ref = process.env.PILOT_GITHUB_REF || "main";

  if (
    !validRepositoryPart(owner) ||
    !validRepositoryPart(repository) ||
    !validWorkflow(workflow) ||
    !validRef(ref)
  ) {
    console.error("Invalid Pilot status configuration", { requestId });
    return response.status(503).json({
      error: "Status configuration is invalid",
      request_id: requestId,
    });
  }

  const baseUrl = `${GITHUB_API}/repos/${owner}/${repository}`;
  const runsUrl =
    `${baseUrl}/actions/workflows/${workflow}/runs` +
    `?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=10`;
  const pullsUrl = `${baseUrl}/pulls?state=open&sort=created&direction=desc&per_page=50`;
  const headers = githubHeaders(githubToken);
  const [runsResult, pullsResult] = await Promise.all([
    readJson(runsUrl, headers),
    readJson(pullsUrl, headers),
  ]);

  if (!runsResult.ok) {
    console.error("GitHub workflow status failed", {
      requestId,
      status: runsResult.status,
      timedOut: Boolean(runsResult.timedOut),
    });
    return response.status(502).json({ error: "GitHub workflow status failed", request_id: requestId });
  }

  if (!pullsResult.ok) {
    console.error("GitHub pull request lookup failed", {
      requestId,
      status: pullsResult.status,
      timedOut: Boolean(pullsResult.timedOut),
    });
    return response.status(502).json({ error: "GitHub pull request lookup failed", request_id: requestId });
  }

  const pullRequests = (pullsResult.data || [])
    .filter((pull) => eligiblePullRequest(pull, owner, repository, ref))
    .map((pull) => ({
      number: pull.number,
      title: pull.title,
      html_url: pull.html_url,
      draft: Boolean(pull.draft),
      created_at: pull.created_at,
    }));
  const newPullRequestCount = pullRequests.filter(
    (pull) => Date.parse(pull.created_at) >= startedAt - 5000,
  ).length;
  const run = (runsResult.data.workflow_runs || []).find(
    (item) => Date.parse(item.created_at) >= startedAt - 5000,
  );

  if (!run) {
    return response.status(200).json({
      workflow: null,
      pull_requests: pullRequests,
      new_pull_request_count: newPullRequestCount,
      request_id: requestId,
    });
  }

  const workflowResult = {
    status: run.status,
    conclusion: run.conclusion,
    html_url: run.html_url,
    created_at: run.created_at,
    updated_at: run.updated_at,
  };

  return response.status(200).json({
    workflow: workflowResult,
    pull_requests: pullRequests,
    new_pull_request_count: newPullRequestCount,
    request_id: requestId,
  });
};
