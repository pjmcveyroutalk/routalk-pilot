# Resume Redirect Boundary

`/api/resume-last?command_id=...` validates a Pilot command identifier and redirects to the phone recovery surface.

This keeps recovery routing server-owned and gives future clients a stable navigation boundary while the main-screen persistence integration is completed.

No credential or secret is accepted in the URL.
