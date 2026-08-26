# PILOT-062 — Restore executable live-provider proof chain

Restores the two missing modules imported by the existing PILOT-055 live-provider proof runner.

## Adds
- `release-flow.mjs`: provider-neutral release orchestration with bundle, approval, deployment gate, preflight, request creation, and exactly-one provider dispatch.
- `production-verification.mjs`: provider-independent revision and required-health verification.
- Focused tests for both modules.

## Safety
This package does not invoke Vercel and does not contain credentials. It restores and verifies the local executable chain before the guarded live-provider endpoint is wired or used.
