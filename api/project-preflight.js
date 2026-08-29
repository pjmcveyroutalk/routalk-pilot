const crypto = require("node:crypto");
const projects = require("../config/projects");

const READINESS_STATUS = Object.freeze({
  READY: "READY",
  BLOCKED: "BLOCKED",
});

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

function blocked(repository, reason, message, nextAction, details = {}) {
  return {
    ready: false,
    status: READINESS_STATUS.BLOCKED,
    repository,
    reason,
    message,
    next_action: nextAction,
    retryable: true,
    ...details,
  };
}

function registryReadiness(repository) {
  const project = projects[repository];

  if (!project || project.role !== "target") {
    return blocked(
      repository,
      "PROJECT_NOT_REGISTERED",
      "Project is not ready for Pilot: register this repository in Pilot first.",
      "REGISTER_PROJECT",
      {
        checks: {
          registration: "BLOCKED",
          production_verifier: "NOT_CHECKED",
        },
      },
    );
  }

  const verifier = project.production_verifier || null;
  if (!verifier?.url || verifier.auth !== "vercel_oidc") {
    return blocked(
      repository,
      "REGISTER_PRODUCTION_VERIFIER",
      "Project is not ready for Pilot: register its production verifier before submitting a build.",
      "REGISTER_PRODUCTION_VERIFIER",
      {
        registered: true,
        production_verifier: verifier
          ? { configured: true, auth: verifier.auth, url: verifier.url }
          : { configured: false },
        checks: {
          registration: "PASS",
          production_verifier: "BLOCKED",
        },
      },
    );
  }

  return {
    ready: true,
    status: READINESS_STATUS.READY,
    repository,
    registered: true,
    production_verifier: {
      configured: true,
      auth: verifier.auth,
      url: verifier.url,
    },
    checks: {
      registration: "PASS",
      production_verifier: "PASS",
    },
    next: "READY_FOR_PILOT",
    next_action: "QUEUE_BUILD",
    retryable: false,
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

async function checkProjectReadiness(repository) {
  return registryReadiness(repository);
}

module.exports._test = {
  READINESS_STATUS,
  registryReadiness,
  checkProjectReadiness,
};
