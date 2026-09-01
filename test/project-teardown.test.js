const assert = require("node:assert");
const teardown = require("../lib/project-teardown")._test;
const projects = require("../config/projects");

assert.equal(
  teardown.EXPERIMENTAL_TARGET,
  "pjmcveyroutalk/pilot-customer-zero-01",
);
assert.equal(teardown.validRepository("pjmcveyroutalk/pilot-customer-zero-01"), true);
assert.equal(teardown.validRepository("../unsafe"), false);

const rendered = teardown.renderProjects(projects);
assert.equal(teardown.gitBlobSha(rendered).length, 40);

const packageValue = teardown.buildUnregisterPackage(
  "pjmcveyroutalk/pilot-customer-zero-01",
  "a".repeat(40),
  "test-request",
);
assert.equal(packageValue.repository, "pjmcveyroutalk/routalk-pilot");
assert.equal(packageValue.files.length, 1);
assert.equal(packageValue.files[0].path, "config/projects.js");
assert.equal(packageValue.files[0].expected_blob_sha, "a".repeat(40));

const nextRegistry = Buffer.from(
  packageValue.files[0].content_b64,
  "base64",
).toString("utf8");
assert.equal(nextRegistry.includes("pilot-customer-zero-01"), false);
assert.equal(nextRegistry.includes("pilot-customer-zero-02"), true);

console.log("Project teardown contract — PASS");
