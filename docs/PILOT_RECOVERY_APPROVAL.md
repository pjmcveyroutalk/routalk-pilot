# Recovery Approval Continuity

A recovered command that reaches `AWAITING_APPROVAL` now exposes Pilot's protected merge action directly on the recovery surface.

The merge still goes through `/api/merge`, which independently validates authentication, the `chatgpt/*` branch boundary, `main` as the target, mergeability, and GitHub checks before merging.

This closes the phone-reload gap from accepted command through approval and merge without persisting credentials.
