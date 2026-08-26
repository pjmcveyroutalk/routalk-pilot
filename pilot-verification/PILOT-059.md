# PILOT-059 Clean Rebase of Mergeability Fix

Reason:
PR #136 and PR #138 are both now authoritatively reported by GitHub as mergeable=false. Repeated retry taps cannot repair a real conflict.

This replacement combines the helper and real protected merge integration into one fresh Pilot package created from the current main-path source inspected read-only.

Rules:
- do not merge PR #136;
- do not merge PR #138;
- do not touch PR #80;
- preserve all protected merge safeguards;
- transient unknown/null mergeability is settled inside Pilot;
- true conflicts still fail immediately;
- bounded waits prevent indefinite loops.

After this replacement merges, validate with the next newly-created PR. The success condition is that a normal clean PR no longer requires a manual Retry merge tap solely because GitHub was still computing mergeability.
