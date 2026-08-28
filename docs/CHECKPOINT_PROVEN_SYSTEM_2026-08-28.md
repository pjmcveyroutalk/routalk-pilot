# Routalk Pilot Proven-System Checkpoint — 2026-08-28

## Checkpoint commit
Canonical `main` at checkpoint:

`071edc8d097740dcda9665954e918dc744b13714`

Commit: `Define the canonical end-to-end proof (#250)`

## Proven canonical path
The active control path is:

Phone package -> `/api/queue` -> encrypted queue record -> deterministic pre-PR verification -> isolated `chatgpt/*` branch -> PR -> explicit Pilot merge approval -> deployment observation -> exact production revision verification -> `COMPLETED`.

Pilot remains the canonical control path. GitHub and Vercel are provider/execution boundaries, not competing operator workflows.

## Positive-path proof
Command:

`PILOT-PASS20-CANONICAL-E2E-PROOF-20260829`

Result:
- package accepted by Pilot;
- deterministic verification passed;
- PR #250 was created;
- PR #250 merged to `main`;
- merged commit is `071edc8d097740dcda9665954e918dc744b13714`;
- GitHub/Vercel deployment status for that commit is successful.

## Negative-path proof
Command:

`PILOT-PROOF-TERMINAL-FAILURE-20260829`

The package intentionally contained invalid JavaScript.

Observed result:
- deterministic pre-PR verification rejected the payload;
- no PR was created;
- queue issue #251 closed with `state_reason: not_planned`;
- the scheduled retry loop stopped;
- the mobile UI reported the terminal failure and told the operator to correct the package and submit a new command.

This proves permanent invalid-package failures stop before repository mutation while the phone receives a clear terminal state.

## Reliability protections now active
- deterministic pre-PR verification;
- generic JSON and JavaScript payload syntax checks;
- PR-creation reconciliation and orphan cleanup;
- orphan recovery restricted to a branch carrying the exact Pilot command marker;
- transient merge auto-retry;
- post-merge deployment observation;
- exact production revision verification before `COMPLETED`;
- terminal deterministic failures persist as `FAILED`;
- mobile UI stops polling on terminal `FAILED`;
- command ID survives mobile/browser interruption without persisting the trigger secret.

## Clean repository state
At this checkpoint:
- no open pull requests;
- only `main` remains as a repository branch;
- no proof file from the intentional invalid-JavaScript package reached the repository.

## Resume point
Do not add hardening passes simply because another edge case can be imagined.

Next work should be driven by one of:
1. a failure discovered in real Pilot use;
2. generalizing the proven control loop to additional target repositories;
3. reducing remaining phone-side manual intervention;
4. product packaging and operator UX.

Preserve the proven lifecycle and exact-production completion contract while doing so.
