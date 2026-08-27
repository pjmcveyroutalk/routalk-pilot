const assert = require("node:assert");
process.env.PILOT_TARGET_REPOSITORIES = "pjmcveyroutalk/routalk-pilot,pjmcveyroutalk/example-app";
const processor = require("../scripts/process-pilot-queue");
assert.equal(processor.validRepository("pjmcveyroutalk/routalk-pilot"), true);
assert.equal(processor.validRepository("../bad"), false);
assert.throws(() => processor.validateCommand({
  version:1, command_id:"x", action:"merge", repository:"evil/repo", pr_number:1
}), /allowlisted/);
assert.doesNotThrow(() => processor.validateCommand({
  version:1, command_id:"x", action:"merge", repository:"pjmcveyroutalk/example-app", pr_number:1
}));
console.log("target repository validation ok");
