/**
 * Provider-neutral deployment gate.
 * No provider SDKs or network calls belong here.
 */
export function decideDeploymentGate(input = {}) {
  const {
    releaseState,
    releaseCandidateId = null,
    explicitDeploymentRequired = false,
  } = input;

  const base = {
    contractVersion: 1,
    releaseCandidateId,
    releaseState: releaseState ?? null,
    providerInvoked: false,
  };

  if (["BUILDING", "VERIFIED", "RELEASE_CANDIDATE"].includes(releaseState)) {
    return {
      ...base,
      decision: "SKIP",
      reason: "development_or_pre_promotion",
    };
  }

  if (releaseState === "APPROVED_FOR_RELEASE" && explicitDeploymentRequired === true) {
    return {
      ...base,
      decision: "ALLOW",
      reason: "approved_release",
    };
  }

  if (releaseState === "APPROVED_FOR_RELEASE") {
    return {
      ...base,
      decision: "BLOCK",
      reason: "missing_explicit_deployment_intent",
    };
  }

  return {
    ...base,
    decision: "BLOCK",
    reason: "unsupported_or_missing_release_state",
  };
}
