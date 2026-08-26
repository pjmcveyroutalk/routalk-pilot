# PILOT-056 Live Provider Readiness Probe

Objective:
Before the intentional one-shot live Vercel proof, verify whether the canonical Pilot deployment already has the required non-secret environment configuration.

This increment adds:
- /api/live-provider-readiness — authenticated POST endpoint that returns booleans only, never secret values;
- /live-provider-readiness.html — phone-first page using the existing Pilot trigger secret to call the probe.

The probe checks only configuration presence:
- VERCEL_TOKEN
- VERCEL_PROJECT_ID
- optional VERCEL_TEAM_ID / VERCEL_ORG_ID
- PILOT_TRIGGER_SECRET
- canonical production URL environment presence

Safety:
- no deployment is triggered;
- no secret values are returned or stored;
- unauthorized requests fail closed;
- PR #80 remains untouched.

Purpose:
If readiness is green, the next package can wire the one-shot live deployment endpoint. If required provider credentials are absent, Pilot will surface exactly what is missing before we spend a deployment.
