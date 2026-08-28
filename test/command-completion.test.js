const assert = require("node:assert/strict");
const { COMMAND_STATES } = require("../lib/command-state");
const { deriveState } = require("../api/command")._test;

const queue = { state: "closed" };
const merged = { state: "closed", merged_at: "2026-08-28T20:00:00Z" };
const open = { state: "open", merged_at: null };
const closedUnmerged = { state: "closed", merged_at: null };

assert.equal(deriveState({ state: "open" }, null, null, null), COMMAND_STATES.QUEUED);
assert.equal(deriveState(queue, null, null, null), COMMAND_STATES.RUNNING);
assert.equal(deriveState(queue, open, null, null), COMMAND_STATES.AWAITING_APPROVAL);
assert.equal(deriveState(queue, closedUnmerged, null, null), COMMAND_STATES.FAILED);

assert.equal(
  deriveState(queue, merged, { ready: true }, { ready: true, revision_match: true }),
  COMMAND_STATES.COMPLETED,
);
for (const [deployment, verification] of [
  [{ ready: false }, { ready: true, revision_match: true }],
  [{ ready: true }, { ready: false, revision_match: true }],
  [{ ready: true }, { ready: true, revision_match: false }],
  [null, { ready: true, revision_match: true }],
  [{ ready: true }, null],
]) {
  assert.equal(deriveState(queue, merged, deployment, verification), COMMAND_STATES.MERGED);
}

console.log("command completion tests passed");
