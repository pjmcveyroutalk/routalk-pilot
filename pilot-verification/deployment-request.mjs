export function createDeploymentRequest(input = {}) {
  const {
    preflightDecision = null,
    releaseCandidateId = null,
    sourceRevision = null,
    targetEnvironment = null,
    adapter = null,
    verificationEvidence = [],
  } = input;

  const reasons = [];
  if (preflightDecision !== "READY") reasons.push("preflight_not_ready");
  if (!releaseCandidateId) reasons.push("missing_release_candidate_id");
  if (!sourceRevision) reasons.push("missing_source_revision");
  if (!targetEnvironment) reasons.push("missing_target_environment");
  if (!adapter) reasons.push("missing_deployment_adapter");

  if (reasons.length) {
    return {
      contractVersion: 1,
      decision: "BLOCK",
      reasons,
      providerInvoked: false,
      request: null
    };
  }

  return {
    contractVersion: 1,
    decision: "READY",
    reasons: [],
    providerInvoked: false,
    request: {
      releaseCandidateId,
      sourceRevision,
      targetEnvironment,
      adapter,
      verificationEvidence
    }
  };
}
