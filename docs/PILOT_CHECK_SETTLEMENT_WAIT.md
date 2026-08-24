# Check-Settlement Wait

PR #72 validated the merge/recovery/production lifecycle, but the phone initially displayed `Pull request checks are still pending` even though the provider statuses became successful moments later.

The merge endpoint now keeps the existing safety gate and waits briefly for genuinely pending checks to settle before returning control to the phone.

Behavior:
- real failures still block immediately;
- pending checks are re-read for up to roughly six seconds;
- Vercel duplicate status/check handling remains intact;
- if checks are still pending after the bounded wait, Pilot returns a retryable pending result;
- no CI, SHA, mergeability, authorization, or production-verification boundary is weakened.

Goal: remove the unnecessary manual `Retry merge` step when the only problem is provider propagation latency.
