# Main Screen Recovery Integration

The main Pilot phone surface now loads `pilot-recovery.js`.

After `/api/queue` accepts a command, the UI immediately saves only the returned non-secret `command_id` before monitoring begins. A visible **Resume last command** button is then available, including after a browser reload.

The Pilot trigger secret is still never persisted by the page. Recovery requires authentication again on the resume surface.

This directly addresses the observed failure mode where a mobile page reload erased the visible monitoring state even though the backend had already accepted the command.
