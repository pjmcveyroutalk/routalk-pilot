const crypto = require("node:crypto");

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "routalk-pilot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function github(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers(token), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function readBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "object") return request.body;

  try {
    return JSON.parse(request.body);
  } catch {
    return {};
  }
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const githubToken = process.env.PILOT_GITHUB_TOKEN;

  if (!triggerSecret || !githubToken) {
    return response.status(503).json({ error: "Merge is not configured" });
  }

  const authorization = request.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!safeEqual(suppliedSecret, triggerSecret)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const rawNumber = readBody(request).pr_number;
  const prNumber = Number(rawNumber);

  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    return response.status(400).json({ error: "Invalid pull request number" });
  }

  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const repository = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  const fullName = `${owner}/${repository}`;
  const baseUrl = `https://api.github.com/repos/${fullName}`;
  let pull = await github(`${baseUrl}/pulls/${prNumber}`, githubToken);

  if (!pull.ok) {
    return response.status(pull.status === 404 ? 404 : 502).json({
      error: pull.status === 404 ? "Pull request not found" : "GitHub lookup failed",
    });
  }

  const pr = pull.data;
  const headRef = String(pr.head?.ref || "");

  if (
    pr.state !== "open" ||
    pr.base?.ref !== "main" ||
    !headRef.startsWith("chatgpt/") ||
    pr.head?.repo?.full_name !== fullName
  ) {
    return response.status(409).json({
      error: "Pilot can only merge open chatgpt/* pull requests into main",
    });
  }

  if (pr.draft) {
    const ready = await github("https://api.github.com/graphql", githubToken, {
      method: "POST",
      body: JSON.stringify({
        query:
          "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id,isDraft}}}",
        variables: { id: pr.node_id },
      }),
    });

    if (!ready.ok || ready.data.errors) {
      return response.status(502).json({ error: "Could not mark pull request ready" });
    }

    pull = await github(`${baseUrl}/pulls/${prNumber}`, githubToken);
  }

  const current = pull.data;

  if (current.mergeable !== true || current.mergeable_state !== "clean") {
    return response.status(409).json({
      error: "Pull request is not currently mergeable",
    });
  }

  const checkRuns = await github(
    `${baseUrl}/commits/${current.head.sha}/check-runs?per_page=100`,
    githubToken,
  );
  const statuses = await github(
    `${baseUrl}/commits/${current.head.sha}/status`,
    githubToken,
  );

  if (!checkRuns.ok || !statuses.ok) {
    return response.status(502).json({ error: "Could not verify pull request checks" });
  }

  const allowedConclusions = new Set(["success", "neutral", "skipped"]);
  const checksBlocked = (checkRuns.data.check_runs || []).some(
    (check) =>
      check.status !== "completed" || !allowedConclusions.has(check.conclusion),
  );
  const statusesBlocked = !["success", "pending"].includes(statuses.data.state)
    ? true
    : statuses.data.state === "pending" && (statuses.data.statuses || []).length > 0;

  if (checksBlocked || statusesBlocked) {
    return response.status(409).json({
      error: "Pull request checks are pending or unsuccessful",
    });
  }

  const merge = await github(`${baseUrl}/pulls/${prNumber}/merge`, githubToken, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });

  if (!merge.ok || !merge.data.merged) {
    return response.status(409).json({
      error: merge.data.message || "GitHub did not merge the pull request",
    });
  }

  const encodedHead = headRef.split("/").map(encodeURIComponent).join("/");
  const deleted = await github(
    `${baseUrl}/git/refs/heads/${encodedHead}`,
    githubToken,
    { method: "DELETE" },
  );

  return response.status(200).json({
    merged: true,
    number: prNumber,
    sha: merge.data.sha,
    html_url: pr.html_url,
    branch_deleted: deleted.ok || deleted.status === 404,
  });
};
