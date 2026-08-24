# Reload Recovery Hardening

The resume surface now remembers only the most recent `command_id` in device-local storage.

This directly addresses the observed mobile reload failure: the backend had accepted the command, but the browser lost the visible state. The command identifier is non-secret recovery metadata; the Pilot trigger secret is never persisted.

A later main-screen integration should save the command ID immediately after `/api/queue` accepts a package and provide a visible “Resume last command” action.
