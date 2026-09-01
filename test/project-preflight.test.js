const assert = require("node:assert");
const readiness = require("../api/project-preflight")._test;

const unregistered = readiness.registryReadiness("pjmcveyroutalk/not-registered");
assert.equal(unregistered.reason, "PROJECT_NOT_REGISTERED");
assert.equal(unregistered.checks.target_repository, "NOT_CHECKED");

const noVerifier = readiness.registryReadiness("pjmcveyroutalk/sport-my-fitness");
assert.equal(noVerifier.reason, "REGISTER_PRODUCTION_VERIFIER");
assert.equal(noVerifier.next_action, "BOOTSTRAP_PRODUCTION_VERIFIER");

const ready = readiness.registryReadiness("pjmcveyroutalk/Personal-website-");
assert.equal(ready.ready, true);
assert.equal(ready.checks.target_repository, "NOT_CHECKED");

function mockFetch(sequence) {
  let index = 0;
  return async () => {
    const item = sequence[index++];
    return { ok: item.ok, status: item.status, json: async () => item.data || {} };
  };
}

(async () => {
  const missing = await readiness.targetRepositoryReadiness("pjmcveyroutalk/Personal-website-", "", mockFetch([]));
  assert.equal(missing.reason, "TARGET_ACCESS_NOT_CONFIGURED");

  const inaccessible = await readiness.targetRepositoryReadiness(
    "pjmcveyroutalk/Personal-website-", "token", mockFetch([{ ok: false, status: 404 }]));
  assert.equal(inaccessible.reason, "TARGET_REPO_NOT_ACCESSIBLE");

  const uninitialized = await readiness.targetRepositoryReadiness(
    "pjmcveyroutalk/Personal-website-", "token",
    mockFetch([{ ok: true, status: 200, data: { default_branch: "main" } }, { ok: false, status: 404 }]));
  assert.equal(uninitialized.reason, "INITIALIZE_MAIN");

  const fullyReady = await readiness.checkProjectReadiness(
    "pjmcveyroutalk/Personal-website-", "token",
    { fetchImpl: mockFetch([
      { ok: true, status: 200, data: { default_branch: "main" } },
      { ok: true, status: 200, data: { name: "main" } }
    ]) });
  assert.equal(fullyReady.ready, true);
  assert.equal(fullyReady.checks.target_repository, "PASS");
  assert.equal(fullyReady.checks.main_branch, "PASS");
  assert.equal(fullyReady.checks.production_verifier, "PASS");

  console.log("Project readiness contract — PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
