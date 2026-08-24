# Durable Pending Package Workspace

The first continuity proof failed on the operator's Android browser: `sessionStorage` did not reliably survive the Pilot -> recovery -> Pilot navigation path.

Pilot now uses a deliberately short-lived `localStorage` workspace for the reviewed package instead.

Safety properties:
- only the already validated package command is stored;
- the Pilot trigger secret is never stored;
- restored content is validated again before display/submission;
- the pending package expires after 30 minutes;
- successful queue submission clears it;
- importing a replacement clears the old copy;
- this remains non-authoritative convenience state. GitHub/Pilot command state remains authoritative after submission.

This targets Android/mobile navigation behavior without changing queue encryption, merge gates, CI checks, SHA checks, recovery authority, or production verification.
