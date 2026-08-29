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
function registryReadiness(repository) {
  const project = projects[repository];
  if (!project || project.role !== "target") {
    return { ready: false, repository, reason: "PROJECT_NOT_REGISTERED" };
  }
  const verifier = project.production_verifier || null;
  if (!verifier?.url || verifier.auth !== "vercel_oidc") {
    return {
      ready: false,
      repository,
      registered: true,
      production_verifier: verifier
        ? { configured: true, auth: verifier.auth, url: verifier.url }
        : { configured: false },
      reason: "REGISTER_PRODUCTION_VERIFIER",
    };
  }
  return {
    ready: true,
    repository,
    registered: true,
    production_verifier: {
      configured: true,
      auth: verifier.auth,
      url: verifier.url,
    },
    next: "READY_FOR_PILOT",
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }
  const trigger = process.env.PILOT_TRIGGER_SECRET;
  const auth = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!trigger || !safeEqual(auth, trigger)) {
    return send(res, 401, { error: "Unauthorized" });
  }
  const repository = String(req.body?.repository || "");
  const readiness = registryReadiness(repository);
  return send(res, readiness.ready ? 200 : 400, readiness);
};

async function checkProjectReadiness(repository) { return registryReadiness(repository); }
module.exports._test = { registryReadiness, checkProjectReadiness };
