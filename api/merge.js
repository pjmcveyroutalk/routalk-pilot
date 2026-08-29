const crypto = require("node:crypto");
const PROJECTS = require("../config/projects");

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 4_096;
const MERGEABILITY_RETRIES = 6;
const MERGEABILITY_RETRY_MS = 750;
const MERGE_ATTEMPTS = 4;
const MERGE_RETRY_MS = 1000;
const CHECK_SETTLE_ATTEMPTS = 7;
const CHECK_SETTLE_RETRY_MS = 1000;
const DEFAULT_TARGET_REPOSITORY = "pjmcveyroutalk/routalk-pilot";

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

function validRepository(value) {
  if (typeof value !== "string") return false;
  const parts = value.split("/");
  return (
    parts.length === 2 &&
    validRepositoryPart(parts[0]) &&
    validRepositoryPart(parts[1])
  );
}

function allowedTargetRepositories() {
  const configured = process.env.PILOT_TARGET_REPOSITORIES || "";
  return new Set([
    DEFAULT_TARGET_REPOSITORY,
    ...Object.keys(PROJECTS).filter(validRepository),
    ...configured
      .split(",")
      .map((value) => value.trim())
      .filter(validRepository),
  ]);
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
    error: result.timedOut ? "GitHub request timed out" : "GitHub request failed",
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function refreshUntilMergeabilityKnown(baseUrl, prNumber, githubToken) {
  let latest = null;

  for (let attempt = 0; attempt < MERGEABILITY_RETRIES; attempt += 1) {
    latest = await github(`${baseUrl}/pulls/${prNumber}`, githubToken);
    if (!latest.ok) return latest;

    const mergeableKnown =
      latest.data.mergeable === true ||
      latest.data.mergeable === false ||
      latest.data.mergeable_state === "dirty";

    if (mergeableKnown) return latest;

    if (attempt < MERGEABILITY_RETRIES - 1) {
      await wait(MERGEABILITY_RETRY_MS);
    }
  }

  return latest;
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

  const body = readBody(request);
  const prNumber = Number(body.pr_number);
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    return send(response, 400, requestId, { error: "Invalid pull request number" });
  }

  const controlOwner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const controlRepo = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  if (!validRepositoryPart(controlOwner) || !validRepositoryPart(controlRepo)) {
    return send(response, 503, requestId, {
      error: "Merge repository configuration is invalid",
    });
  }

  const requestedRepository =
    typeof body.repository === "string" && body.repository.trim()
      ? body.repository.trim()
      : `${controlOwner}/${controlRepo}`;

  if (
    !validRepository(requestedRepository) ||
    !allowedTargetRepositories().has(requestedRepository)
  ) {
    return send(response, 403, requestId, {
      error: "Repository is not allowlisted for Pilot merge",
    });
  }

  const fullName = requestedRepository;
  const baseUrl = `${GITHUB_API}/repos/${fullName}`;
  let pull = await refreshUntilMergeabilityKnown(baseUrl, prNumber, githubToken);

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
    pull = await refreshUntilMergeabilityKnown(baseUrl, prNumber, githubToken);
    if (!pull.ok) {
      return upstreamFailure(response, requestId, "ready_pull_refresh", pull);
    }
  }

  let current = pull.data;
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

  if (current.mergeable === false || current.mergeable_state === "dirty") {
    return send(response, 409, requestId, {
      error: "Pull request has a merge conflict",
    });
  }

  const allowedConclusions = new Set(["success", "neutral", "skipped"]);

  async function readCheckGate() {
    const [checkRuns, statuses] = await Promise.all([
      github(`${baseUrl}/commits/${expectedHeadSha}/check-runs?per_page=100`, githubToken),
      github(`${baseUrl}/commits/${expectedHeadSha}/status`, githubToken),
    ]);

    if (!checkRuns.ok) return { upstream: ["check_runs", checkRuns] };
    if (!statuses.ok) return { upstream: ["commit_status", statuses] };

    const checkRunList = checkRuns.data.check_runs || [];
    const failingCheckRuns = checkRunList.filter(
      (check) =>
        check.status === "completed" &&
        !allowedConclusions.has(check.conclusion),
    );
    const pendingCheckRuns = checkRunList.filter(
      (check) => check.status !== "completed",
    );

    const commitStatuses = statuses.data.statuses || [];
    const failingCommitStatuses = commitStatuses.filter((status) =>
      ["error", "failure"].includes(status.state),
    );
    const pendingCommitStatuses = commitStatuses.filter(
      (status) => status.state === "pending",
    );

    const successfulStatusContexts = new Set(
      commitStatuses
        .filter((status) => status.state === "success")
        .map((status) => String(status.context || "").toLowerCase()),
    );

    const meaningfulPendingCheckRuns = pendingCheckRuns.filter((check) => {
      const appSlug = String(check.app?.slug || "").toLowerCase();
      if (appSlug !== "vercel") return true;

      const hasSuccessfulVercelStatus = [...successfulStatusContexts].some(
        (context) => context.startsWith("vercel"),
      );
      return !hasSuccessfulVercelStatus;
    });

    return {
      blocked:
        failingCheckRuns.length > 0 ||
        failingCommitStatuses.length > 0,
      pending:
        meaningfulPendingCheckRuns.length > 0 ||
        pendingCommitStatuses.length > 0,
      diagnostics: {
        failing_check_runs: failingCheckRuns.map((check) => ({
          name: String(check.name || ""),
          app: String(check.app?.slug || check.app?.name || ""),
          status: String(check.status || ""),
          conclusion: String(check.conclusion || ""),
        })),
        failing_commit_statuses: failingCommitStatuses.map((status) => ({
          context: String(status.context || ""),
          state: String(status.state || ""),
          description: String(status.description || "").slice(0, 240),
        })),
        pending_check_runs: meaningfulPendingCheckRuns.map((check) => ({
          name: String(check.name || ""),
          app: String(check.app?.slug || check.app?.name || ""),
          status: String(check.status || ""),
          conclusion: String(check.conclusion || ""),
        })),
        pending_commit_statuses: pendingCommitStatuses.map((status) => ({
          context: String(status.context || ""),
          state: String(status.state || ""),
          description: String(status.description || "").slice(0, 240),
        })),
      },
    };
  }

  let checkGate = null;
  for (let attempt = 0; attempt < CHECK_SETTLE_ATTEMPTS; attempt += 1) {
    checkGate = await readCheckGate();

    if (checkGate.upstream) {
      return upstreamFailure(
        response,
        requestId,
        checkGate.upstream[0],
        checkGate.upstream[1],
      );
    }

    if (checkGate.blocked || !checkGate.pending) break;

    if (attempt < CHECK_SETTLE_ATTEMPTS - 1) {
      await wait(CHECK_SETTLE_RETRY_MS);
    }
  }

  if (checkGate.blocked || checkGate.pending) {
    return send(response, 409, requestId, {
      error: checkGate.blocked
        ? "Pull request checks are unsuccessful"
        : "Pull request checks are still pending after verification wait",
      retryable: !checkGate.blocked,
      check_diagnostics: checkGate.diagnostics,
    });
  }

  pull = await refreshUntilMergeabilityKnown(baseUrl, prNumber, githubToken);
  if (!pull.ok) {
    return upstreamFailure(response, requestId, "mergeability_final_refresh", pull);
  }

  current = pull.data;
  if (
    current.state !== "open" ||
    current.base?.ref !== "main" ||
    current.head?.ref !== headRef ||
    current.head?.repo?.full_name !== fullName ||
    String(current.head?.sha || "") !== expectedHeadSha
  ) {
    return send(response, 409, requestId, {
      error: "Pull request changed while Pilot was settling mergeability",
      retryable: false,
    });
  }

  if (current.mergeable === false || current.mergeable_state === "dirty") {
    return send(response, 409, requestId, {
      error: "Pull request has a merge conflict",
      retryable: false,
    });
  }

  if (current.mergeable !== true) {
    return send(response, 409, requestId, {
      error: "GitHub mergeability did not settle within Pilot's bounded wait",
      retryable: true,
    });
  }

  let merge = null;

  for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt += 1) {
    merge = await github(`${baseUrl}/pulls/${prNumber}/merge`, githubToken, {
      method: "PUT",
      body: JSON.stringify({ merge_method: "squash", sha: expectedHeadSha }),
    });

    if (merge.ok && merge.data.merged) break;

    const retryableMergeStatus = [405, 409].includes(merge.status);
    if (!retryableMergeStatus || attempt === MERGE_ATTEMPTS - 1) break;

    await wait(MERGE_RETRY_MS);

    const refreshed = await github(`${baseUrl}/pulls/${prNumber}`, githubToken);
    if (!refreshed.ok) {
      return upstreamFailure(response, requestId, "merge_retry_refresh", refreshed);
    }

    if (refreshed.data.state !== "open") {
      if (refreshed.data.merged) {
        return send(response, 200, requestId, {
          merged: true,
          repository: fullName,
          number: prNumber,
          sha: refreshed.data.merge_commit_sha || null,
          html_url: refreshed.data.html_url,
          branch_deleted: false,
          warning: "Pull request merged while Pilot was confirming the result",
        });
      }
      break;
    }

    if (String(refreshed.data.head?.sha || "") !== expectedHeadSha) {
      return send(response, 409, requestId, {
        error: "Pull request changed while Pilot was retrying the merge",
        retryable: false,
      });
    }
  }

  if (!merge?.ok || !merge?.data?.merged) {
    await wait(MERGE_RETRY_MS);
    const reconciled = await github(`${baseUrl}/pulls/${prNumber}`, githubToken);

    if (reconciled.ok && reconciled.data.merged) {
      return send(response, 200, requestId, {
        merged: true,
        repository: fullName,
        number: prNumber,
        sha: reconciled.data.merge_commit_sha || null,
        html_url: reconciled.data.html_url || initial.html_url,
        branch_deleted: false,
        warning: "Merge completed while Pilot was reconciling GitHub state",
        reconciled: true,
      });
    }

    const githubMessage =
      typeof merge?.data?.message === "string"
        ? merge.data.message.slice(0, 240)
        : "GitHub declined the merge";

    console.warn("Pilot merge declined", {
      request_id: requestId,
      repository: fullName,
      status: merge?.status,
      github_message: githubMessage,
      reconciliation_status: reconciled?.status,
    });

    const denialStatus = merge?.status || 0;
    const denialSummary = `GitHub merge denied (${denialStatus}): ${githubMessage}`;

    return send(response, 409, requestId, {
      error: denialSummary,
      retryable: [405, 409].includes(merge?.status),
      denial: {
        source: "github_merge_api",
        status: denialStatus,
        message: githubMessage,
      },
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
      repository: fullName,
      status: deleted.status,
    });
  }

  return send(response, 200, requestId, {
    merged: true,
    repository: fullName,
    number: prNumber,
    sha: merge.data.sha,
    html_url: initial.html_url,
    branch_deleted: branchDeleted,
    warning: branchDeleted ? undefined : "Pull request merged; branch cleanup failed",
  });
};

module.exports._test = {
  allowedTargetRepositories,
  validRepository,
  validRepositoryPart,
};
