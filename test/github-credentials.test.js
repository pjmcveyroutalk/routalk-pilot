const assert = require("node:assert");
const { resolveTargetGithubToken } = require("../lib/github-credentials");

assert.equal(
  resolveTargetGithubToken({
    PILOT_TARGET_GITHUB_TOKEN: "target",
    PILOT_GITHUB_TOKEN: "control",
    GITHUB_TOKEN: "fallback",
  }),
  "target",
);
assert.equal(
  resolveTargetGithubToken({
    PILOT_GITHUB_TOKEN: "control",
    GITHUB_TOKEN: "fallback",
  }),
  "control",
);
assert.equal(
  resolveTargetGithubToken({ GITHUB_TOKEN: "fallback" }),
  "fallback",
);
assert.equal(resolveTargetGithubToken({}), "");

console.log("GitHub credential resolution — PASS");
