# PILOT-046 Executable Release Approval

Objective:
Turn explicit release approval into executable provider-neutral behavior.

Acceptance:
- READY + approver + explicit intent => APPROVED_FOR_RELEASE;
- BLOCKED/not-ready bundles cannot be approved;
- approval cannot be inferred from merge or readiness;
- missing approver/intent fails closed;
- approval does not itself invoke deployment;
- Node tests cover approval and failure paths;
- PR #80 remains untouched.

Verification:
node --test pilot-verification/release-approval.test.mjs

Do not deploy in this increment.
