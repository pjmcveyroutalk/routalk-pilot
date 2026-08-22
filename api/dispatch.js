const crypto = require("node:crypto");

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const githubToken = process.env.PILOT_GITHUB_TOKEN;

  if (!triggerSecret || !githubToken) {
    return response.status(503).json({ error: "Dispatch is not configured" });
  }

  const authorization = request.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!safeEqual(suppliedSecret, triggerSecret)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const repository = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  const workflow =
    process.env.PILOT_GITHUB_WORKFLOW || "routalk-pilot-bridge.yml";
  const ref = process.env.PILOT_GITHUB_REF || "main";

  const githubResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref }),
    },
  );

  if (!githubResponse.ok) {
    const details = await githubResponse.text();

    console.error("GitHub workflow dispatch failed", {
      status: githubResponse.status,
      details,
    });

    return response.status(502).json({
      error: "GitHub workflow dispatch failed",
      status: githubResponse.status,
    });
  }

  return response.status(202).json({
    accepted: true,
    workflow,
    ref,
  });
};
