# PILOT-065 — Scope-aware Vercel authorization

PILOT-064 incorrectly made user-level authentication and an independently configured team ID mandatory gates.

PILOT-065 makes access to the configured Vercel project the authoritative readiness check for scoped tokens. User/team probes remain diagnostic only. The live-provider path uses the same scope-aware semantics for project lookup, deployment creation, polling, and observation.

Safety boundaries remain unchanged: this package performs no provider deployment; the live proof still requires explicit one-shot confirmation and approval intent.
