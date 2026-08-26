# Routalk Pilot provider-independent verification

This directory defines the first provider-neutral verification contract for Pilot.

Normal development verification must not depend on a Vercel preview deployment. The verifier operates against a checked-out repository using only local files, Git metadata when available, and Node.js built-ins. It does not call GitHub, Vercel, or another network service. Running it does not create a commit, branch, pull request, deployment, or provider-side status.

Run: `node scripts/verify-release.js`

Optional evidence file: `node scripts/verify-release.js --output pilot-verification/results/latest.json`

Output is JSON with verifier/schema versions, exact source Git SHA when available, SHA-256 per artifact, aggregate artifact SHA-256, individual PASS/FAIL checks, and final PASS/FAIL. Identical artifact bytes produce identical artifact provenance.

Version 1 supports deliberately narrow deterministic checks: `file_exists`, `contains`, and `node_syntax`. The initial manifest covers Pilot's command, queue, protected merge, recovery, production-verification code, and mobile continuity markers landed with PR #82.

Passing verification does not mean a deployment happened and does not mark a command complete. Verification evidence is an input to a later release-candidate/promotion state. Command execution state and release lifecycle state remain separate facts. Vercel remains a release/deployment adapter; production verification still happens after an approved release is deployed.
