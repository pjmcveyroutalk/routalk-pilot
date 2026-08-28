const assert = require("node:assert/strict");
const {
  MAX_FILE_BYTES,
  normalizeCommand,
  validateCommand,
} = require("../lib/command-contract");

const PILOT = "pjmcveyroutalk/routalk-pilot";
const EXTERNAL = "pjmcveyroutalk/sport-my-fitness";
const allow = `${PILOT},${EXTERNAL}`;
const b64 = (value) => Buffer.from(value).toString("base64");
const apply = (overrides = {}) => ({
  command_id: "TEST-COMMAND-1",
  action: "apply",
  branch: "chatgpt/test-command",
  files: [{ path: "test.txt", content_b64: b64("ok") }],
  ...overrides,
});
function rejects(fn, pattern) {
  assert.throws(fn, pattern);
}
assert.equal(normalizeCommand(apply(), { allowedRepositories: allow }).repository, PILOT);
assert.equal(normalizeCommand(apply({ repository: EXTERNAL }), { allowedRepositories: allow }).repository, EXTERNAL);
rejects(() => normalizeCommand(apply({ repository: "other/repo" }), { allowedRepositories: allow }), /allowlisted/);
rejects(() => normalizeCommand({ command_id: "MERGE-1", action: "merge", repository: PILOT, pr_number: 7 }, { allowedRepositories: allow }), /action must be apply/);
rejects(() => normalizeCommand(apply({ command_id: "bad id" }), { allowedRepositories: allow }), /command_id/);
rejects(() => normalizeCommand(apply({ branch: "main" }), { allowedRepositories: allow }), /branch/);
for (const path of [".git/config", ".github/workflows/test.yml", "../escape.txt", "/absolute.txt"]) {
  rejects(() => normalizeCommand(apply({ files: [{ path, content_b64: b64("x") }] }), { allowedRepositories: allow }), /unsafe/);
}
rejects(() => normalizeCommand(apply({ files: [
  { path: "same.txt", content_b64: b64("a") },
  { path: "same.txt", content_b64: b64("b") },
] }), { allowedRepositories: allow }), /duplicate/);
rejects(() => normalizeCommand(apply({ files: [{ path: "bad.txt", content_b64: "not base64!" }] }), { allowedRepositories: allow }), /invalid or too large/);
const oversized = Buffer.alloc(MAX_FILE_BYTES + 1).toString("base64");
rejects(() => normalizeCommand(apply({ files: [{ path: "large.bin", content_b64: oversized }] }), { allowedRepositories: allow }), /invalid|too large/);
const half = Buffer.alloc(Math.floor(MAX_FILE_BYTES / 2) + 1).toString("base64");
rejects(() => normalizeCommand(apply({ files: [
  { path: "a.bin", content_b64: half },
  { path: "b.bin", content_b64: half },
] }), { allowedRepositories: allow }), /combined/);
rejects(() => normalizeCommand(apply({ commit_message: "x".repeat(201) }), { allowedRepositories: allow }), /commit_message/);
const normalized = normalizeCommand(apply(), { allowedRepositories: allow });
assert.equal(validateCommand(normalized, { allowedRepositories: allow }).version, 1);
rejects(() => validateCommand({ ...normalized, version: 2 }, { allowedRepositories: allow }), /Invalid Pilot queue command/);
console.log("command-contract tests passed");
