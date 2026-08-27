import { runLiveProviderProof } from "./live-provider-proof-runner.mjs";
export const LIVE_PROOF_CONFIRMATION = "LIVE_PROVIDER_PROOF_ONCE";
export async function runGuardedLiveProviderControl(input = {}, dependencies = {}) {
  if (input.confirmation !== LIVE_PROOF_CONFIRMATION) return { status: "BLOCKED", reason: "explicit_confirmation_required", providerInvocations: 0 };
  if (input.approvalIntent !== true) return { status: "BLOCKED", reason: "approval_intent_required", providerInvocations: 0 };
  if (!input.sourceRevision || !/^[0-9a-f]{40}$/i.test(input.sourceRevision)) return { status: "BLOCKED", reason: "invalid_source_revision", providerInvocations: 0 };
  if (!Array.isArray(input.packages) || input.packages.length === 0) return { status: "BLOCKED", reason: "verification_evidence_required", providerInvocations: 0 };
  return runLiveProviderProof({ releaseCandidateId: input.releaseCandidateId, packages: input.packages, approver: input.approver, approvalIntent: true, explicitDeploymentRequired: true, targetEnvironment: "production", sourceRevision: input.sourceRevision }, dependencies);
}
