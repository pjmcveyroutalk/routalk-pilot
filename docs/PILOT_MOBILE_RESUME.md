# Mobile Resume Surface

This page is the first user-facing consumer of `/api/command`.

It proves a key Pilot requirement: the phone/browser session can disappear without losing the ability to recover the command's current state.

The page accepts a `command_id` and the normal Pilot trigger secret, then displays Pilot lifecycle state and any associated pull request. It stores neither the trigger secret nor provider credentials.

This is deliberately a separate surface for verification before it is integrated into the main Pilot home screen.
