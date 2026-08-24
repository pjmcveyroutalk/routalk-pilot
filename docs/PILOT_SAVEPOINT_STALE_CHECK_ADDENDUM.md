# Save-Point Audit Addendum — Stale Check Presentation

Known-good baseline before this change:
- PR #72 merged successfully.
- recovered command state: COMPLETED.
- production verification: READY.
- post-merge reconciliation on main.

Observed remaining defect:
The first merge attempt can happen just before provider check state propagates, causing a stale red pending message even though the same PR is mergeable and provider statuses are already succeeding moments later.

Correction:
Use a bounded server-side settle window before returning `pending`.

This is deliberately a synchronization fix, not a weaker merge policy.
