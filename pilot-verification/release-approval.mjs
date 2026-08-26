export function approveRelease(input = {}) {
  const {
    releaseCandidateId = null,
    bundleStatus = null,
    approver = null,
    approvalIntent = false,
  } = input;

  const reasons = [];
  if (!releaseCandidateId) reasons.push("missing_release_candidate_id");
  if (bundleStatus !== "READY") reasons.push("bundle_not_ready");
  if (!approver) reasons.push("missing_approver");
  if (approvalIntent !== true) reasons.push("missing_explicit_approval_intent");

  if (reasons.length > 0) {
    return {
      contractVersion: 1,
      releaseCandidateId,
      decision: "BLOCK",
      releaseState: bundleStatus === "READY" ? "RELEASE_CANDIDATE" : null,
      reasons,
      providerInvoked: false
    };
  }

  return {
    contractVersion: 1,
    releaseCandidateId,
    decision: "APPROVE",
    releaseState: "APPROVED_FOR_RELEASE",
    approver,
    reasons: [],
    providerInvoked: false
  };
}
