# Routalk Pilot release-candidate contract

Pilot now separates **development verification** from **release/deployment**.

`create-release-candidate.js` consumes the machine-readable PASS evidence produced by `scripts/verify-release.js` and creates a provider-neutral release-candidate manifest.

## Flow

```text
changes
  -> provider-independent verification
  -> PASS evidence
  -> release candidate (VERIFIED)
  -> explicit approval/promotion
  -> deployment adapter
  -> production verification
```

Creating a candidate does **not** deploy anything and does not call Vercel, GitHub, or any other network provider.

## Create a candidate

```sh
node scripts/verify-release.js \
  --output pilot-verification/results/latest.json

node scripts/create-release-candidate.js \
  --verification pilot-verification/results/latest.json \
  --output pilot-release/candidates/latest.json
```

The candidate will only be created when:

- verification result is `PASS`
- source Git SHA is exact and valid
- every artifact is present and SHA-256 hashed
- every verification check is `PASS`
- the aggregate artifact digest is valid

## Lifecycle

A newly created candidate starts as:

```json
{
  "state": "VERIFIED",
  "approved_for_release": false,
  "deployed": false,
  "deployment_provider": null,
  "production_verified": false
}
```

This is intentional. **Verification is not deployment.** A later promotion layer will explicitly approve a verified candidate and hand it to a deployment adapter.

Vercel remains the current production adapter, but this contract contains no Vercel-specific fields or behavior.
