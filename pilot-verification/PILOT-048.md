# PILOT-048 Deployment Request Envelope

Objective:
Create the executable provider-neutral request envelope handed to a deployment adapter after successful preflight.

Acceptance:
- requires READY preflight;
- requires release candidate, source revision, environment, and configured adapter;
- carries verification evidence forward;
- missing requirements fail closed;
- creating the request does not itself invoke a provider;
- tests cover ready/block paths;
- PR #80 remains untouched.

Verification:
node --test pilot-verification/deployment-request.test.mjs

No actual deployment in this increment.
