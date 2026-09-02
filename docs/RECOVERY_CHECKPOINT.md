# Routalk Pilot Recovery Checkpoint — 2026-09-02

## Known-good baseline
Repository: `pjmcveyroutalk/routalk-pilot`
Baseline main SHA before this checkpoint package: `b344685e2065a5fd8f9df1fc2fc5b941075fed0d`

That baseline contains the Vercel revision-observability repair from PR #475.

## Canonical architecture
Pilot is the write/control path.

`package -> /api/queue -> encrypted queue record -> private queue processor -> PR -> /api/command -> /api/merge -> deployment observation -> target production verifier -> COMPLETED`

Canonical responsibilities and contracts remain in:
- `docs/ARCHITECTURE.md`
- `docs/COMMAND_CONTRACT.md`
- `docs/OPERATIONS.md`
- `docs/RELEASE_VERIFICATION.md`

Do not reactivate historical dispatch, recovery, provider-proof, readiness, or proof paths without an explicit architecture decision.

## Proven external-target checkpoint
The Daycare target was used only as an external Pilot fixture.

Command `DAYCARE-FOUNDATION-20260902` traversed the canonical Pilot release path and ultimately reported `COMPLETED` after the Pilot Vercel observer was hardened.

The production-observation defect exposed by that proof was fixed in `lib/vercel-deployment-observer.js`: Pilot now resolves a Vercel project slug to its canonical project ID and hydrates bounded deployment details when list records omit Git revision metadata. Exact merged-revision matching remains mandatory.

## Recovery rule
If a future session encounters ambiguous state:
1. Read GitHub `main` first.
2. Compare current main to this checkpoint and later verified checkpoints.
3. Reconcile the existing command before creating a replacement.
4. Never infer failure from provider/connector blindness alone.
5. Never weaken queue, merge, revision, CI, authentication, or production-verification guards to make progress.
6. Restore through an isolated Pilot PR, not an ad-hoc direct edit.

## Known open governance item
At audit time, GitHub reported `main` itself as not branch-protected. Pilot's application architecture still makes `/api/merge` the sole canonical merge authority, but repository-level enforcement should be treated as a separate governance-hardening item. Do not silently change repository rules during recovery; research, stage, and verify that change independently.
