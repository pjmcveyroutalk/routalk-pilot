import { evaluateReleaseBundle } from "./release-bundle-readiness.mjs";
import { approveRelease } from "./release-approval.mjs";
import { decideDeploymentGate } from "./deployment-gate.mjs";
import { evaluateDeploymentPreflight } from "./deployment-preflight.mjs";
import { createDeploymentRequest } from "./deployment-request.mjs";

/**
 * Provider-neutral release orchestration.
 * Provider transport is injected through dependencies and is invoked at most once.
 */
export async function runReleaseFlow(input = {}, dependencies = {}) {
  const adapterName = input.adapterName ?? null;
  const adapter = adapterName ? dependencies[adapterName] : null;

  const bundle = evaluateReleaseBundle({
    releaseCandidateId: input.releaseCandidateId,
    packages: input.packages
  });

  if (bundle.status !== "READY") {
    return { status: "BLOCKED", stage: "bundle", bundle, providerInvocations: 0 };
  }

  const approval = approveRelease({
    releaseCandidateId: input.releaseCandidateId,
    bundleStatus: bundle.status,
    approver: input.approver,
    approvalIntent: input.approvalIntent
  });

  if (approval.decision !== "APPROVE") {
    return { status: "BLOCKED", stage: "approval", bundle, approval, providerInvocations: 0 };
  }

  const gate = decideDeploymentGate({
    releaseState: approval.releaseState,
    releaseCandidateId: input.releaseCandidateId,
    explicitDeploymentRequired: input.explicitDeploymentRequired
  });

  if (gate.decision !== "ALLOW") {
    return { status: "BLOCKED", stage: "gate", bundle, approval, gate, providerInvocations: 0 };
  }

  const preflight = evaluateDeploymentPreflight({
    releaseCandidateId: input.releaseCandidateId,
    releaseState: approval.releaseState,
    explicitDeploymentRequired: input.explicitDeploymentRequired,
    adapterConfigured: Boolean(adapter && typeof adapter.deploy === "function"),
    targetEnvironment: input.targetEnvironment
  });

  if (preflight.decision !== "READY") {
    return { status: "BLOCKED", stage: "preflight", bundle, approval, gate, preflight, providerInvocations: 0 };
  }

  const deploymentRequest = createDeploymentRequest({
    preflightDecision: preflight.decision,
    releaseCandidateId: input.releaseCandidateId,
    sourceRevision: input.sourceRevision,
    targetEnvironment: input.targetEnvironment,
    adapter: adapterName,
    verificationEvidence: bundle.includedPackages
  });

  if (deploymentRequest.decision !== "READY") {
    return {
      status: "BLOCKED",
      stage: "deployment_request",
      bundle, approval, gate, preflight, deploymentRequest,
      providerInvocations: 0
    };
  }

  // This is the only provider invocation in the flow.
  const result = await adapter.deploy(deploymentRequest.request);

  return {
    status: result?.status === "DEPLOYED" ? "DEPLOYED" : "BLOCKED",
    stage: "dispatch",
    bundle,
    approval,
    gate,
    preflight,
    deploymentRequest,
    dispatch: { request: deploymentRequest.request, result },
    providerInvocations: 1
  };
}
