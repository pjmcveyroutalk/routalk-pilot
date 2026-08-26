# PILOT-043 Release Approval Evidence

Builds on merged PILOT-042.

Objective:
Create the explicit auditable approval record that moves a READY release bundle to APPROVED_FOR_RELEASE.

Acceptance:
- only READY bundles can be approved;
- approval is explicit and attributable;
- merge/verification/bundle creation cannot imply approval;
- approval is provider-neutral;
- approval permits deployment-adapter preflight but is not itself deployment success;
- PR #80 remains untouched.

Do not trigger an actual deployment in this increment.
