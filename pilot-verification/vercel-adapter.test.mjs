import test from "node:test";
import assert from "node:assert/strict";
import { createVercelAdapter } from "./vercel-adapter.mjs";
import { dispatchDeployment } from "./deployment-adapter-dispatch.mjs";

test("SKIP path never calls injected Vercel client", async () => {
  let calls = 0;
  const vercel = createVercelAdapter({
    deploy: async () => { calls++; return { deploymentId: "d1", status: "DEPLOYED" }; }
  });

  const result = await dispatchDeployment({
    gateDecision: "SKIP",
    deploymentRequest: { releaseCandidateId: "rc-1" },
    adapterName: "vercel"
  }, { vercel });

  assert.equal(result.providerInvoked, false);
  assert.equal(calls, 0);
});

test("ALLOW path calls Vercel adapter exactly once", async () => {
  let calls = 0;
  const vercel = createVercelAdapter({
    deploy: async (request) => {
      calls++;
      return { deploymentId: "d2", status: "DEPLOYED", evidence: { revision: request.sourceRevision } };
    }
  });

  const result = await dispatchDeployment({
    gateDecision: "ALLOW",
    deploymentRequest: {
      releaseCandidateId: "rc-2",
      sourceRevision: "abc123",
      targetEnvironment: "production",
      verificationEvidence: ["verify-1"]
    },
    adapterName: "vercel"
  }, { vercel });

  assert.equal(result.providerInvoked, true);
  assert.equal(calls, 1);
  assert.equal(result.result.provider, "vercel");
  assert.equal(result.result.status, "DEPLOYED");
});

test("adapter fails closed before provider call when request is incomplete", async () => {
  let calls = 0;
  const vercel = createVercelAdapter({
    deploy: async () => { calls++; return {}; }
  });

  const result = await vercel.deploy({ releaseCandidateId: "rc-3" });
  assert.equal(result.status, "BLOCKED");
  assert.equal(calls, 0);
});
