# Mergeability Refresh Hardening

Pilot no longer treats GitHub's temporary `mergeable: null` / calculating state as a real conflict.

Before refusing a merge, `/api/merge` now refreshes the pull request several times. It distinguishes:

- a real conflict (`mergeable: false` or `mergeable_state: dirty`);
- GitHub still calculating mergeability (retryable);
- checks still pending (retryable);
- a genuinely clean merge.

This directly addresses the PR #52 incident where Pilot displayed “not currently mergeable” while GitHub itself reported the PR as mergeable moments later.
