export function evaluateReleaseBundle(input = {}) {
  const {
    releaseCandidateId = null,
    packages = [],
  } = input;

  const blockingReasons = [];
  const includedPackages = [];

  if (!releaseCandidateId) blockingReasons.push("missing_release_candidate_id");
  if (!Array.isArray(packages) || packages.length === 0) {
    blockingReasons.push("empty_release_bundle");
  } else {
    for (const pkg of packages) {
      const id = pkg?.packageId ?? null;
      const status = pkg?.verificationStatus ?? null;
      includedPackages.push({ packageId: id, verificationStatus: status });

      if (!id) blockingReasons.push("package_missing_id");
      if (status !== "PASSED") {
        blockingReasons.push(`package_not_verified:${id ?? "unknown"}`);
      }
    }
  }

  return {
    contractVersion: 1,
    releaseCandidateId,
    status: blockingReasons.length === 0 ? "READY" : "BLOCKED",
    includedPackages,
    blockingReasons,
    providerInvoked: false
  };
}
