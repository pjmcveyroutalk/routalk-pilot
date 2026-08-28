const QUEUE_TITLE_PREFIX = "Pilot queue command ";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const VISIBILITY_ATTEMPTS = 4;

function queueTitle(commandId) {
  return `${QUEUE_TITLE_PREFIX}${commandId}`;
}

function commandMarker(commandId) {
  return `Pilot queue command: \`${commandId}\``;
}

function githubFailure(message, result) {
  const status =
    Number.isInteger(result?.status) && result.status > 0
      ? result.status
      : null;

  const upstreamMessage =
    typeof result?.data?.message === "string"
      ? result.data.message.replace(/\s+/g, " ").slice(0, 200)
      : "";

  const detail = result?.timedOut
    ? "GitHub timeout"
    : status
      ? `GitHub ${status}${upstreamMessage ? `: ${upstreamMessage}` : ""}`
      : "GitHub request failed";

  const error = new Error(`${message} (${detail})`);
  error.code = "STORAGE_UNAVAILABLE";
  error.timedOut = Boolean(result?.timedOut);
  error.githubStatus = status;
  return error;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findIssueByExactTitle(baseUrl, githubToken, githubRequest, title) {
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const existing = await githubRequest(
      `${baseUrl}/issues?state=all&sort=created&direction=desc&per_page=${PAGE_SIZE}&page=${page}`,
      githubToken,
    );

    if (!existing.ok) {
      throw githubFailure(
        "Pilot queue storage is unavailable",
        existing,
      );
    }

    const issues = Array.isArray(existing.data) ? existing.data : [];
    const match =
      issues.find(
        (issue) =>
          !issue.pull_request &&
          issue.title === title,
      ) || null;

    if (match) return match;
    if (issues.length < PAGE_SIZE) break;
  }

  return null;
}

async function findPullByMarker(baseUrl, githubToken, githubRequest, marker) {
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const pulls = await githubRequest(
      `${baseUrl}/pulls?state=all&sort=created&direction=desc&per_page=${PAGE_SIZE}&page=${page}`,
      githubToken,
    );

    if (!pulls.ok) {
      throw githubFailure(
        "Pilot pull request state is unavailable",
        pulls,
      );
    }

    const items = Array.isArray(pulls.data) ? pulls.data : [];
    const match =
      items.find(
        (pull) =>
          typeof pull.body === "string" &&
          pull.body.includes(marker),
      ) || null;

    if (match) return match;
    if (items.length < PAGE_SIZE) break;
  }

  return null;
}

function createGithubIssueCommandStore({
  baseUrl,
  githubToken,
  githubRequest,
}) {
  if (!baseUrl || !githubToken || typeof githubRequest !== "function") {
    throw new Error("GitHub command store configuration is invalid");
  }

  return Object.freeze({
    name: "github_issues",

    async findByCommandId(commandId) {
      const expectedTitle = queueTitle(commandId);

      for (let attempt = 0; attempt < VISIBILITY_ATTEMPTS; attempt += 1) {
        const match = await findIssueByExactTitle(
          baseUrl,
          githubToken,
          githubRequest,
          expectedTitle,
        );

        if (match) return match;

        if (attempt < VISIBILITY_ATTEMPTS - 1) {
          await sleep(250 * (attempt + 1));
        }
      }

      return null;
    },

    async persist(command, encryptedEnvelope) {
      const issueBody = JSON.stringify(encryptedEnvelope);

      if (issueBody.length > 65_000) {
        const error = new Error(
          "Encrypted command is too large to queue",
        );
        error.code = "PAYLOAD_TOO_LARGE";
        throw error;
      }

      const title = queueTitle(command.command_id);

      const stored = await githubRequest(
        `${baseUrl}/issues`,
        githubToken,
        {
          method: "POST",
          body: JSON.stringify({
            title,
            body: issueBody,
          }),
        },
      );

      if (!stored.ok) {
        throw githubFailure(
          "Pilot command could not be queued",
          stored,
        );
      }

      return {
        record: stored.data.number,
        metadata: {
          queue_title: title,
        },
      };
    },

    async findPullRequestByCommandId(commandId) {
      return findPullByMarker(
        baseUrl,
        githubToken,
        githubRequest,
        commandMarker(commandId),
      );
    },
  });
}

module.exports = {
  QUEUE_TITLE_PREFIX,
  commandMarker,
  createGithubIssueCommandStore,
  queueTitle,
};
