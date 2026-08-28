# Routalk Pilot Archive and Hygiene Policy

Routalk Pilot separates active architecture from historical evidence.

## Active documentation
Only these documents define the current runtime contract unless a newer accepted architecture decision explicitly supersedes them:
- `ARCHITECTURE.md`
- `COMMAND_CONTRACT.md`
- `OPERATIONS.md`
- `RELEASE_VERIFICATION.md`
- `RECOVERY_CHECKPOINT.md`
- `RETIREMENT_INVENTORY.md`

## Historical evidence
Proof files, incident notes, old recovery pages, provider experiments, prior command-generation docs, and superseded workflow notes may be preserved for chronology without being treated as active instructions.

## Retirement discipline
Prefer logical retirement first. Physical deletion is a separate destructive action and must pass the recovery/dependency-proof gate. Do not add deletion support to the command contract merely to accelerate hygiene.

## No-drift rule
Cleanup must reduce active surface area. A cleanup is rejected if it introduces a new controller, command state source, retry subsystem, special-case workflow, or operator step.
