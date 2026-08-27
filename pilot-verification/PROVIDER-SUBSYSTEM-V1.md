# Provider subsystem v1

This checkpoint consolidates live-provider transport into one Vercel provider module.

Active contract:
- `lib/providers/vercel.js` owns Vercel transport, project authorization, production deployment and observation.
- readiness and live proof consume that same module instead of duplicating provider logic.
- `/api/provider-status` is read-only and sanitized: it exposes booleans/status codes only, never tokens, secrets, project IDs or deployment mutation controls.
- project-resource access is the authoritative authorization check.
- the guarded one-shot confirmation and verification flow remain unchanged.

PILOT-063, PILOT-064 and PILOT-065 remain historical records. They do not define current provider behavior after this checkpoint.
