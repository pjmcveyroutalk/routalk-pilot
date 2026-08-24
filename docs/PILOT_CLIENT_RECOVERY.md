# Client Recovery Helper

`pilot-recovery.js` centralizes non-secret command recovery metadata for the phone client.

It intentionally persists only `command_id`. It never stores the Pilot trigger secret, GitHub credentials, queue encryption material, or provider tokens.

The next main-screen integration can call `PilotRecovery.rememberCommandId(result.command_id)` immediately after `/api/queue` accepts a command, then expose `PilotRecovery.resumeUrl()` after a reload.
