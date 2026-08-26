# PILOT-047 Executable Deployment Preflight

Objective:
Add executable provider-neutral deployment preflight after explicit release approval.

Acceptance:
- APPROVED_FOR_RELEASE is required;
- explicit deployment intent is required;
- configured deployment adapter is required;
- target environment is required;
- missing conditions fail closed with deterministic reasons;
- preflight never invokes the provider;
- Node tests cover ready/block paths;
- PR #80 remains untouched.

Verification:
node --test pilot-verification/deployment-preflight.test.mjs

Do not perform an actual deployment in this increment.
