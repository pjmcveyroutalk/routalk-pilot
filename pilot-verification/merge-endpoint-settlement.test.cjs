const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("protected merge defers transient mergeability retry until after check settlement", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "api", "merge.js"), "utf8");

  assert.equal(
    source.includes("GitHub is still calculating mergeability. Retry in a moment."),
    false
  );
  assert.equal(source.includes("mergeability_final_refresh"), true);
  assert.equal(source.includes("Pull request has a merge conflict"), true);
  assert.equal(source.includes("CHECK_SETTLE_ATTEMPTS"), true);
});

test("mergeability waits remain bounded", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "api", "merge.js"), "utf8");
  assert.match(source, /const MERGEABILITY_RETRIES = 6;/);
  assert.match(source, /const MERGEABILITY_RETRY_MS = 750;/);
});
