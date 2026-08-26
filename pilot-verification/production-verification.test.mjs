import test from "node:test";
import assert from "node:assert/strict";
import { verifyProduction } from "./production-verification.mjs";

test("matching revision and passing required health checks verifies production", () => {
  const result = verifyProduction({
    releaseCandidateId: "rc-test",
    deploymentStatus: "DEPLOYED",
    expectedRevision: "abc123",
    observedRevision: "abc123",
    healthChecks: [{ id: "health", required: true, status: "PASSED" }]
  });
  assert.equal(result.status, "PRODUCTION_VERIFIED");
});

test("revision mismatch blocks production verification", () => {
  const result = verifyProduction({
    releaseCandidateId: "rc-test",
    deploymentStatus: "DEPLOYED",
    expectedRevision: "abc123",
    observedRevision: "def456",
    healthChecks: [{ id: "health", required: true, status: "PASSED" }]
  });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasons.includes("revision_mismatch"));
});
