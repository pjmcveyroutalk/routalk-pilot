# Production Verification Boundary

`GET /api/verify-production` is an authenticated, provider-neutral production smoke check.

It verifies the currently served Pilot root surface from the same deployment host and returns only `READY` after an HTTP-successful response contains Pilot's expected identity markers.

This intentionally does not claim that a specific provider deployment succeeded. It establishes a truthful application-level verification boundary first, so Pilot can distinguish **merged** from **actually serving correctly** without coupling the command model permanently to Vercel.
