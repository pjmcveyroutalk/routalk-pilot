/**
 * Provider-independent production verification.
 * No provider SDKs or credentials belong here.
 */
export function verifyProduction(input = {}) {
  const {
    releaseCandidateId = null,
    deploymentStatus = null,
    expectedRevision = null,
    observedRevision = null,
    healthChecks = []
  } = input;

  const reasons = [];
  if (!releaseCandidateId) reasons.push("missing_release_candidate_id");
  if (deploymentStatus !== "DEPLOYED") reasons.push("deployment_not_deployed");
  if (!expectedRevision) reasons.push("missing_expected_revision");
  if (!observedRevision) reasons.push("missing_observed_revision");
  if (expectedRevision && observedRevision && expectedRevision !== observedRevision) {
    reasons.push("revision_mismatch");
  }

  if (!Array.isArray(healthChecks) || healthChecks.length === 0) {
    reasons.push("missing_health_checks");
  } else {
    for (const check of healthChecks) {
      if (check?.required === true && check?.status !== "PASSED") {
        reasons.push(`required_health_check_failed:${check?.id ?? "unknown"}`);
      }
    }
  }

  return {
    contractVersion: 1,
    releaseCandidateId,
    status: reasons.length === 0 ? "PRODUCTION_VERIFIED" : "BLOCKED",
    expectedRevision,
    observedRevision,
    healthChecks,
    reasons
  };
}
