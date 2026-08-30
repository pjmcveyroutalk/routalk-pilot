const crypto = require("node:crypto");

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.VERCEL_APP_CLIENT_ID || "";
  if (!clientId) {
    return res.status(503).json({
      error: "Pilot's Vercel authorization app is not configured yet.",
      code: "VERCEL_OAUTH_APP_NOT_CONFIGURED",
      next_action: "CONFIGURE_PILOT_VERCEL_OAUTH_APP",
    });
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const returnTo = String(req.query?.return_to || "/provision-project.html");
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/provision-project.html";

  res.setHeader("Set-Cookie", [
    cookie("pilot_vercel_oauth_state", state, 600),
    cookie("pilot_vercel_code_verifier", verifier, 600),
    cookie("pilot_vercel_return_to", safeReturnTo, 600),
  ]);

  const origin = `https://${req.headers.host}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/vercel-auth-callback`,
    response_type: "code",
    scope: "openid email profile offline_access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return res.redirect(302, `https://vercel.com/oauth/authorize?${params.toString()}`);
};
