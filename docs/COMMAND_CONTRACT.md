# Routalk Pilot Command Contract

Canonical implementation: `lib/command-contract.js`.

A command is version 1 and uses action `apply` only. Required fields are a valid `command_id`, allowlisted `repository`, safe `chatgpt/*` branch, and 1-20 file replacements. Optional metadata includes commit message, PR title, and PR body.

Safety limits:
- maximum 20 files;
- maximum 32,000 decoded bytes per file;
- maximum 32,000 decoded bytes combined;
- no absolute paths, empty path segments, `.` or `..`;
- `.git` and `.github/workflows/*` targets are blocked;
- duplicate target paths are blocked;
- command IDs are unique and duplicate queue submission fails closed.

Merge is deliberately not a queue action. `/api/merge` is the sole merge authority.

Canonical states are defined by `lib/command-state.js`: `RECEIVED`, `VALIDATED`, `QUEUED`, `DISPATCHING`, `RUNNING`, `AWAITING_APPROVAL`, `MERGED`, `COMPLETED`, `FAILED`. Terminal states are `COMPLETED` and `FAILED`.
