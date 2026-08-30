const crypto = require("node:crypto");

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.VERCEL_INTEGRATION_CLIENT_ID || "";
  const clientSecret = process.env.VERCEL_INTEGRATION_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    const missing = [];
    if (!clientId) missing.push("VERCEL_INTEGRATION_CLIENT_ID");
    if (!clientSecret) missing.push("VERCEL_INTEGRATION_CLIENT_SECRET");
    return res.status(503).json({
      error: "Pilot's Vercel Integration credentials are not configured yet.",
      code: "VERCEL_INTEGRATION_NOT_CONFIGURED",
      missing,
      next_action: "CONFIGURE_VERCEL_INTEGRATION_CREDENTIALS",
    });
  }

  const cookies = parseCookies(req.headers.cookie);
  const code = String(req.query?.code || "");
  const state = String(req.query?.state || "");
  const expectedState = cookies.pilot_vercel_oauth_state || "";
  const callbackTeamId = String(req.query?.teamId || "");
  const configurationId = String(req.query?.configurationId || "");
  const next = String(req.query?.next || "");
  const returnTo = cookies.pilot_vercel_return_to || "/provision-project.html";

  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    return res.status(400).json({
      error: "Vercel Integration authorization state was invalid or expired.",
      code: "VERCEL_INTEGRATION_STATE_INVALID",
    });
  }

  const origin = `https://${req.headers.host}`;
  const redirectUri = `${origin}/api/vercel-auth-callback`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !data.access_token) {
    return res.status(502).json({
      error: "Vercel did not complete Pilot Integration authorization.",
      code: "VERCEL_INTEGRATION_TOKEN_EXCHANGE_FAILED",
      vercel_status: tokenResponse.status,
    });
  }

  const teamId = String(data.team_id || callbackTeamId || "");
  if (!teamId) {
    return res.status(409).json({
      error: "Install Routalk Pilot on the routalk-builder team, not a personal Vercel account.",
      code: "VERCEL_TEAM_INSTALLATION_REQUIRED",
    });
  }

  res.setHeader("Set-Cookie", [
    cookie("pilot_vercel_access_token", data.access_token, 60 * 60 * 24 * 30),
    cookie("pilot_vercel_team_id", teamId, 60 * 60 * 24 * 30),
    cookie("pilot_vercel_configuration_id", configurationId, 60 * 60 * 24 * 30),
    cookie("pilot_vercel_oauth_state", "", 0),
    cookie("pilot_vercel_return_to", "", 0),
  ]);

  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/provision-project.html";

  if (next && next.startsWith("https://vercel.com/")) {
    return res.redirect(302, next);
  }
  return res.redirect(302, safeReturnTo);
};
