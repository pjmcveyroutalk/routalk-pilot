const QUEUE_TITLE_PREFIX = "Pilot queue command ";

function queueTitle(commandId) {
  return `${QUEUE_TITLE_PREFIX}${commandId}`;
}

function commandMarker(commandId) {
  return `Pilot queue command: \`${commandId}\``;
}

function createGithubIssueCommandStore({ baseUrl, githubToken, githubRequest }) {
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
        const error = new Error("Pilot queue storage is unavailable");
        error.code = "STORAGE_UNAVAILABLE";
        error.timedOut = existing.timedOut;
        throw error;
      }

      return (
        (existing.data || []).find(
          (issue) => !issue.pull_request && issue.title === expectedTitle,
        ) || null
      );
    },

    async persist(command, encryptedEnvelope) {
      const issueBody = JSON.stringify(encryptedEnvelope);
      if (issueBody.length > 65_000) {
        const error = new Error("Encrypted command is too large to queue");
        error.code = "PAYLOAD_TOO_LARGE";
        throw error;
      }

      const title = queueTitle(command.command_id);
      const stored = await githubRequest(`${baseUrl}/issues`, githubToken, {
        method: "POST",
        body: JSON.stringify({ title, body: issueBody }),
      });

      if (!stored.ok) {
        const error = new Error("Pilot command could not be queued");
        error.code = "STORAGE_UNAVAILABLE";
        error.timedOut = stored.timedOut;
        throw error;
      }

      return {
        record: stored.data.number,
        metadata: { queue_title: title },
      };
    },

    async findPullRequestByCommandId(commandId) {
      const marker = commandMarker(commandId);
      const pulls = await githubRequest(
        `${baseUrl}/pulls?state=all&sort=created&direction=desc&per_page=100`,
        githubToken,
      );

      if (!pulls.ok) {
        const error = new Error("Pilot pull request state is unavailable");
        error.code = "STORAGE_UNAVAILABLE";
        error.timedOut = pulls.timedOut;
        throw error;
      }

      return (
        (pulls.data || []).find(
          (pull) => typeof pull.body === "string" && pull.body.includes(marker),
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
