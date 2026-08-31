const PROJECTS = require("../config/projects");

function setSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const projects = Object.entries(PROJECTS).map(([repository, project]) => ({
    repository,
    role: project.role,
    verification_configured: Boolean(project.production_verifier),
  }));

  return response.status(200).json({ projects });
};
