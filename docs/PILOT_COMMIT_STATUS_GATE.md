# Commit Status Gate Hardening

PR #56 exposed a second false-negative merge condition.

GitHub's aggregate commit-status `state` can lag behind its individual status contexts. Pilot previously rejected a merge whenever that aggregate remained `pending`, even when every returned provider status was already `success`.

The merge gate now evaluates the actual returned status contexts:

- any `failure` or `error` blocks the merge;
- any genuinely `pending` context asks the user to retry;
- all returned contexts successful allows the merge even if GitHub's aggregate cache has not caught up;
- check runs remain independently enforced.

This preserves the safety gate without allowing a stale aggregate value to override the concrete provider results.
