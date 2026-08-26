# PILOT-040 Deployment Gate Decision Evidence

Builds on merged PILOT-039.

Objective:
Make deployment gating auditable and provable.

Acceptance:
- every ALLOW / SKIP / BLOCK decision has deterministic evidence;
- SKIP and BLOCK explicitly prove provider_invoked=false;
- ALLOW is authorization, not deployment success;
- gate evidence is tied to the release candidate;
- no decision alone can become PRODUCTION_VERIFIED;
- existing CI and safety protections remain unchanged;
- PR #80 remains untouched.

Keep this increment narrow. Do not trigger a deployment.
