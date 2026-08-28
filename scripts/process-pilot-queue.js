const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const {
  DEFAULT_REPOSITORY,
  resolveRepository,
  validateCommand,
} = require("../lib/command-contract");

function fail(message) { throw new Error(message); }
function decryptEnvelope(envelope, secret) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== "A256GCM" ||
      typeof envelope.iv !== "string" || typeof envelope.tag !== "string" ||
      typeof envelope.ciphertext !== "string") fail("Unsupported or malformed Pilot queue envelope");
  try {
    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    return JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()
    ]).toString("utf8"));
  } catch { fail("Pilot queue command authentication failed"); }
}
function run(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), { cwd: options.cwd, encoding: "utf8", env: process.env });
  if (!options.allowFailure && result.status !== 0)
    fail(`Command failed: ${args.join(" ")}\nstdout: ${result.stdout || ""}\nstderr: ${result.stderr || ""}`);
  return result;
}
function remoteUrl(repository) { return `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${repository}.git`; }
function prepareWorkspace(repository) {
  if (repository === DEFAULT_REPOSITORY) return process.cwd();
  const workspace = fs.mkdtempSync("/tmp/pilot-target-");
  run(["git", "clone", "--depth", "1", "--branch", "main", remoteUrl(repository), workspace]);
  return workspace;
}
function ghRepoArgs(repository) { return ["--repo", repository]; }
function prLedgerContains(commandId, repository) {
  const result = run(["gh","pr","list",...ghRepoArgs(repository),"--state","all","--limit","1000","--json","number,body,url"], {allowFailure:true});
  if (result.status !== 0) fail("Could not inspect the pull request ledger");
  const marker = `Pilot queue command: \`${commandId}\``;
  return JSON.parse(result.stdout || "[]").some((pull) => String(pull.body || "").includes(marker));
}
function remoteBranchExists(branch, cwd) {
  return run(["git","ls-remote","--exit-code","--heads","origin",branch], {cwd,allowFailure:true}).status === 0;
}
function prepareCommandBranch(command) {
  const repository = resolveRepository(command);
  if (prLedgerContains(command.command_id, repository)) {
    console.log(`[SKIP] ${command.command_id}: permanent PR ledger match`);
    return null;
  }
  const cwd = prepareWorkspace(repository);
  if (remoteBranchExists(command.branch, cwd)) fail(`Refusing to overwrite existing branch ${command.branch}`);
  run(["git","fetch","origin","main"], {cwd});
  run(["git","checkout","-B",command.branch,"origin/main"], {cwd});
  return { repository, cwd };
}
function configureCommitter(cwd) {
  run(["git","config","user.name","Routalk Pilot Queue"],{cwd});
  run(["git","config","user.email","41898282+github-actions[bot]@users.noreply.github.com"],{cwd});
}
function verifyPreparedWorkspace(repository, cwd) {
  if (repository !== DEFAULT_REPOSITORY) return;

  const verifier = `${cwd}/scripts/verify-release.js`;
  const manifest = `${cwd}/pilot-verification/verification-manifest.v1.json`;
  if (!fs.existsSync(verifier) || !fs.statSync(verifier).isFile())
    fail("Deterministic verification is unavailable: scripts/verify-release.js is missing");
  if (!fs.existsSync(manifest) || !fs.statSync(manifest).isFile())
    fail("Deterministic verification is unavailable: verification manifest is missing");

  const result = run([
    process.execPath,
    "scripts/verify-release.js",
    "--manifest",
    "pilot-verification/verification-manifest.v1.json",
  ], {cwd, allowFailure:true});

  if (result.status !== 0) {
    fail(
      `Deterministic verification failed before PR creation.\n` +
      `stdout: ${result.stdout || ""}\n` +
      `stderr: ${result.stderr || ""}`
    );
  }

  console.log("[VERIFY] Canonical Routalk Pilot verification passed before PR creation");
}
function createPullRequest(command, repository, cwd) {
  run(["git","push","--set-upstream","origin",command.branch],{cwd});
  const body = `${command.pr_body || ""}\n\n---\nPilot queue command: \`${command.command_id}\`\nCreated from the encrypted Routalk Pilot queue.`.trim();
  run(["gh","pr","create",...ghRepoArgs(repository),"--base","main","--head",command.branch,
    "--title",command.pr_title || `Pilot change: ${command.command_id}`,"--body",body],{cwd});
  console.log(`[OK] ${command.command_id}: pull request created in ${repository}`);
}
function processApply(command) {
  const prepared = prepareCommandBranch(command);
  if (!prepared) return;
  const { repository, cwd } = prepared;
  try {
    const writtenPaths = [];
    for (const file of command.files) {
      const path = file.path.replaceAll("\\","/");
      const absolute = `${cwd}/${path}`;
      fs.mkdirSync(absolute.slice(0, absolute.lastIndexOf("/")), {recursive:true});
      fs.writeFileSync(absolute, Buffer.from(file.content_b64,"base64"));
      writtenPaths.push(path);
    }
    configureCommitter(cwd);
    run(["git","add","--",...writtenPaths],{cwd});
    const diff = run(["git","diff","--cached","--quiet"],{cwd,allowFailure:true});
    if (diff.status === 0) return console.log(`[SKIP] ${command.command_id}: requested files match main`);
    verifyPreparedWorkspace(repository, cwd);
    run(["git","commit","-m",command.commit_message || `Pilot queue: ${command.command_id}`],{cwd});
    createPullRequest(command, repository, cwd);
  } finally { if (cwd !== process.cwd()) fs.rmSync(cwd,{recursive:true,force:true}); }
}
function currentBlobSha(path, cwd) {
  const result = run(["git","rev-parse",`HEAD:${path}`],{cwd,allowFailure:true});
  if (result.status !== 0) fail(`Deletion target does not exist on main: ${path}`);
  return String(result.stdout || "").trim().toLowerCase();
}
function processDelete(command) {
  const prepared = prepareCommandBranch(command);
  if (!prepared) return;
  const { repository, cwd } = prepared;
  try {
    for (const item of command.deletions) {
      const observed = currentBlobSha(item.path, cwd);
      if (observed !== item.expected_blob_sha) {
        fail(`Deletion target changed since approval: ${item.path}`);
      }
    }
    configureCommitter(cwd);
    run(["git","rm","--",...command.deletions.map((item) => item.path)],{cwd});
    verifyPreparedWorkspace(repository, cwd);
    run(["git","commit","-m",command.commit_message || `Pilot delete: ${command.command_id}`],{cwd});
    createPullRequest(command, repository, cwd);
  } finally { if (cwd !== process.cwd()) fs.rmSync(cwd,{recursive:true,force:true}); }
}
function main() {
  const queuePath = process.argv[2], secret = process.env.PILOT_QUEUE_SECRET;
  if (!queuePath || !secret) fail("Pilot queue path and secret are required");
  const command = validateCommand(decryptEnvelope(JSON.parse(fs.readFileSync(queuePath,"utf8")),secret));
  if (command.action === "delete") processDelete(command);
  else processApply(command);
}
if (require.main === module) { try { main(); } catch(error) { console.error(`[ERROR] ${error.message || error}`); process.exitCode=1; } }
module.exports = { decryptEnvelope, validateCommand };
