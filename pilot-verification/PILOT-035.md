# PILOT-035 Release Promotion Contract

Builds on merged PILOT-032, PILOT-033, and PILOT-034.

Objective:
Create the explicit provider-neutral promotion boundary between a READY release candidate and deployment.

Acceptance:
- release candidate creation/validation still causes zero deployment-provider builds;
- explicit APPROVED_FOR_RELEASE is required before invoking a deployment adapter;
- promotion policy contains no Vercel-specific dependency;
- development-verification evidence remains associated with the release;
- deployment success is not treated as production verification;
- existing protections remain intact;
- PR #80 remains untouched.

Keep the increment narrow and phone-workflow neutral.
