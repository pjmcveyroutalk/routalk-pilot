# PILOT-033 Verification Result Contract

Builds directly on PILOT-032.

This increment defines the provider-independent result contract Pilot can use after running development verification.

Acceptance:
- deterministic machine-readable result;
- required failures block release-candidate eligibility;
- a passing result can advance work toward RELEASE_CANDIDATE;
- no deployment-provider invocation is required for this development-verification result;
- existing merge/deployment protections remain unchanged;
- PR #80 remains unrelated and untouched.

Keep this increment narrow. Do not redesign unrelated orchestration.
