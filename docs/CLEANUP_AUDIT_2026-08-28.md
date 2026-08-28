# Routalk Pilot Cleanup Audit — 2026-08-28

## Current result
The repository is operationally clean at the checkpoint: there are no open PRs and only the `main` branch remains.

No canonical runtime file currently needs deletion for the system to continue working.

## Cleanup candidates
The remaining clutter is primarily historical documentation and one intentionally retired workflow stub.

### Historical diagnostic/proof documents
`docs/` still contains many `PILOT_*.md` files created while individual reliability problems were being solved. The canonical documents already state that historical proof and diagnostic files are noncanonical unless explicitly referenced.

These files are candidates for a later archive/delete pass, but they should not be bulk-deleted without first confirming that no canonical document still links to them.

### Retired workflow stub
`.github/workflows/routalk-pilot-bridge.yml` is explicitly named and implemented as retired. It only prints that the old ChatGPT Drive Bridge is retired and that the private queue is canonical.

It is a strong cleanup candidate. The normal Pilot package contract intentionally cannot modify `.github/workflows/*`, so removing it should be a separate protected/manual workflow change rather than bypassing that guard.

### README status
The prior README status still described the project as being in stabilization/hygiene after an external-repository E2E lifecycle. That wording is stale after the current control loop proof and is corrected by the checkpoint package.

## Cleanup rule
Do not turn repository cleanup into a new development phase.

Only remove an artifact when:
- it is clearly noncanonical;
- nothing active references it;
- removal cannot weaken recovery or verification;
- the change can be reviewed as a narrow deletion package or protected workflow change.

The proven phone-first pipeline is now more important than cosmetic repository tidiness.
