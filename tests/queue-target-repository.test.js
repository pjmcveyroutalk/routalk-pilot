const assert = require("node:assert");

process.env.PILOT_TARGET_REPOSITORIES =
  "pjmcveyroutalk/routalk-pilot,pjmcveyroutalk/example-app";

const queue = require("../api/queue")._test;

const legacy = queue.normalizeCommand({
  command_id: "legacy",
  action: "merge",
  pr_number: 1,
});
assert.equal(
  legacy.repository,
  "pjmcveyroutalk/routalk-pilot",
);

const targeted = queue.normalizeCommand({
  command_id: "targeted",
  action: "merge",
  repository: "pjmcveyroutalk/example-app",
  pr_number: 2,
});
assert.equal(
  targeted.repository,
  "pjmcveyroutalk/example-app",
);

assert.throws(
  () =>
    queue.normalizeCommand({
      command_id: "blocked",
      action: "merge",
      repository: "evil/repo",
      pr_number: 3,
    }),
  /not allowlisted/,
);

console.log("queue target repository contract ok");
