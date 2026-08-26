import { runReleaseFlow } from "./release-flow.mjs";
import { createVercelAdapter } from "./vercel-adapter.mjs";
import { verifyProduction } from "./production-verification.mjs";

/**
 * Runs one explicitly approved live-provider proof.
 * The caller must inject the authenticated Vercel client and the independent
 * production-observation function. No credentials are stored here.
 */
export async function runLiveProviderProof(input = {}, dependencies = {}) {
  const { vercelClient, observeProduction } = dependencies;

  if (!vercelClient || typeof vercelClient.deploy !== "function") {
    return { status: "BLOCKED", reason: "missing_vercel_client", providerInvocations: 0 };
  }
  if (typeof observeProduction !== "function") {
    return { status: "BLOCKED", reason: "missing_production_observer", providerInvocations: 0 };
  }

  const vercel = createVercelAdapter(vercelClient);

  const release = await runReleaseFlow({
    releaseCandidateId: input.releaseCandidateId,
    packages: input.packages,
    approver: input.approver,
    approvalIntent: input.approvalIntent,
    explicitDeploymentRequired: input.explicitDeploymentRequired,
    adapterName: "vercel",
    targetEnvironment: input.targetEnvironment,
    sourceRevision: input.sourceRevision
  }, { vercel });

  if (release.providerInvocations !== 1 || release.dispatch?.result?.status !== "DEPLOYED") {
    return {
      status: "BLOCKED",
      reason: "live_deployment_proof_failed",
      release,
      providerInvocations: release.providerInvocations ?? 0
    };
  }

  const observation = await observeProduction({
    releaseCandidateId: input.releaseCandidateId,
    deploymentId: release.dispatch.result.deploymentId,
    expectedRevision: input.sourceRevision
  });

  const production = verifyProduction({
    releaseCandidateId: input.releaseCandidateId,
    deploymentStatus: release.dispatch.result.status,
    expectedRevision: input.sourceRevision,
    observedRevision: observation.observedRevision,
    healthChecks: observation.healthChecks
  });

  return {
    status: production.status,
    providerInvocations: release.providerInvocations,
    release,
    production
  };
}
