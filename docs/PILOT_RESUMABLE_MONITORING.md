# Resumable Command Monitoring

Pilot now reports the processed-queue / no-PR interval as `RUNNING` rather than incorrectly treating it as complete.

The mobile resume surface keeps the trigger secret only in ephemeral page memory after a successful lookup and automatically refreshes while the command is `QUEUED`, `DISPATCHING`, or `RUNNING`.

Nothing sensitive is written to localStorage or sessionStorage. Reloading the page still requires authentication again.
