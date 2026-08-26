# PILOT-032 Provider-Independent Verification Manifest

This increment establishes a deterministic verification-manifest foundation for routine development work.

Rules:
- Development verification must not require a Vercel deployment.
- Required verification failures block release-candidate promotion.
- Existing merge and deployment protections remain intact.
- Deployment remains a later promotion boundary.
- PR #80 is unrelated and must remain untouched.
