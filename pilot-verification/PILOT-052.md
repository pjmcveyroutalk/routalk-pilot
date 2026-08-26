# PILOT-052 Vercel Adapter Boundary

Objective:
Add the first concrete deployment-provider adapter behind Pilot's provider-neutral dispatcher.

Acceptance:
- Vercel-specific behavior is isolated in the adapter;
- adapter receives the provider-neutral deployment request;
- SKIP paths never call the injected Vercel client;
- ALLOW paths call the adapter exactly once;
- malformed requests fail closed before provider invocation;
- no credentials are committed;
- tests use an injected fake client and therefore consume zero real Vercel deployments;
- PR #80 remains untouched.

Verification:
node --test pilot-verification/vercel-adapter.test.mjs

Important:
This establishes the real-provider boundary but deliberately does not perform the live deployment yet. The next proof can use an explicitly approved release and one intentional provider invocation.
