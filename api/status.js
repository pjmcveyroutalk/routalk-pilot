const crypto = require("node:crypto");

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "routalk-pilot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function readJson(url, headers) {
  const result = await fetch(url, { headers });

  if (!result.ok) {
    return { ok: false, status: result.status };
  }

  return { ok: true, data: await result.json() };
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const githubToken = process.env.PILOT_GITHUB_TOKEN;

  if (!triggerSecret || !githubToken) {
    return response.status(503).json({ error: "Status is not configured" });
  }

  const authorization = request.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!safeEqual(suppliedSecret, triggerSecret)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const startedAtValue = Array.isArray(request.query.started_at)
    ? request.query.started_at[0]
    : request.query.started_at;
  const startedAt = Date.parse(startedAtValue || "");
  const now = Date.now();

  if (
    !Number.isFinite(startedAt) ||
    startedAt < now - 10 * 60 * 1000 ||
    startedAt > now + 60 * 1000
  ) {
    return response.status(400).json({ error: "Invalid start time" });
  }

  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const repository = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  const workflow =
    process.env.PILOT_GITHUB_WORKFLOW || "routalk-pilot-bridge.yml";
  const ref = process.env.PILOT_GITHUB_REF || "main";
  const baseUrl = `https://api.github.com/repos/${owner}/${repository}`;
  const runsUrl =
    `${baseUrl}/actions/workflows/${workflow}/runs` +
    `?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=10`;

  const runsResult = await readJson(runsUrl, githubHeaders(githubToken));

  if (!runsResult.ok) {
    console.error("GitHub workflow status failed", {
      status: runsResult.status,
    });
    return response.status(502).json({ error: "GitHub workflow status failed" });
  }

  const run = (runsResult.data.workflow_runs || []).find(
    (item) => Date.parse(item.created_at) >= startedAt - 5000,
  );

  if (!run) {
    return response.status(200).json({ workflow: null, pull_requests: [] });
  }

  const workflowResult = {
    status: run.status,
    conclusion: run.conclusion,
    html_url: run.html_url,
    created_at: run.created_at,
    updated_at: run.updated_at,
  };

  if (run.status !== "completed") {
    return response
      .status(200)
      .json({ workflow: workflowResult, pull_requests: [] });
  }

  const pullsUrl = `${baseUrl}/pulls?state=open&sort=created&direction=desc&per_page=20`;
  let pullsResult = await readJson(pullsUrl, githubHeaders(githubToken));

  if (!pullsResult.ok && [401, 403].includes(pullsResult.status)) {
    pullsResult = await readJson(pullsUrl, {
      Accept: "application/vnd.github+json",
      "User-Agent": "routalk-pilot",
      "X-GitHub-Api-Version": "2022-11-28",
    });
  }

  const pullRequests = pullsResult.ok
    ? pullsResult.data
        .filter((pull) => Date.parse(pull.created_at) >= startedAt - 5000)
        .map((pull) => ({
          number: pull.number,
          title: pull.title,
          html_url: pull.html_url,
          draft: Boolean(pull.draft),
          created_at: pull.created_at,
        }))
    : [];

  if (!pullsResult.ok) {
    console.warn("GitHub pull request lookup failed", {
      status: pullsResult.status,
    });
  }

  return response.status(200).json({
    workflow: workflowResult,
    pull_requests: pullRequests,
  });
};
