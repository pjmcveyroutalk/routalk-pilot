const MAX_FILES = 20;
const MAX_FILE_BYTES = 32_000;
const MAX_TOTAL_FILE_BYTES = 32_000;
const DEFAULT_REPOSITORY = "pjmcveyroutalk/routalk-pilot";

function fail(message) {
  throw new Error(message);
}

function validCommandId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value || "");
}

function validBranch(value) {
  return (
    /^chatgpt\/[A-Za-z0-9._/-]{1,120}$/.test(value || "") &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.endsWith("/")
  );
}

function validRepository(value) {
  return /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value || "");
}

function allowedRepositories(configured = process.env.PILOT_TARGET_REPOSITORIES) {
  return new Set(
    (configured || DEFAULT_REPOSITORY)
      .split(",")
      .map((value) => value.trim())
      .filter((value) => validRepository(value)),
  );
}

function resolveRepository(command, configured) {
  const repository = command.repository || DEFAULT_REPOSITORY;
  if (!validRepository(repository) || !allowedRepositories(configured).has(repository)) {
    fail("Pilot target repository is not allowlisted");
  }
  return repository;
}

function validTarget(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240) return false;
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  const lowered = normalized.toLowerCase();
  return (
    !normalized.startsWith("/") &&
    !parts.includes("") &&
    !parts.includes(".") &&
    !parts.includes("..") &&
    !lowered.startsWith(".git/") &&
    lowered !== ".git" &&
    !lowered.startsWith(".github/workflows/")
  );
}

function validateText(value, field, maxLength, required = false) {
  if (value == null || value === "") {
    if (required) fail(`${field} is required`);
    return "";
  }
  if (typeof value !== "string" || value.length > maxLength) {
    fail(`${field} is invalid`);
  }
  return value;
}

function normalizeCommand(body, options = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Invalid Pilot queue command");

  const commandId = validateText(body.command_id, "command_id", 80, true);
  if (!validCommandId(commandId)) fail("command_id is invalid");

  const action = validateText(body.action, "action", 16, true).toLowerCase();
  if (action !== "apply") fail("action must be apply");

  const repository = resolveRepository(
    { repository: validateText(body.repository, "repository", 201) },
    options.allowedRepositories,
  );

  const branch = validateText(body.branch, "branch", 128, true);
  if (!validBranch(branch)) fail("branch is invalid");

  if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > MAX_FILES) {
    fail(`files must contain 1 to ${MAX_FILES} entries`);
  }

  const seenTargets = new Set();
  let totalBytes = 0;
  const files = body.files.map((file, index) => {
    if (!file || typeof file !== "object") fail(`files[${index}] is invalid`);
    const path = validateText(file.path, `files[${index}].path`, 240, true).replaceAll("\\", "/");
    if (!validTarget(path)) fail(`files[${index}].path is unsafe`);
    if (seenTargets.has(path)) fail(`duplicate target path: ${path}`);
    seenTargets.add(path);

    const contentBase64 = validateText(
      file.content_b64,
      `files[${index}].content_b64`,
      Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8,
      true,
    );
    const decoded = Buffer.from(contentBase64, "base64");
    if (decoded.length > MAX_FILE_BYTES || decoded.toString("base64") !== contentBase64) {
      fail(`files[${index}].content_b64 is invalid or too large`);
    }
    totalBytes += decoded.length;
    return { path, content_b64: contentBase64 };
  });

  if (totalBytes > MAX_TOTAL_FILE_BYTES) fail("combined file payload is too large");

  return {
    version: 1,
    command_id: commandId,
    action,
    repository,
    branch,
    files,
    commit_message: validateText(body.commit_message, "commit_message", 200),
    pr_title: validateText(body.pr_title, "pr_title", 200),
    pr_body: validateText(body.pr_body, "pr_body", 8_000),
  };
}

function validateCommand(command, options = {}) {
  if (!command || command.version !== 1) fail("Invalid Pilot queue command");
  return normalizeCommand(command, options);
}

module.exports = {
  DEFAULT_REPOSITORY,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_FILE_BYTES,
  allowedRepositories,
  normalizeCommand,
  resolveRepository,
  validBranch,
  validCommandId,
  validRepository,
  validTarget,
  validateCommand,
};
