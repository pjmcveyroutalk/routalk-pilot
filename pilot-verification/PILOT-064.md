# PILOT-064 — Make live-provider readiness prove authorization

Replaces presence-only readiness with authenticated, read-only Vercel preflight.

## What readiness now proves
- VERCEL_TOKEN exists and authenticates against Vercel.
- Configured VERCEL_TEAM_ID/VERCEL_ORG_ID is accessible to that token.
- Configured VERCEL_PROJECT_ID is accessible under that team scope.
- Pilot trigger secret and canonical production URL are configured.
- `liveProviderProofReady` is true only when all configuration and authorization checks pass.

## Safety
- Read-only GET requests only.
- No deployment is created.
- No provider write occurs.
- No secret/token value is returned.
- Diagnostic output identifies auth/team/project failure separately.
