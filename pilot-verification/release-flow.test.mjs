import test from "node:test";
import assert from "node:assert/strict";
import { runReleaseFlow } from "./release-flow.mjs";

const base = {
  releaseCandidateId: "rc-test",
  packages: [{ packageId: "pkg-a", verificationStatus: "PASSED" }],
  approver: "user",
  approvalIntent: true,
  explicitDeploymentRequired: true,
  adapterName: "vercel",
  targetEnvironment: "production",
  sourceRevision: "abc123"
};

test("approved release invokes provider exactly once", async () => {
  let calls = 0;
  const result = await runReleaseFlow(base, {
    vercel: {
      deploy: async () => {
        calls++;
        return { deploymentId: "dep-1", status: "DEPLOYED" };
      }
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.providerInvocations, 1);
  assert.equal(result.status, "DEPLOYED");
});

test("missing explicit intent blocks before provider", async () => {
  let calls = 0;
  const result = await runReleaseFlow(
    { ...base, explicitDeploymentRequired: false },
    { vercel: { deploy: async () => { calls++; return { status: "DEPLOYED" }; } } }
  );
  assert.equal(calls, 0);
  assert.equal(result.providerInvocations, 0);
  assert.equal(result.status, "BLOCKED");
});
