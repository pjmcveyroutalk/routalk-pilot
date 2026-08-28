# Routalk Pilot provider-independent verification

This directory contains Pilot verification and release-path evidence. Its active verification contract is provider-neutral: normal development verification must not require a Vercel preview deployment or another network provider.

Run:

`node scripts/verify-release.js`

Optional evidence file:

`node scripts/verify-release.js --output pilot-verification/results/latest.json`

The verifier reads `pilot-verification/verification-manifest.v1.json`, works against the checked-out repository, and produces deterministic JSON evidence containing the source Git SHA when available, SHA-256 provenance for every declared artifact, individual PASS/FAIL checks, and a final PASS/FAIL result.

The current manifest verifies the canonical phone-to-production control surfaces only:

`index.html -> /api/queue -> /api/command -> /api/merge -> production verification`

It also covers the command contract/state, persistent command store, canonical queue processor, and the active private-queue workflow. Removed legacy recovery, dispatch, resume, and status surfaces are intentionally not part of the active manifest.

Version 1 verification supports deliberately narrow deterministic checks: `file_exists`, `contains`, and `node_syntax`.

Passing development verification is not deployment and does not mark a command complete. Verification evidence can feed the release-candidate/promotion layer, while command execution state remains separate. A command reaches completion only after its intended merge, successful deployment of the expected revision, and exact production-revision verification.

Historical `PILOT-*`, provider proof, settlement, and release evidence files in this directory are evidence unless separately classified as active code. They must not be treated as alternate command processors, merge authorities, recovery UIs, or command state sources.
