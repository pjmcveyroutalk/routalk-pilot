const crypto = require("node:crypto");

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 4_096;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
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

function setSecurityHeaders(response, requestId) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Request-Id", requestId);
}

function send(response, status, requestId, body) {
  return response.status(status).json({ ...body, request_id: requestId });
}

function validRepositoryPart(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100 &&
    /^[A-Za-z0-9_.-]+$/.test(value)
  );
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
    return {
      ok: false,
      status: 0,
      timedOut: error?.name === "AbortError",
    };
  } finally {
    clearTimeout(timeout);
  }
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

function upstreamFailure(response, requestId, operation, result) {
  console.error("Pilot GitHub request failed", {
    request_id: requestId,
    operation,
    status: result.status,
    timed_out: Boolean(result.timedOut),
  });
  return send(response, result.timedOut ? 504 : 502, requestId, {
    error: result.timedOut
      ? "GitHub request timed out"
      : "GitHub request failed",
  });
}

module.exports = async function handler(request, response) {
  const requestId = crypto.randomUUID();
  setSecurityHeaders(response, requestId);

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, requestId, { error: "Method not allowed" });
  }

  const contentLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return send(response, 413, requestId, { error: "Request body is too large" });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const githubToken = process.env.PILOT_GITHUB_TOKEN;
  if (!triggerSecret || !githubToken) {
    return send(response, 503, requestId, { error: "Merge is not configured" });
  }

  const authorization = request.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!safeEqual(suppliedSecret, triggerSecret)) {
    return send(response, 401, requestId, { error: "Unauthorized" });
  }

  const prNumber = Number(readBody(request).pr_number);
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    return send(response, 400, requestId, {
      error: "Invalid pull request number",
    });
  }

  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const repository = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  if (!validRepositoryPart(owner) || !validRepositoryPart(repository)) {
    return send(response, 503, requestId, {
      error: "Merge repository configuration is invalid",
    });
  }

  const fullName = `${owner}/${repository}`;
  const baseUrl = `${GITHUB_API}/repos/${fullName}`;
  let pull = await github(`${baseUrl}/pulls/${prNumber}`, githubToken);
  if (!pull.ok) {
    if (pull.status === 404) {
      return send(response, 404, requestId, { error: "Pull request not found" });
    }
    return upstreamFailure(response, requestId, "pull_lookup", pull);
  }

  const initial = pull.data;
  const headRef = String(initial.head?.ref || "");
  if (
    initial.state !== "open" ||
    initial.base?.ref !== "main" ||
    !headRef.startsWith("chatgpt/") ||
    initial.head?.repo?.full_name !== fullName
  ) {
    return send(response, 409, requestId, {
      error: "Pilot can only merge open chatgpt/* pull requests into main",
    });
  }

  if (initial.draft) {
    const ready = await github(`${GITHUB_API}/graphql`, githubToken, {
      method: "POST",
      body: JSON.stringify({
        query:
          "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id,isDraft}}}",
        variables: { id: initial.node_id },
      }),
    });
    if (!ready.ok || ready.data.errors) {
      return upstreamFailure(response, requestId, "mark_ready", ready);
    }
    pull = await github(`${baseUrl}/pulls/${prNumber}`, githubToken);
    if (!pull.ok) {
      return upstreamFailure(response, requestId, "ready_pull_refresh", pull);
    }
  }

  const current = pull.data;
  const expectedHeadSha = String(current.head?.sha || "");
  if (
    current.state !== "open" ||
    current.base?.ref !== "main" ||
    current.head?.ref !== headRef ||
    current.head?.repo?.full_name !== fullName ||
    !/^[a-f0-9]{40}$/i.test(expectedHeadSha)
  ) {
    return send(response, 409, requestId, {
      error: "Pull request changed during merge preparation",
    });
  }

  if (current.mergeable !== true || current.mergeable_state !== "clean") {
    return send(response, 409, requestId, {
      error: "Pull request is not currently mergeable",
    });
  }

  const [checkRuns, statuses] = await Promise.all([
    github(
      `${baseUrl}/commits/${expectedHeadSha}/check-runs?per_page=100`,
      githubToken,
    ),
    github(`${baseUrl}/commits/${expectedHeadSha}/status`, githubToken),
  ]);
  if (!checkRuns.ok) {
    return upstreamFailure(response, requestId, "check_runs", checkRuns);
  }
  if (!statuses.ok) {
    return upstreamFailure(response, requestId, "commit_status", statuses);
  }

  const allowedConclusions = new Set(["success", "neutral", "skipped"]);
  const checksBlocked = (checkRuns.data.check_runs || []).some(
    (check) =>
      check.status !== "completed" || !allowedConclusions.has(check.conclusion),
  );
  const statusesBlocked = !["success", "pending"].includes(statuses.data.state)
    ? true
    : statuses.data.state === "pending" &&
      (statuses.data.statuses || []).length > 0;
  if (checksBlocked || statusesBlocked) {
    return send(response, 409, requestId, {
      error: "Pull request checks are pending or unsuccessful",
    });
  }

  const merge = await github(`${baseUrl}/pulls/${prNumber}/merge`, githubToken, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash", sha: expectedHeadSha }),
  });
  if (!merge.ok || !merge.data.merged) {
    console.warn("Pilot merge declined", {
      request_id: requestId,
      status: merge.status,
    });
    return send(response, 409, requestId, {
      error: "GitHub did not merge the pull request",
    });
  }

  const encodedHead = headRef.split("/").map(encodeURIComponent).join("/");
  const deleted = await github(
    `${baseUrl}/git/refs/heads/${encodedHead}`,
    githubToken,
    { method: "DELETE" },
  );
  const branchDeleted = deleted.ok || deleted.status === 404;
  if (!branchDeleted) {
    console.warn("Pilot merged but branch cleanup failed", {
      request_id: requestId,
      status: deleted.status,
    });
  }

  return send(response, 200, requestId, {
    merged: true,
    number: prNumber,
    sha: merge.data.sha,
    html_url: initial.html_url,
    branch_deleted: branchDeleted,
    warning: branchDeleted ? undefined : "Pull request merged; branch cleanup failed",
  });
};
