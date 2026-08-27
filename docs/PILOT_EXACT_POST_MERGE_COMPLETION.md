# Exact post-merge production completion

Pilot now treats `MERGED` as a real non-terminal lifecycle stage.

A merged command becomes `COMPLETED` only when:
1. the production application health check passes; and
2. the production runtime reports the exact merged commit SHA.

`/api/command` passes the pull request's `merge_commit_sha` to `/api/verify-production`.
`/api/verify-production` compares it against the runtime revision (`PILOT_DEPLOYED_SHA`, `VERCEL_GIT_COMMIT_SHA`, or `GITHUB_SHA`).

While production is healthy but still serving an older revision, verification reports `WAITING_FOR_REVISION` and the command remains `MERGED`.

This uses the existing Git-triggered deployment path and does not call the blocked Vercel REST/PAT provider path.
