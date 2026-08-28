# Routalk Pilot Command Contract

Canonical implementation: `lib/command-contract.js`.

Version 1 supports two queue actions:

- `apply`: replace 1-20 safe files on an isolated `chatgpt/*` branch.
- `delete`: remove 1-10 explicitly approved files on an isolated `chatgpt/*` branch.

Both actions require a valid unique `command_id`, allowlisted `repository`, and safe `chatgpt/*` branch.

## Apply safety
- maximum 20 files;
- maximum 32,000 decoded bytes per file;
- maximum 32,000 decoded bytes combined;
- no absolute paths, empty path segments, `.` or `..`;
- `.git` and `.github/workflows/*` targets are blocked;
- duplicate target paths are blocked.

## Delete safety
Deletion is fail-closed and intentionally narrower than apply:
- maximum 10 deletion targets;
- every target must include its exact approved 40-character Git blob SHA as `expected_blob_sha`;
- the processor re-reads the blob SHA from current `main` and refuses deletion if the file changed after approval;
- all `.github/*` paths are blocked from deletion;
- canonical control files are hard-protected, including the phone UI, queue, command observer, merge authority, production verifier, command contract/state, command store, and queue processor;
- duplicate deletion targets are blocked;
- deletion only creates an isolated PR; it never deletes directly from `main`.

Merge is not a queue action. `/api/merge` remains the sole merge authority.

Canonical states remain defined by `lib/command-state.js`: `RECEIVED`, `VALIDATED`, `QUEUED`, `DISPATCHING`, `RUNNING`, `AWAITING_APPROVAL`, `MERGED`, `COMPLETED`, `FAILED`. Terminal states are `COMPLETED` and `FAILED`.
