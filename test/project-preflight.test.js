const assert = require("node:assert");
const readiness = require("../api/project-preflight")._test;

const unregistered = readiness.registryReadiness("pjmcveyroutalk/not-registered");
assert.equal(unregistered.ready, false);
assert.equal(unregistered.status, "BLOCKED");
assert.equal(unregistered.reason, "PROJECT_NOT_REGISTERED");
assert.equal(unregistered.next_action, "REGISTER_PROJECT");
assert.equal(unregistered.retryable, true);
assert.equal(unregistered.checks.registration, "BLOCKED");
assert.equal(unregistered.checks.production_verifier, "NOT_CHECKED");

const noVerifier = readiness.registryReadiness("pjmcveyroutalk/sport-my-fitness");
assert.equal(noVerifier.ready, false);
assert.equal(noVerifier.status, "BLOCKED");
assert.equal(noVerifier.reason, "REGISTER_PRODUCTION_VERIFIER");
assert.equal(noVerifier.next_action, "REGISTER_PRODUCTION_VERIFIER");
assert.equal(noVerifier.retryable, true);
assert.equal(noVerifier.checks.registration, "PASS");
assert.equal(noVerifier.checks.production_verifier, "BLOCKED");

const ready = readiness.registryReadiness("pjmcveyroutalk/Personal-website-");
assert.equal(ready.ready, true);
assert.equal(ready.status, "READY");
assert.equal(ready.next, "READY_FOR_PILOT");
assert.equal(ready.next_action, "QUEUE_BUILD");
assert.equal(ready.retryable, false);
assert.equal(ready.checks.registration, "PASS");
assert.equal(ready.checks.production_verifier, "PASS");

console.log("Project readiness contract — PASS");
