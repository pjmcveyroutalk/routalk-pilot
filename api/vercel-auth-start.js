const crypto = require("node:crypto");

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = process.env.VERCEL_INTEGRATION_SLUG || "";
  if (!slug) {
    return res.status(503).json({
      error: "Pilot's Vercel Integration is not configured yet.",
      code: "VERCEL_INTEGRATION_NOT_CONFIGURED",
      next_action: "CONFIGURE_VERCEL_INTEGRATION",
    });
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const returnTo = String(req.query?.return_to || "/provision-project.html");
  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/provision-project.html";

  res.setHeader("Set-Cookie", [
    cookie("pilot_vercel_oauth_state", state, 600),
    cookie("pilot_vercel_return_to", safeReturnTo, 600),
  ]);

  const params = new URLSearchParams({ state });
  return res.redirect(
    302,
    `https://vercel.com/integrations/${encodeURIComponent(slug)}/new?${params.toString()}`,
  );
};
