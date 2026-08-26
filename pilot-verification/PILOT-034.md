# PILOT-034 Release Candidate Contract

Builds on merged PILOT-032 and PILOT-033.

Objective:
Package one or more provider-independently verified changes into a release candidate without consuming deployment-provider capacity.

Acceptance:
- only PASSED verification results are eligible;
- required failures block the release candidate;
- release-candidate creation/validation does not invoke Vercel or another deployment adapter;
- deployment remains behind explicit APPROVED_FOR_RELEASE promotion;
- existing merge/deployment protections remain intact;
- PR #80 remains unrelated and untouched.

Keep this increment narrow and provider-neutral.
