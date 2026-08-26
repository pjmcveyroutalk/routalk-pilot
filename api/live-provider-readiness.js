function readBearer(req) {
  const value = req.headers?.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const expected = process.env.PILOT_TRIGGER_SECRET || "";
  const supplied = readBearer(req);

  if (!expected || !supplied || supplied !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  // Never return secret values. This endpoint reports presence/readiness only.
  const readiness = {
    vercelToken: Boolean(process.env.VERCEL_TOKEN),
    vercelProjectId: Boolean(process.env.VERCEL_PROJECT_ID),
    vercelTeamId: Boolean(process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID),
    pilotTriggerSecret: Boolean(process.env.PILOT_TRIGGER_SECRET),
    canonicalProductionUrl: Boolean(
      process.env.PILOT_PRODUCTION_URL ||
      process.env.PRODUCTION_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL
    )
  };

  const required = [
    readiness.vercelToken,
    readiness.vercelProjectId,
    readiness.pilotTriggerSecret,
    readiness.canonicalProductionUrl
  ];

  return res.status(200).json({
    ok: true,
    liveProviderProofReady: required.every(Boolean),
    readiness
  });
}
