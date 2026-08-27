# Provider Subsystem V1 — team-context correction

Vercel team-owned resources addressed by ID require the owning team context. The provider adapter now owns that context centrally and appends `teamId` to every Vercel REST request it makes.

This is a correction inside Provider Subsystem V1, not a new provider layer.

Safety remains unchanged:
- no provider deployment is executed by this package;
- live production deployment still requires the existing explicit one-shot confirmation and approval intent;
- the public provider status remains sanitized and exposes only booleans/status results.
