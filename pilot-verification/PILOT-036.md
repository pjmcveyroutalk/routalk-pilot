# PILOT-036 Deployment Adapter Contract

Builds on merged PILOT-032 through PILOT-035.

Objective:
Define the replaceable deployment-adapter interface behind the explicit release-promotion boundary.

Acceptance:
- routine build/verification does not invoke the adapter;
- deployment requires APPROVED_FOR_RELEASE;
- core orchestration is provider-neutral;
- adapter exposes preflight, deploy, status, and evidence;
- blocked/failed/degraded deployment preserves recoverable state;
- DEPLOYED remains distinct from PRODUCTION_VERIFIED;
- PR #80 remains untouched.

This increment defines the adapter boundary only. Do not perform an actual deployment or add unrelated provider-specific behavior.
