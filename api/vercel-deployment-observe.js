const crypto = require("node:crypto");
const {
  observeDeploymentByRevision,
  observeDeploymentById,
} = require("../lib/vercel-deployment-observer");

const DEFAULT_TEAM_ID = "team_jC9jlJ9GZ9GSjrbYoD0pin3U";

function safeEqual(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function validSha(v) { return /^[a-f0-9]{40}$/i.test(v || ""); }
function validProject(v) { return /^[A-Za-z0-9_.-]{1,128}$/.test(v || ""); }
function validDeploymentId(v) { return /^[A-Za-z0-9_-]{8,128}$/.test(v || ""); }

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET || "";
  const vercelToken = process.env.PILOT_VERCEL_TOKEN || process.env.VERCEL_TOKEN || "";
  const auth = String(req.headers.authorization || "");
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!triggerSecret || !vercelToken) {
    return res.status(503).json({ error: "Observer is not configured" });
  }
  if (!safeEqual(supplied, triggerSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const teamId = process.env.PILOT_VERCEL_TEAM_ID || DEFAULT_TEAM_ID;
  const deploymentId = String(req.query.deployment_id || "").trim();
  if (deploymentId) {
    if (!validDeploymentId(deploymentId)) {
      return res.status(400).json({ error: "Invalid deployment_id" });
    }
    const result = await observeDeploymentById({
      deploymentId,
      token: vercelToken,
      teamId,
    });
    return res.status(200).json(result);
  }

  const projectId = String(req.query.project_id || "").trim();
  const revision = String(req.query.revision || "").trim();
  if (!validProject(projectId) || !validSha(revision)) {
    return res.status(400).json({ error: "Invalid project_id or revision" });
  }

  const result = await observeDeploymentByRevision({
    projectId,
    revision,
    token: vercelToken,
    teamId,
  });

  return res.status(200).json(result);
};
