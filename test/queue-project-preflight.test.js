const assert = require("node:assert");
const queue = require("../api/queue")._test;

assert.equal(
  queue.readinessMessage({ reason: "TARGET_REPO_NOT_ACCESSIBLE" }),
  "Project is not ready for Pilot: target repository access is missing. Add this repository to Pilot's target GitHub credential, then submit again.",
);
assert.equal(
  queue.readinessMessage({ next: "INITIALIZE_MAIN" }),
  "Project is not ready for Pilot: initialize the repository's main branch, then submit again.",
);
assert.equal(
  queue.readinessMessage({ next: "REGISTER_PRODUCTION_VERIFIER" }),
  "Project is not ready for Pilot: register its production verifier before submitting a build.",
);
console.log("Queue project preflight gate — PASS");
