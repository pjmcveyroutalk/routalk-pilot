import test from "node:test";
import assert from "node:assert/strict";
import { runLiveProviderProof } from "./live-provider-proof-runner.mjs";

const base = {
  releaseCandidateId: "rc-live-proof",
  packages: [
    { packageId: "pkg-a", verificationStatus: "PASSED" },
    { packageId: "pkg-b", verificationStatus: "PASSED" }
  ],
  approver: "user",
  approvalIntent: true,
  explicitDeploymentRequired: true,
  targetEnvironment: "production",
  sourceRevision: "abc123"
};

test("approved proof deploys exactly once then production-verifies", async () => {
  let deployCalls = 0;
  const result = await runLiveProviderProof(base, {
    vercelClient: {
      deploy: async () => {
        deployCalls++;
        return { deploymentId: "dep-1", status: "DEPLOYED", evidence: {} };
      }
    },
    observeProduction: async () => ({
      observedRevision: "abc123",
      healthChecks: [{ id: "health", required: true, status: "PASSED" }]
    })
  });

  assert.equal(deployCalls, 1);
  assert.equal(result.providerInvocations, 1);
  assert.equal(result.status, "PRODUCTION_VERIFIED");
});

test("production failure does not trigger redeploy", async () => {
  let deployCalls = 0;
  const result = await runLiveProviderProof(base, {
    vercelClient: {
      deploy: async () => {
        deployCalls++;
        return { deploymentId: "dep-2", status: "DEPLOYED" };
      }
    },
    observeProduction: async () => ({
      observedRevision: "wrong-revision",
      healthChecks: [{ id: "health", required: true, status: "FAILED" }]
    })
  });

  assert.equal(deployCalls, 1);
  assert.equal(result.providerInvocations, 1);
  assert.equal(result.status, "BLOCKED");
});

test("missing live dependencies fail before deployment", async () => {
  const result = await runLiveProviderProof(base, {});
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.providerInvocations, 0);
});
