# Package Continuity Validation Control

PR #76 made reviewed-but-unsubmitted packages survive same-session recovery navigation. This change adds a small explicit phone-side validation control to make that behavior testable without relying on timing or remembering which navigation path to use.

When a package is visible in Package review, `Test recovery navigation` opens the existing recovery page. Returning with `Back to Pilot` should restore the package review from session storage.

This control does not submit, queue, modify, or merge anything. It does not store the trigger secret. It exists to validate the continuity behavior introduced in PR #76 before we build more orchestration on top of it.
