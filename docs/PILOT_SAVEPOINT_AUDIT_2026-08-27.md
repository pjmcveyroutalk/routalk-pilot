# Routalk Pilot Savepoint Audit — 2026-08-27

## Purpose
This file is the authoritative checkpoint for the current Routalk Pilot build state at the end of the 2026-08-27 audit/cleanup cycle.

## Verified production state
- Canonical repository: `pjmcveyroutalk/routalk-pilot`
- Canonical production domain: `https://routalk-pilot.vercel.app`
- Latest verified merge milestone: PR #166, `Verify Pilot approved merge authority`
- Merge commit: `a46d82e343c4b4ee6940af904c2529e0cf28e902`
- Vercel status for that merge commit: success
- Queue issue #165 was processed and closed successfully
- Smoke-test branch `chatgpt/merge-authority-smoke-20260827` was deleted after merge
- Open pull requests at savepoint: 0
- Open issues at savepoint: 0

## Proven end-to-end workflow
1. Build package originates on mobile.
2. Pilot validates the package.
3. Pilot encrypts it into the private GitHub-backed queue.
4. Private Queue workflow processes the command.
5. Pilot creates a `chatgpt/*` branch and pull request.
6. Human approval remains required for merge.
7. User can approve/merge from inside Pilot rather than manually navigating GitHub.
8. Pilot backend performs the authorized merge into `main`.
9. Vercel deploys the merged revision.
10. Pilot can observe merged state and verify production completion.

## Credential correction locked in
`PILOT_GITHUB_TOKEN` is now a repository-scoped fine-grained GitHub token with the permissions required by Pilot's current pipeline, including:
- Actions: read/write
- Contents: read/write
- Issues: read/write
- Pull requests: read/write
- Commit statuses: read
- Metadata: read

This fixed both immediate private-queue dispatch authority and Pilot-controlled approved merging.

## Architecture that should NOT be rebuilt
The following components are working and should be reused rather than duplicated:
- `api/queue.js`
- `api/merge.js`
- `api/command.js`
- `api/verify-production.js`
- `lib/command-state.js`
- GitHub issue-backed command store
- Private Queue workflow
- Mobile resume/recovery surface
- Existing human approval merge gate
- Existing deployment observation / production verification path

## Cleanup findings
- No active PR backlog remains.
- No active issue backlog remains.
- The merge-authority smoke branch is gone.
- Only two active workflow files are part of the current runtime path: the Pilot bridge and the Private Queue workflow.
- Historical `chatgpt/*` branches and verification documents remain from earlier debugging. They are historical clutter, not current runtime dependencies. Do not bulk-delete them blindly; cleanup should be deliberate and separate from active build work.
- Existing diagnostic/provider pages may remain for now, but they are not the primary product direction.

## Locked product direction
Pilot is not becoming a deployment dashboard.

The governing rule is:

> Every next feature must reduce the number of manual steps between telling Pilot what to build and Pilot confirming that the safely approved change is live.

Human approval stays at consequential production-merge boundaries by default.

## Next build phase
Move from self-hosted/self-building operation to controlled target-project operation.

The next architecture should allow Pilot to run the proven pipeline against an explicitly approved target repository while preserving:
- repository allowlisting
- encrypted command queue
- `chatgpt/*` change branches
- PR-based review
- human merge approval
- deployment observation
- exact production verification
- mobile recovery after reload/app switching

Do not create a second state machine, second queue, or second deployment subsystem to accomplish this.

## Savepoint rule
If later work drifts, conflicts, or needs recovery, return to this checkpoint and preserve the proven pipeline above before adding new behavior.
