# PILOT-044 Executable Deployment Gate

This is the transition from policy/contracts into executable behavior.

Objective:
Implement and test a provider-neutral deployment-gate decision engine.

Acceptance:
- BUILDING, VERIFIED, and RELEASE_CANDIDATE return SKIP;
- APPROVED_FOR_RELEASE + explicit deployment intent returns ALLOW;
- APPROVED_FOR_RELEASE without explicit intent returns BLOCK;
- unknown/missing states fail closed with BLOCK;
- every result starts with providerInvoked=false because this pure gate never calls a provider;
- implementation has no Vercel/provider SDK dependency;
- Node's built-in test runner covers the gate decisions;
- PR #80 remains untouched.

Verification command:
node --test pilot-verification/deployment-gate.test.mjs

Do not trigger an actual deployment in this increment.
