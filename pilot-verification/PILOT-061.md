# PILOT-061 Authoritative Merge Attempt

Root cause:
GitHub can persist `mergeable: null` / `mergeable_state: "unknown"` for otherwise clean PRs. PILOT-059 moved the retry later but still required the optional metadata hint to become true.

Fix:
- preserve authentication;
- preserve repository/base/head branch restrictions;
- preserve immutable expected head SHA;
- preserve draft handling;
- preserve explicit known-conflict blocking (`mergeable === false` / `dirty`);
- preserve check/status settlement and failure blocking;
- preserve bounded merge retries and post-attempt reconciliation;
- allow only the specific transient GitHub metadata state `mergeable == null` + `mergeable_state == unknown` to proceed to GitHub's authoritative merge endpoint;
- GitHub's merge endpoint remains free to reject an actual non-mergeable PR;
- no indefinite waiting;
- no broad bypass of conflict or CI protections.

Validation:
PR #142 remains open and is the existing post-fix validation target. Do not create another validation PR. Once this fix is landed and deployed, retry #142 through Pilot. Success means the old metadata-only retry no longer blocks the protected merge.
