# Merge Denial Visibility

PR #64 added structured merge-denial diagnostics, but the existing phone surfaces display only the API's top-level `error` string.

That means the nested GitHub denial details would still be invisible to the operator.

This small bridge change also places the sanitized GitHub HTTP status and message in the top-level error string while preserving the structured `denial` object.

No credentials, authorization values, tokens, or response headers are surfaced.

Validation:
- If the next merge succeeds, the final merge path is operational.
- If it fails, the existing phone UI will display the exact sanitized GitHub denial reason without requiring browser developer tools.
