import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReleaseBundle } from "./release-bundle-readiness.mjs";

test("verified multi-change bundle becomes READY without provider invocation", () => {
  const result = evaluateReleaseBundle({
    releaseCandidateId: "rc-1",
    packages: [
      { packageId: "pkg-a", verificationStatus: "PASSED" },
      { packageId: "pkg-b", verificationStatus: "PASSED" }
    ]
  });
  assert.equal(result.status, "READY");
  assert.equal(result.providerInvoked, false);
  assert.deepEqual(result.blockingReasons, []);
});

test("failed verification blocks bundle", () => {
  const result = evaluateReleaseBundle({
    releaseCandidateId: "rc-2",
    packages: [
      { packageId: "pkg-a", verificationStatus: "PASSED" },
      { packageId: "pkg-b", verificationStatus: "FAILED" }
    ]
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.providerInvoked, false);
  assert.ok(result.blockingReasons.includes("package_not_verified:pkg-b"));
});

test("empty bundle fails closed", () => {
  const result = evaluateReleaseBundle({ releaseCandidateId: "rc-3", packages: [] });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.providerInvoked, false);
});

test("missing release candidate id blocks", () => {
  const result = evaluateReleaseBundle({
    packages: [{ packageId: "pkg-a", verificationStatus: "PASSED" }]
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.providerInvoked, false);
});
