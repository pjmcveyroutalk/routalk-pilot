# Routalk Pilot Architecture

## Canonical responsibilities
1. Phone UI: package review, submission, command observation, approval.
2. Queue API: authenticate, validate, encrypt, and enqueue one command.
3. Command store: durable command identity and queue record.
4. Processor: execute one validated apply command into an isolated `chatgpt/*` branch and PR.
5. Protected merge: `/api/merge` is the sole merge authority.
6. Production verification: observe deployment and prove the exact merged revision is live before completion.

Supporting contracts: one command schema (`lib/command-contract.js`), one command state model (`lib/command-state.js`), one repository allowlist, one command store, and adapterized deployment observation.

## Active path
Package -> `/api/queue` -> encrypted command record -> private queue processor -> PR -> `/api/command` -> `/api/merge` -> deployment observation -> target production verifier -> `COMPLETED`.

## Architecture rules
- Pilot is the write/control path.
- GitHub is an execution/provider boundary, not a second Pilot controller.
- No competing queue, merge authority, state model, retry controller, or operator workflow.
- Deployment observation and production verification are separate facts.
- `MERGED` may persist indefinitely; it is not failure and is not completion.
- Historical Run/dispatch, recovery, provider-proof, readiness, and proof artifacts are noncanonical unless explicitly reactivated by a future architecture decision.
