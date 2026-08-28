# Routalk Pilot Retirement Inventory

Checkpoint basis: Pass 8 external E2E verified; Pass 9 canonical docs merged in PR #210. This inventory is classification only and authorizes no deletion.

## Canonical KEEP
- `index.html` — active phone operator surface.
- `api/queue.js` — authenticated queue entry.
- `api/command.js` — exact command observation and completion derivation.
- `api/merge.js` — sole merge authority.
- `api/verify-production.js` — control-repository production verifier.
- `lib/command-contract.js` — canonical command schema/validation.
- `lib/command-state.js` — canonical command states/transitions.
- `lib/stores/github-issue-command-store.js` — active command-store adapter.
- `scripts/process-pilot-queue.js` — canonical queue processor.
- `.github/workflows/routalk-pilot-private-queue.yml` — only scheduled processor workflow.
- `docs/ARCHITECTURE.md`, `docs/COMMAND_CONTRACT.md`, `docs/OPERATIONS.md`, `docs/RELEASE_VERIFICATION.md`, `docs/RECOVERY_CHECKPOINT.md` — canonical operator/architecture documentation.

## RETIRED / INACTIVE — physical removal may be considered later
Repository reference search found no active canonical-code references to these paths. They remain physically present for history/rollback until a deletion-capable, independently reviewable cleanup path exists.
- `pilot-recovery.js` — superseded by command-ID observation in `index.html`.
- `api/dispatch.js` — legacy Run/dispatch control plane.
- `api/status.js` — legacy time/workflow inference path.
- `resume.html` — legacy recovery surface; current UI resumes by exact command ID.
- `.github/workflows/routalk-pilot-bridge.yml` — already inert/retired; no schedule or processor responsibility.
- `live-provider-proof.html` and `live-provider-readiness.html` — historical provider-proof UI surfaces.
- `api/live-provider-proof.js` and `api/live-provider-readiness.js` — historical provider-proof/readiness routes, outside the canonical command completion path.
- `pilot-baseline.txt`, `pilot-private-queue-check.txt`, `PILOT_MOBILE_MERGE_VERIFICATION.md` — proof/evidence artifacts, not runtime architecture.

## HOLD / REVIEW BEFORE RETIREMENT
These are diagnostic or release-era surfaces whose durable operational value should be decided before physical removal.
- `api/provider-auth-diagnostic.js`
- `api/provider-status.js`
- `pilot-release/`
- `pilot-verification/`
- older `docs/PILOT_*` evidence notes

## Dependency-proof rule
A retirement target may be physically removed only after: current-main freeze, exact path inventory, repository-wide import/link/dispatch search, runtime route review, preserved historical evidence where useful, rollback confirmation, and a narrowly scoped cleanup review.

## Current conclusion
The active runtime architecture is already compressed. Remaining cleanup is primarily physical historical-surface retirement plus the known stale post-merge UI reconciliation defect. No new controller, queue, state source, retry layer, or operator step is justified.
