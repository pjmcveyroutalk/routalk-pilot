# PILOT-039 Deployment Adapter Gate

Builds on merged PILOT-038.

Objective:
Put the deployment-trigger policy directly at the deployment-adapter boundary.

Acceptance:
- BUILDING / VERIFIED / RELEASE_CANDIDATE work returns SKIP before provider invocation;
- APPROVED_FOR_RELEASE plus explicit deployment intent returns ALLOW;
- ambiguous approval returns BLOCK rather than deploying;
- SKIP is not treated as deployment success or production verification;
- required CI remains unchanged;
- gate decision/reason is auditable;
- PR #80 remains untouched.

This is a narrow adapter-gating increment. Do not globally disable Vercel or required repository checks.
