# PILOT-045 Executable Release Bundle Readiness

Objective:
Move release-bundle readiness from contract into executable provider-independent behavior.

Acceptance:
- multiple PASSED packages produce READY;
- failed/missing verification produces BLOCKED with deterministic reasons;
- empty/malformed bundles fail closed;
- evaluation never invokes a deployment provider;
- tests use Node built-in test runner;
- PR #80 remains untouched.

Verification:
node --test pilot-verification/release-bundle-readiness.test.mjs

Do not deploy in this increment.
