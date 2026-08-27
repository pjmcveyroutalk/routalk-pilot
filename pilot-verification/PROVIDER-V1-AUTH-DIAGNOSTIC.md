# Provider V1 authorization diagnostic

Adds one sanitized, read-only diagnostic endpoint for isolating Vercel authorization failures.

It probes:
1. token identity authentication;
2. configured team accessibility;
3. configured project accessibility with team context.

The response exposes only booleans, HTTP status codes, normalized error codes, and a classification. It never returns the token, user identity, team ID, project ID, or provider response body.

No deployment or mutation capability is added.
