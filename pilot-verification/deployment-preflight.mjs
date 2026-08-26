export function evaluateDeploymentPreflight(input = {}) {
  const {
    releaseCandidateId = null,
    releaseState = null,
    explicitDeploymentRequired = false,
    adapterConfigured = false,
    targetEnvironment = null,
  } = input;

  const reasons = [];

  if (!releaseCandidateId) reasons.push("missing_release_candidate_id");
  if (releaseState !== "APPROVED_FOR_RELEASE") reasons.push("release_not_approved");
  if (explicitDeploymentRequired !== true) reasons.push("missing_explicit_deployment_intent");
  if (adapterConfigured !== true) reasons.push("deployment_adapter_not_configured");
  if (!targetEnvironment) reasons.push("missing_target_environment");

  if (reasons.length > 0) {
    return {
      contractVersion: 1,
      releaseCandidateId,
      decision: "BLOCK",
      releaseState,
      reasons,
      providerInvoked: false
    };
  }

  return {
    contractVersion: 1,
    releaseCandidateId,
    decision: "READY",
    releaseState,
    targetEnvironment,
    reasons: [],
    providerInvoked: false
  };
}
