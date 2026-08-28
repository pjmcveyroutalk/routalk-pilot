# Routalk Pilot Operations

## Normal phone workflow
1. Open Pilot.
2. Choose/import one reviewed `.pilot` package.
3. Review repository, command, branch, files, payload, and paths.
4. Submit once.
5. Follow the exact returned command ID.
6. When the PR is ready and clean, explicitly approve/merge through Pilot.
7. Wait while Pilot observes deployment and verifies production.
8. Treat the command as finished only when it reaches `COMPLETED`.

## Operational rules
- Do not retry a submission merely because command visibility is briefly delayed.
- Do not create a replacement PR for an ambiguous existing command; reconcile the existing command first.
- Do not equate merge success with production completion.
- Do not weaken path, repository, authorization, immutable revision, CI, conflict, encryption, or production-verification guards to make progress.
- Do not place secrets in packages, repository documentation, logs, or user-visible instructions.
- Server-side command state is authoritative; mobile local state is convenience only.

## Recovery
Before destructive cleanup or future deletion support, freeze a known-good commit, record the active architecture/state, inventory every affected path, and confirm a straightforward rollback. See `docs/RECOVERY_CHECKPOINT.md`.
