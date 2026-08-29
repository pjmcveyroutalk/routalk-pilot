const crypto = require("node:crypto");
const projects = require("../config/projects");

function safeEqual(a, b) {
  const x = Buffer.from(a || "");
  const y = Buffer.from(b || "");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(body);
}
async function githubRepo(repository, token) {
  const response = await fetch(`https://api.github.com/repos/${repository}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "routalk-pilot",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  return {
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => ({})),
  };
}
async function checkProjectReadiness(repository, token) {
  const project = projects[repository];
  if (!project || project.role !== "target") {
    return { ready: false, repository, reason: "PROJECT_NOT_REGISTERED" };
  }
  if (!token) {
    return {
      ready: false,
      repository,
      registered: true,
      repository_access: false,
      reason: "TARGET_ACCESS_NOT_CONFIGURED",
    };
  }
  const repo = await githubRepo(repository, token);
  if (!repo.ok) {
    return {
      ready: false,
      repository,
      registered: true,
      repository_access: false,
      reason: repo.status === 404
        ? "TARGET_REPO_NOT_ACCESSIBLE"
        : "TARGET_REPO_CHECK_FAILED",
    };
  }
  const defaultBranch = repo.data.default_branch || null;
  const verifier = project.production_verifier || null;
  return {
    ready: !!(defaultBranch && verifier?.url && verifier?.auth === "vercel_oidc"),
    repository,
    registered: true,
    repository_access: true,
    default_branch: defaultBranch,
    production_verifier: verifier
      ? { configured: true, auth: verifier.auth, url: verifier.url }
      : { configured: false },
    next: !defaultBranch
      ? "INITIALIZE_MAIN"
      : !verifier
        ? "REGISTER_PRODUCTION_VERIFIER"
        : "READY_FOR_PILOT",
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }
  const trigger = process.env.PILOT_TRIGGER_SECRET;
  const token = process.env.PILOT_TARGET_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const auth = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!trigger || !safeEqual(auth, trigger)) {
    return send(res, 401, { error: "Unauthorized" });
  }
  const repository = String(req.body?.repository || "");
  const readiness = await checkProjectReadiness(repository, token).catch(() => ({
    ready: false,
    repository,
    reason: "TARGET_REPO_CHECK_FAILED",
  }));
  return send(res, readiness.ready ? 200 : 400, readiness);
};

module.exports._test = { checkProjectReadiness };
