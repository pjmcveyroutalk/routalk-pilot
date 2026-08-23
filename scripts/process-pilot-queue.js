const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const MAX_FILES = 20;
const MAX_FILE_BYTES = 32_000;
const MAX_TOTAL_FILE_BYTES = 32_000;

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

function decryptEnvelope(envelope, secret) {
  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.algorithm !== "A256GCM" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.tag !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    fail("Unsupported or malformed Pilot queue envelope");
  }

  try {
    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    fail("Pilot queue command authentication failed");
  }
}

function validateCommand(command) {
  if (!command || command.version !== 1 || !validCommandId(command.command_id)) {
    fail("Invalid Pilot queue command id");
  }
  if (!new Set(["apply", "merge"]).has(command.action)) {
    fail("Unsupported Pilot queue action");
  }

  if (command.action === "merge") {
    if (!Number.isSafeInteger(command.pr_number) || command.pr_number < 1) {
      fail("Invalid merge pull request number");
    }
    return command;
  }

  if (!validBranch(command.branch)) fail("Invalid Pilot queue branch");
  if (!Array.isArray(command.files) || command.files.length < 1 || command.files.length > MAX_FILES) {
    fail(`Pilot queue apply command must contain 1 to ${MAX_FILES} files`);
  }

  const paths = new Set();
  let totalBytes = 0;
  for (const file of command.files) {
    if (!file || !validTarget(file.path) || paths.has(file.path)) {
      fail("Invalid or duplicate Pilot queue target path");
    }
    paths.add(file.path);
    if (typeof file.content_b64 !== "string") fail("Invalid Pilot queue file payload");
    const content = Buffer.from(file.content_b64, "base64");
    if (content.length > MAX_FILE_BYTES || content.toString("base64") !== file.content_b64) {
      fail("Invalid or oversized Pilot queue file payload");
    }
    totalBytes += content.length;
  }
  if (totalBytes > MAX_TOTAL_FILE_BYTES) fail("Pilot queue command payload is too large");
  return command;
}

function run(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: options.cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (!options.allowFailure && result.status !== 0) {
    fail(
      `Command failed: ${args.join(" ")}\nstdout: ${result.stdout || ""}\nstderr: ${result.stderr || ""}`,
    );
  }
  return result;
}

function prLedgerContains(commandId) {
  const result = run(
    ["gh", "pr", "list", "--state", "all", "--limit", "1000", "--json", "number,body,url"],
    { allowFailure: true },
  );
  if (result.status !== 0) fail("Could not inspect the pull request ledger");
  const marker = `Pilot queue command: \`${commandId}\``;
  return JSON.parse(result.stdout || "[]").some((pull) => String(pull.body || "").includes(marker));
}

function remoteBranchExists(branch) {
  return run(["git", "ls-remote", "--exit-code", "--heads", "origin", branch], {
    allowFailure: true,
  }).status === 0;
}

function processApply(command) {
  if (prLedgerContains(command.command_id)) {
    console.log(`[SKIP] ${command.command_id}: permanent PR ledger match`);
    return;
  }
  if (remoteBranchExists(command.branch)) {
    fail(`Refusing to overwrite existing branch ${command.branch}`);
  }

  run(["git", "fetch", "origin", "main"]);
  run(["git", "checkout", "-B", command.branch, "origin/main"]);
  const writtenPaths = [];
  for (const file of command.files) {
    const path = file.path.replaceAll("\\", "/");
    const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path, Buffer.from(file.content_b64, "base64"));
    writtenPaths.push(path);
  }

  run(["git", "config", "user.name", "Routalk Pilot Queue"]);
  run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run(["git", "add", "--", ...writtenPaths]);
  const diff = run(["git", "diff", "--cached", "--quiet"], { allowFailure: true });
  if (diff.status === 0) {
    console.log(`[SKIP] ${command.command_id}: requested files match main`);
    return;
  }

  run(["git", "commit", "-m", command.commit_message || `Pilot queue: ${command.command_id}`]);
  run(["git", "push", "--set-upstream", "origin", command.branch]);
  const body = `${command.pr_body || ""}\n\n---\nPilot queue command: \`${command.command_id}\`\nCreated from the encrypted Routalk Pilot queue.`.trim();
  run([
    "gh", "pr", "create", "--base", "main", "--head", command.branch,
    "--title", command.pr_title || `Pilot change: ${command.command_id}`, "--body", body,
  ]);
  console.log(`[OK] ${command.command_id}: pull request created`);
}

function processMerge(command) {
  const view = run([
    "gh", "pr", "view", String(command.pr_number),
    "--json", "state,mergedAt,headRefName,baseRefName",
  ]);
  const pull = JSON.parse(view.stdout);
  if (pull.mergedAt) {
    console.log(`[SKIP] ${command.command_id}: PR #${command.pr_number} already merged`);
    return;
  }
  if (
    pull.state !== "OPEN" ||
    pull.baseRefName !== "main" ||
    !String(pull.headRefName || "").startsWith("chatgpt/")
  ) {
    fail("Pilot queue can only merge open chatgpt/* pull requests into main");
  }
  run(["gh", "pr", "merge", String(command.pr_number), "--squash", "--delete-branch"]);
  console.log(`[OK] ${command.command_id}: merged PR #${command.pr_number}`);
}

function main() {
  const queuePath = process.argv[2];
  const secret = process.env.PILOT_QUEUE_SECRET;
  if (!queuePath || !secret) fail("Pilot queue path and secret are required");
  const envelope = JSON.parse(fs.readFileSync(queuePath, "utf8"));
  const command = validateCommand(decryptEnvelope(envelope, secret));
  if (command.action === "apply") processApply(command);
  else processMerge(command);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[ERROR] ${error.message || error}`);
    process.exitCode = 1;
  }
}

module.exports = { decryptEnvelope, validBranch, validCommandId, validTarget, validateCommand };
