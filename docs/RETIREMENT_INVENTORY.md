# Routalk Pilot Retirement Inventory

This is an inventory, not deletion approval.

## Canonical active path
The active operator path is defined by `docs/ARCHITECTURE.md` and `docs/OPERATIONS.md`.

Current canonical surfaces include:
- `index.html`
- `api/queue.js`
- `api/command.js`
- `api/merge.js`
- `api/verify-production.js`
- `lib/command-contract.js`
- `lib/command-state.js`
- `lib/stores/github-issue-command-store.js`
- `scripts/process-pilot-queue.js`
- adapterized deployment observation, including `lib/vercel-deployment-observer.js`
- project onboarding/preflight/provisioning surfaces that feed the canonical queue path

## Historical/noncanonical artifacts
The architecture explicitly classifies historical Run/dispatch, recovery, provider-proof, readiness, and proof artifacts as noncanonical unless deliberately reactivated.

Known historical areas include:
- `pilot-release/`
- `pilot-verification/`
- any legacy `api/dispatch` or `api/status` path
- any legacy `resume.html`
- any legacy `pilot-recovery.js`

Presence does not mean safe to delete.

## Before any retirement
For every proposed removal:
1. inventory the exact path;
2. search current canonical code, docs, tests, and workflows for references;
3. record the current blob SHA;
4. prove the path is not used by queue, command observation, merge, provisioning, preflight, production verification, or rollback;
5. use Pilot's guarded `delete` command with exact approved blob SHA;
6. merge only through Pilot;
7. verify the resulting Pilot production revision.

No bulk cleanup and no speculative deletion.
