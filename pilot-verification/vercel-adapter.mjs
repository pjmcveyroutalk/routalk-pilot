/**
 * Vercel adapter boundary for Pilot.
 *
 * This module deliberately does not contain credentials and does not run on
 * routine development verification. The injected client is responsible for
 * provider transport/authentication.
 */
export function createVercelAdapter(client) {
  if (!client || typeof client.deploy !== "function") {
    throw new TypeError("vercel_client_requires_deploy");
  }

  return {
    name: "vercel",

    async deploy(request) {
      if (!request?.releaseCandidateId) {
        return { status: "BLOCKED", reason: "missing_release_candidate_id" };
      }
      if (!request?.sourceRevision) {
        return { status: "BLOCKED", reason: "missing_source_revision" };
      }
      if (!request?.targetEnvironment) {
        return { status: "BLOCKED", reason: "missing_target_environment" };
      }

      const result = await client.deploy({
        releaseCandidateId: request.releaseCandidateId,
        sourceRevision: request.sourceRevision,
        targetEnvironment: request.targetEnvironment,
        verificationEvidence: request.verificationEvidence ?? []
      });

      return {
        provider: "vercel",
        deploymentId: result?.deploymentId ?? null,
        status: result?.status ?? "FAILED",
        evidence: result?.evidence ?? null
      };
    }
  };
}
