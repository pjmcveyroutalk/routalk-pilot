# Pending Package Session Recovery

The phone-first audit exposed a friction bug: opening the command recovery screen and returning to Pilot discarded an imported package that had been reviewed but not yet submitted.

Pilot now treats that reviewed package as temporary device-session workspace:

- after a package passes the existing validation, its command payload is stored in `sessionStorage`;
- navigating to command recovery and back, or reloading the same browser tab, restores the review;
- the restored payload is validated again before it is trusted;
- selecting a replacement package clears the prior pending copy;
- successful encrypted queue submission clears the pending copy;
- the Pilot trigger secret is never stored with the package;
- storage failure does not block normal in-page submission.

`sessionStorage` is intentional. This is temporary phone workspace, not authoritative backend state, and it is scoped to the browser session instead of becoming permanent device storage.
