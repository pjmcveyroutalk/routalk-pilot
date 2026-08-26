const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("merge endpoint no longer returns transient mergeability before check settlement", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "api", "merge.js"), "utf8");

  const oldEarlyReturn =
    'if (current.mergeable !== true) {\\n    return send(response, 409, requestId, {\\n      error: "GitHub is still calculating mergeability. Retry in a moment."';

  assert.equal(source.includes(oldEarlyReturn), false);
  assert.equal(source.includes("mergeability_final_refresh"), true);
  assert.equal(source.includes("Pull request has a merge conflict"), true);
  assert.equal(source.includes("CHECK_SETTLE_ATTEMPTS"), true);
});

test("mergeability wait is bounded", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "api", "merge.js"), "utf8");
  assert.match(source, /const MERGEABILITY_RETRIES = 6;/);
  assert.match(source, /const MERGEABILITY_RETRY_MS = 750;/);
});
