# PILOT-055 Live Provider Proof Runner

Objective:
Add the guarded executable runner for the single intentional live-provider proof.

Important:
This package itself does NOT contain credentials and does NOT automatically perform the live deployment when merged. It adds the runner that Pilot can invoke only with explicit authenticated dependencies and approval.

Acceptance:
- one approved release can invoke Vercel exactly once;
- independent production observation follows deployment;
- successful evidence reaches PRODUCTION_VERIFIED;
- failed production verification does not automatically redeploy;
- missing live dependencies fail before provider invocation;
- no credentials are committed;
- PR #80 remains untouched.

Verification:
node --test pilot-verification/live-provider-proof-runner.test.mjs

After this merges, the remaining action is to invoke this guarded path once with the configured live provider and production observer, then record/audit the evidence.
