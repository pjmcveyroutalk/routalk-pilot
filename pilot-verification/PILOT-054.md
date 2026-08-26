# PILOT-054 Vercel Preview Suppression Boundary

Objective:
Before running the intentional live-provider proof, stop routine Pilot development PRs from automatically consuming Vercel preview builds.

Why this is required:
The executable release flow now proves pre-approval work should produce zero provider calls, but the repository's existing Vercel Git integration can still auto-build every PR independently of Pilot. A live proof would be invalid until that external automatic path is controlled.

Acceptance:
- routine Pilot development PRs are eligible to skip Vercel preview builds;
- production releases remain deployable after APPROVED_FOR_RELEASE;
- required non-deployment CI is not weakened;
- skipping a preview is not treated as deployment or production verification;
- behavior is explicit and reversible;
- PR #80 remains untouched.

Implementation guidance:
Use the narrowest repository-level Vercel-supported mechanism available to ignore development-only builds while preserving intentional production releases. Do not hard-disable Vercel globally. Do not store credentials.
