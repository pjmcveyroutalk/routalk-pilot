const QUEUE_TITLE_PREFIX = "Pilot queue command ";

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

      const existing = await githubRequest(
        `${baseUrl}/issues?state=all&per_page=100`,
        githubToken,
      );

      if (!existing.ok) {
        throw githubFailure(
          "Pilot queue storage is unavailable",
          existing,
        );
      }

      return (
        (existing.data || []).find(
          (issue) =>
            !issue.pull_request &&
            issue.title === expectedTitle,
        ) || null
      );
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
      const marker = commandMarker(commandId);

      const pulls = await githubRequest(
        `${baseUrl}/pulls?state=all&sort=created&direction=desc&per_page=100`,
        githubToken,
      );

      if (!pulls.ok) {
        throw githubFailure(
          "Pilot pull request state is unavailable",
          pulls,
        );
      }

      return (
        (pulls.data || []).find(
          (pull) =>
            typeof pull.body === "string" &&
            pull.body.includes(marker),
        ) || null
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
