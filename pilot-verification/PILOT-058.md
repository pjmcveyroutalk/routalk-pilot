# PILOT-058 Integrate Mergeability Settlement Into Protected Merge

This is the actual recurring-retry fix.

Read-only source inspection confirmed the current protected endpoint already performs a short mergeability wait, but it returns a manual retry before running its existing check-settlement phase when GitHub still reports mergeable=null/unknown.

Change:
- preserve every existing authorization, repository, branch, draft-ready, head-SHA, conflict, check-state, merge-retry, reconciliation, and branch-cleanup safeguard;
- modestly extend the bounded initial mergeability poll;
- when mergeability is still transiently unknown, do NOT immediately return to the phone;
- allow the existing bounded check settlement to run;
- re-read authoritative PR mergeability after checks settle;
- merge only if the same immutable head SHA is still open/clean/mergeable;
- real conflicts still stop immediately;
- if GitHub genuinely never settles, return a bounded retryable error rather than looping indefinitely;
- PR #80 remains untouched.

This replaces api/merge.js using its current main-branch source as the baseline and changes only the transient mergeability handling.
