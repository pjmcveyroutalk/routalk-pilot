const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(process.cwd(), "api", "merge.js"), "utf8");

test("unknown GitHub mergeability metadata is not a hard stop", () => {
  assert.equal(
    source.includes("GitHub mergeability did not settle within Pilot's bounded wait"),
    false
  );
  assert.equal(source.includes("mergeabilityHintUnknown"), true);
  assert.equal(source.includes("current.mergeable == null"), true);
});

test("known conflicts remain protected", () => {
  assert.equal(source.includes('current.mergeable === false'), true);
  assert.equal(source.includes('current.mergeable_state === "dirty"'), true);
  assert.equal(source.includes("Pull request has a merge conflict"), true);
});

test("merge remains pinned to immutable expected head SHA", () => {
  assert.equal(
    source.includes('JSON.stringify({ merge_method: "squash", sha: expectedHeadSha })'),
    true
  );
  assert.equal(source.includes("Pull request changed while Pilot was retrying the merge"), true);
});

test("CI/check settlement remains required before merge", () => {
  assert.equal(source.includes("CHECK_SETTLE_ATTEMPTS"), true);
  assert.equal(source.includes("Pull request checks are unsuccessful"), true);
});
