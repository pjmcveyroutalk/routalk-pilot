# PILOT-038 Deployment Trigger Policy

Objective:
Turn the release/deployment contracts into actual policy by preventing routine development work from consuming deployment-provider capacity before explicit release promotion.

Acceptance:
- routine contract/metadata development packages default to no deployment request;
- BUILDING, VERIFIED, and RELEASE_CANDIDATE states do not request deployment;
- APPROVED_FOR_RELEASE is the normal deployment boundary;
- provider-specific skip implementation stays behind the deployment adapter;
- skipped deployment is never treated as production verification;
- existing safety/merge protections remain intact;
- PR #80 remains untouched.

Important:
This increment should implement the policy boundary without weakening required CI. It should not blindly disable all checks or all deployments. If repository/provider configuration cannot yet selectively suppress preview deployments, add the provider-neutral policy and the narrow adapter hook needed for the next step rather than introducing a broad bypass.
