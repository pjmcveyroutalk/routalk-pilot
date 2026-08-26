import test from "node:test";
import assert from "node:assert/strict";
import { createDeploymentRequest } from "./deployment-request.mjs";

test("READY preflight creates provider-neutral request without invoking provider", () => {
  const result = createDeploymentRequest({
    preflightDecision: "READY",
    releaseCandidateId: "rc-1",
    sourceRevision: "abc123",
    targetEnvironment: "production",
    adapter: "configured-adapter",
    verificationEvidence: ["verify-1"]
  });
  assert.equal(result.decision, "READY");
  assert.equal(result.providerInvoked, false);
  assert.equal(result.request.releaseCandidateId, "rc-1");
});

test("non-ready preflight blocks", () => {
  const result = createDeploymentRequest({
    preflightDecision: "BLOCK",
    releaseCandidateId: "rc-2",
    sourceRevision: "def456",
    targetEnvironment: "production",
    adapter: "configured-adapter"
  });
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasons.includes("preflight_not_ready"));
});

test("missing source revision blocks", () => {
  const result = createDeploymentRequest({
    preflightDecision: "READY",
    releaseCandidateId: "rc-3",
    targetEnvironment: "production",
    adapter: "configured-adapter"
  });
  assert.equal(result.decision, "BLOCK");
  assert.equal(result.providerInvoked, false);
});
