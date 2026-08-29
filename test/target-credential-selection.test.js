const assert = require("node:assert/strict");
const { DEFAULT_REPOSITORY } = require("../lib/command-contract");
const { chooseRepositoryCredential } = require("../scripts/process-pilot-queue")._test;

const app = "app-token";
const fallback = "existing-token";
const target = "pjmcveyroutalk/Personal-website-";

assert.deepEqual(
  chooseRepositoryCredential(target, app, fallback, true),
  { token: app, source: "github_app" },
);

assert.deepEqual(
  chooseRepositoryCredential(target, app, fallback, false),
  { token: fallback, source: "existing_target_token" },
);

assert.deepEqual(
  chooseRepositoryCredential(target, "", fallback, false),
  { token: fallback, source: "existing_target_token" },
);

assert.deepEqual(
  chooseRepositoryCredential(DEFAULT_REPOSITORY, app, fallback, true),
  { token: fallback, source: "existing_target_token" },
);

assert.equal(
  chooseRepositoryCredential(target, app, "", false),
  null,
);

console.log("Target credential selection — PASS");
