import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDeploymentPreflight } from "./deployment-preflight.mjs";

test("approved explicit release with configured adapter is READY", () => {
  const result = evaluateDeploymentPreflight({
    releaseCandidateId: "rc-1",
    releaseState: "APPROVED_FOR_RELEASE",
    explicitDeploymentRequired: true,
    adapterConfigured: true,
    targetEnvironment: "production"
  });
  assert.equal(result.decision, "READY");
  assert.equal(result.providerInvoked, false);
});

test("unapproved release blocks", () => {
  const result = evaluateDeploymentPreflight({
    releaseCandidateId: "rc-2",
    releaseState: "RELEASE_CANDIDATE",
    explicitDeploymentRequired: true,
    adapterConfigured: true,
    targetEnvironment: "production"
  });
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasons.includes("release_not_approved"));
});

test("missing adapter blocks", () => {
  const result = evaluateDeploymentPreflight({
    releaseCandidateId: "rc-3",
    releaseState: "APPROVED_FOR_RELEASE",
    explicitDeploymentRequired: true,
    adapterConfigured: false,
    targetEnvironment: "production"
  });
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasons.includes("deployment_adapter_not_configured"));
});

test("preflight never invokes provider", () => {
  const result = evaluateDeploymentPreflight({});
  assert.equal(result.providerInvoked, false);
});
