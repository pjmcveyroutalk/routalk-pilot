import test from "node:test";
import assert from "node:assert/strict";
import { decideDeploymentGate } from "./deployment-gate.mjs";

test("BUILDING skips provider invocation", () => {
  const result = decideDeploymentGate({
    releaseState: "BUILDING",
    releaseCandidateId: "rc-1",
  });
  assert.equal(result.decision, "SKIP");
  assert.equal(result.providerInvoked, false);
});

test("VERIFIED skips provider invocation", () => {
  const result = decideDeploymentGate({
    releaseState: "VERIFIED",
    releaseCandidateId: "rc-2",
  });
  assert.equal(result.decision, "SKIP");
  assert.equal(result.providerInvoked, false);
});

test("RELEASE_CANDIDATE skips provider invocation", () => {
  const result = decideDeploymentGate({
    releaseState: "RELEASE_CANDIDATE",
    releaseCandidateId: "rc-3",
  });
  assert.equal(result.decision, "SKIP");
  assert.equal(result.providerInvoked, false);
});

test("approved explicit release allows adapter invocation", () => {
  const result = decideDeploymentGate({
    releaseState: "APPROVED_FOR_RELEASE",
    releaseCandidateId: "rc-4",
    explicitDeploymentRequired: true,
  });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.providerInvoked, false);
});

test("approved release without explicit deploy intent blocks", () => {
  const result = decideDeploymentGate({
    releaseState: "APPROVED_FOR_RELEASE",
    releaseCandidateId: "rc-5",
  });
  assert.equal(result.decision, "BLOCK");
  assert.equal(result.reason, "missing_explicit_deployment_intent");
  assert.equal(result.providerInvoked, false);
});

test("unknown state blocks safely", () => {
  const result = decideDeploymentGate({
    releaseState: "UNKNOWN",
    releaseCandidateId: "rc-6",
  });
  assert.equal(result.decision, "BLOCK");
  assert.equal(result.providerInvoked, false);
});
