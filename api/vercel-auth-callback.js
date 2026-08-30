const crypto = require("node:crypto");

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
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

  const clientId = process.env.VERCEL_APP_CLIENT_ID || "";
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    return res.status(503).json({
      error: "Pilot's Vercel authorization app is not configured yet.",
      code: "VERCEL_OAUTH_APP_NOT_CONFIGURED",
    });
  }

  const cookies = parseCookies(req.headers.cookie);
  const code = String(req.query?.code || "");
  const state = String(req.query?.state || "");
  const expectedState = cookies.pilot_vercel_oauth_state || "";
  const verifier = cookies.pilot_vercel_code_verifier || "";
  const returnTo = cookies.pilot_vercel_return_to || "/provision-project.html";

  if (!code || !state || !expectedState || !verifier || !safeEqual(state, expectedState)) {
    return res.status(400).json({
      error: "Vercel authorization could not be completed because the authorization state was invalid or expired.",
      code: "VERCEL_OAUTH_STATE_INVALID",
    });
  }

  const origin = `https://${req.headers.host}`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    redirect_uri: `${origin}/api/vercel-auth-callback`,
  });

  const tokenResponse = await fetch("https://api.vercel.com/login/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !data.access_token) {
    return res.status(502).json({
      error: "Vercel did not complete Pilot authorization.",
      code: "VERCEL_OAUTH_TOKEN_EXCHANGE_FAILED",
      vercel_status: tokenResponse.status,
    });
  }

  const maxAge = Math.max(60, Number(data.expires_in) || 3600);
  const responseCookies = [
    cookie("pilot_vercel_access_token", data.access_token, maxAge),
    cookie("pilot_vercel_oauth_state", "", 0),
    cookie("pilot_vercel_code_verifier", "", 0),
    cookie("pilot_vercel_return_to", "", 0),
  ];

  if (data.refresh_token) {
    responseCookies.push(
      cookie("pilot_vercel_refresh_token", data.refresh_token, 60 * 60 * 24 * 30),
    );
  }

  res.setHeader("Set-Cookie", responseCookies);
  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/provision-project.html";

  return res.redirect(302, safeReturnTo);
};
