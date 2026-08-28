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
const del = (overrides = {}) => ({
  command_id: "DELETE-COMMAND-1",
  action: "delete",
  branch: "chatgpt/delete-command",
  deletions: [{ path: "legacy.txt", expected_blob_sha: "a".repeat(40) }],
  ...overrides,
});
function rejects(fn, pattern) {
  assert.throws(fn, pattern);
}
assert.equal(normalizeCommand(apply(), { allowedRepositories: allow }).repository, PILOT);
assert.equal(normalizeCommand(apply({ repository: EXTERNAL }), { allowedRepositories: allow }).repository, EXTERNAL);
assert.equal(normalizeCommand(del(), { allowedRepositories: allow }).action, "delete");
assert.equal(normalizeCommand(del(), { allowedRepositories: allow }).deletions[0].path, "legacy.txt");
rejects(() => normalizeCommand(apply({ repository: "other/repo" }), { allowedRepositories: allow }), /allowlisted/);
rejects(() => normalizeCommand({ command_id: "MERGE-1", action: "merge", repository: PILOT, pr_number: 7 }, { allowedRepositories: allow }), /action must be apply or delete/);
rejects(() => normalizeCommand(apply({ command_id: "bad id" }), { allowedRepositories: allow }), /command_id/);
rejects(() => normalizeCommand(apply({ branch: "main" }), { allowedRepositories: allow }), /branch/);
for (const path of [".git/config", ".github/workflows/test.yml", "../escape.txt", "/absolute.txt"]) {
  rejects(() => normalizeCommand(apply({ files: [{ path, content_b64: b64("x") }] }), { allowedRepositories: allow }), /unsafe/);
}
for (const path of [
  "index.html",
  "api/queue.js",
  "api/command.js",
  "api/merge.js",
  "api/verify-production.js",
  "lib/command-contract.js",
  "lib/command-state.js",
  "lib/stores/github-issue-command-store.js",
  "scripts/process-pilot-queue.js",
  ".github/workflows/routalk-pilot-bridge.yml",
]) {
  rejects(
    () => normalizeCommand(del({ deletions: [{ path, expected_blob_sha: "a".repeat(40) }] }), { allowedRepositories: allow }),
    /protected or unsafe/,
  );
}
rejects(() => normalizeCommand(del({ deletions: [{ path: "legacy.txt", expected_blob_sha: "bad" }] }), { allowedRepositories: allow }), /expected_blob_sha/);
rejects(() => normalizeCommand(del({ deletions: [
  { path: "legacy.txt", expected_blob_sha: "a".repeat(40) },
  { path: "legacy.txt", expected_blob_sha: "a".repeat(40) },
] }), { allowedRepositories: allow }), /duplicate deletion/);
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
const normalizedDelete = normalizeCommand(del(), { allowedRepositories: allow });
assert.equal(validateCommand(normalizedDelete, { allowedRepositories: allow }).action, "delete");
rejects(() => validateCommand({ ...normalized, version: 2 }, { allowedRepositories: allow }), /Invalid Pilot queue command/);
console.log("command-contract tests passed");
