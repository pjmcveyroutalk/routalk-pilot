import test from "node:test";
import assert from "node:assert/strict";
import { approveRelease } from "./release-approval.mjs";

test("READY bundle with explicit approval becomes APPROVED_FOR_RELEASE", () => {
  const result = approveRelease({
    releaseCandidateId: "rc-1",
    bundleStatus: "READY",
    approver: "user",
    approvalIntent: true
  });
  assert.equal(result.decision, "APPROVE");
  assert.equal(result.releaseState, "APPROVED_FOR_RELEASE");
  assert.equal(result.providerInvoked, false);
});

test("non-ready bundle cannot be approved", () => {
  const result = approveRelease({
    releaseCandidateId: "rc-2",
    bundleStatus: "BLOCKED",
    approver: "user",
    approvalIntent: true
  });
  assert.equal(result.decision, "BLOCK");
  assert.equal(result.providerInvoked, false);
});

test("approval cannot be inferred", () => {
  const result = approveRelease({
    releaseCandidateId: "rc-3",
    bundleStatus: "READY",
    approver: "user"
  });
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasons.includes("missing_explicit_approval_intent"));
  assert.equal(result.providerInvoked, false);
});

test("missing approver blocks", () => {
  const result = approveRelease({
    releaseCandidateId: "rc-4",
    bundleStatus: "READY",
    approvalIntent: true
  });
  assert.equal(result.decision, "BLOCK");
  assert.equal(result.providerInvoked, false);
});
