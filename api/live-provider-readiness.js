const crypto = require("node:crypto");

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBearer(req) {
  const value = req.headers?.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function scopeQuery() {
  const team = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || "";
  return team ? `?teamId=${encodeURIComponent(team)}` : "";
}

async function vercelGet(path) {
  const token = process.env.VERCEL_TOKEN || "";
  if (!token) return { ok: false, status: null, error: "missing_vercel_token" };

  try {
    const response = await fetch(`https://api.vercel.com${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });

    let body = {};
    const text = await response.text();
    try { body = text ? JSON.parse(text) : {}; } catch {}

    return {
      ok: response.ok,
      status: response.status,
      error: response.ok
        ? null
        : (body?.error?.code || body?.error?.message || `vercel_http_${response.status}`)
    };
  } catch (error) {
    return { ok: false, status: null, error: error?.message || "vercel_request_failed" };
  }
}

module.exports = async function handler(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Pilot-Request-Id", requestId);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed", requestId });
  }

  const expected = process.env.PILOT_TRIGGER_SECRET || "";
  const supplied = readBearer(req);
  if (!expected || !safeEqual(supplied, expected)) {
    return res.status(401).json({ ok: false, error: "unauthorized", requestId });
  }

  const projectId = process.env.VERCEL_PROJECT_ID || "";
  const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || "";
  const canonicalUrl =
    process.env.PILOT_PRODUCTION_URL ||
    process.env.PRODUCTION_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    "";

  const configured = {
    vercelToken: Boolean(process.env.VERCEL_TOKEN),
    vercelProjectId: Boolean(projectId),
    vercelTeamId: Boolean(teamId),
    pilotTriggerSecret: Boolean(expected),
    canonicalProductionUrl: Boolean(canonicalUrl)
  };

  const auth = configured.vercelToken
    ? await vercelGet("/v2/user")
    : { ok: false, status: null, error: "missing_vercel_token" };

  const teamAccess = auth.ok && configured.vercelTeamId
    ? await vercelGet(`/v2/teams/${encodeURIComponent(teamId)}`)
    : {
        ok: false,
        status: null,
        error: configured.vercelTeamId ? "vercel_auth_not_verified" : "missing_vercel_team_id"
      };

  const projectAccess = auth.ok && configured.vercelProjectId
    ? await vercelGet(`/v9/projects/${encodeURIComponent(projectId)}${scopeQuery()}`)
    : {
        ok: false,
        status: null,
        error: configured.vercelProjectId ? "vercel_auth_not_verified" : "missing_vercel_project_id"
      };

  const liveProviderProofReady =
    Object.values(configured).every(Boolean) &&
    auth.ok &&
    teamAccess.ok &&
    projectAccess.ok;

  return res.status(200).json({
    ok: true,
    liveProviderProofReady,
    readiness: configured,
    authorization: {
      tokenAuthenticated: auth.ok,
      tokenStatus: auth.status,
      tokenError: auth.error,
      teamAccessible: teamAccess.ok,
      teamStatus: teamAccess.status,
      teamError: teamAccess.error,
      projectAccessible: projectAccess.ok,
      projectStatus: projectAccess.status,
      projectError: projectAccess.error
    },
    requestId
  });
};

module.exports._test = { safeEqual, readBearer, scopeQuery };
