# Duplicate Provider Check Hardening

PR #60 exposed the remaining merge-gate false negative.

Vercel can publish the same deployment result through both GitHub commit statuses and GitHub check-runs. The concrete Vercel status contexts were already successful, while a duplicate Vercel check-run representation could still be pending briefly.

Pilot now distinguishes those representations:

- failed completed check-runs still block;
- pending non-Vercel check-runs still block;
- failed or pending commit-status contexts still block;
- a pending Vercel check-run is ignored only when a concrete Vercel commit-status context for the same commit has already succeeded.

This keeps the safety gate intact while preventing duplicate provider reporting from falsely trapping an otherwise clean PR in `pending`.
