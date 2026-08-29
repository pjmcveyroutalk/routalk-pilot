const assert = require("node:assert");
const readiness = require("../api/project-preflight")._test;

const unregistered = readiness.registryReadiness("pjmcveyroutalk/not-registered");
assert.equal(unregistered.ready, false);
assert.equal(unregistered.reason, "PROJECT_NOT_REGISTERED");

const noVerifier = readiness.registryReadiness("pjmcveyroutalk/sport-my-fitness");
assert.equal(noVerifier.ready, false);
assert.equal(noVerifier.reason, "REGISTER_PRODUCTION_VERIFIER");

const ready = readiness.registryReadiness("pjmcveyroutalk/Personal-website-");
assert.equal(ready.ready, true);
assert.equal(ready.next, "READY_FOR_PILOT");

console.log("Credential-free project readiness — PASS");
