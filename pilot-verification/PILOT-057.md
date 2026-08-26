# PILOT-057 Mergeability Settlement Helper

Confirmed defect addressed:
Recent Pilot PRs repeatedly reached the protected merge step before GitHub finished calculating mergeability, forcing a manual Retry merge tap.

Objective:
Add a tested bounded settlement helper for transient GitHub mergeability=unknown/null states.

Safety:
- helper does not merge by itself;
- explicit mergeable=false/conflict returns immediately;
- true/false authoritative states are never overwritten;
- wait is bounded and times out safely;
- existing check-state, head-SHA, authorization, base/head branch and other merge protections remain separate and unchanged;
- PR #80 remains untouched.

Verification:
node --test pilot-verification/mergeability-settlement.test.mjs

Next integration:
Wire this helper into the existing protected /api/merge path before Pilot surfaces a manual retry. Do not guess or replace the existing merge endpoint until its current source is available through the Pilot build path.
