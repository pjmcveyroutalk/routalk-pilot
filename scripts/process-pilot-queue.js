const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const {
  DEFAULT_REPOSITORY,
  resolveRepository,
  validateCommand,
} = require("../lib/command-contract");

function fail(message) { throw new Error(message); }
function terminalFail(message) {
  const error = new Error(message);
  error.pilotTerminal = true;
  throw error;
}
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
  const result = spawnSync(args[0], args.slice(1), {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
  });
  if (!options.allowFailure && result.status !== 0)
    fail(`Command failed: ${args.join(" ")}\nstdout: ${result.stdout || ""}\nstderr: ${result.stderr || ""}`);
  return result;
}
function credentialEnv(token) {
  return { GH_TOKEN: token, GITHUB_TOKEN: token };
}
function chooseRepositoryCredential(repository, appToken, fallbackToken, appAccessible) {
  if (repository !== DEFAULT_REPOSITORY && appToken && appAccessible)
    return { token: appToken, source: "github_app" };
  if (fallbackToken)
    return { token: fallbackToken, source: "existing_target_token" };
  return null;
}
function appCanAccessRepository(repository, appToken) {
  if (!appToken || repository === DEFAULT_REPOSITORY) return false;
  const result = run(
    ["gh", "api", `repos/${repository}`, "--silent"],
    { allowFailure: true, env: credentialEnv(appToken) },
  );
  return result.status === 0;
}
function repositoryCredential(repository) {
  const appToken = String(process.env.PILOT_GITHUB_APP_TOKEN || "").trim();
  const fallbackToken = String(
    process.env.PILOT_TARGET_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    "",
  ).trim();
  const selected = chooseRepositoryCredential(
    repository,
    appToken,
    fallbackToken,
    appCanAccessRepository(repository, appToken),
  );
  if (!selected)
    fail(`No GitHub credential can access ${repository}`);
  console.log(`[AUTH] ${repository}: ${selected.source}`);
  return { ...selected, env: credentialEnv(selected.token) };
}
function remoteUrl(repository, credential) {
  return `https://x-access-token:${encodeURIComponent(credential.token)}@github.com/${repository}.git`;
}
function prepareWorkspace(repository, credential) {
  if (repository === DEFAULT_REPOSITORY) return process.cwd();
  const workspace = fs.mkdtempSync("/tmp/pilot-target-");
  run(["git", "clone", "--depth", "1", "--branch", "main", remoteUrl(repository, credential), workspace]);
  return workspace;
}
function ghRepoArgs(repository) { return ["--repo", repository]; }
function prLedgerContains(commandId, repository, credential) {
  const result = run(
    ["gh","pr","list",...ghRepoArgs(repository),"--state","all","--limit","1000","--json","number,body,url"],
    { allowFailure:true, env: credential.env },
  );
  if (result.status !== 0) fail("Could not inspect the pull request ledger");
  const marker = `Pilot queue command: \`${commandId}\``;
  return JSON.parse(result.stdout || "[]").some((pull) => String(pull.body || "").includes(marker));
}
function remoteBranchExists(branch, cwd) {
  return run(["git","ls-remote","--exit-code","--heads","origin",branch], {cwd,allowFailure:true}).status === 0;
}
function prepareCommandBranch(command) {
  const repository = resolveRepository(command);
  const credential = repositoryCredential(repository);
  if (prLedgerContains(command.command_id, repository, credential)) {
    console.log(`[SKIP] ${command.command_id}: permanent PR ledger match`);
    return null;
  }
  const cwd = prepareWorkspace(repository, credential);
  if (remoteBranchExists(command.branch, cwd)) {
    if (!command.branch.startsWith("chatgpt/"))
      fail(`Refusing to overwrite existing branch ${command.branch}`);

    const fetched = run(["git","fetch","origin",`refs/heads/${command.branch}`], {cwd,allowFailure:true});
    const marker = `Pilot queue command: ${command.command_id}`;
    const tipMessage = fetched.status === 0
      ? run(["git","log","-1","--format=%B","FETCH_HEAD"], {cwd,allowFailure:true})
      : null;
    const owned =
      fetched.status === 0 &&
      tipMessage?.status === 0 &&
      String(tipMessage.stdout || "").includes(marker);

    if (!owned)
      fail(`Refusing to delete unverified existing branch ${command.branch}`);

    const cleanup = run(["git","push","origin","--delete",command.branch], {cwd,allowFailure:true});
    if (cleanup.status !== 0 || remoteBranchExists(command.branch, cwd))
      fail(`Could not recover orphaned Pilot branch ${command.branch}`);

    console.log(`[RECOVERY] ${command.command_id}: removed verified orphaned Pilot branch ${command.branch}`);
  }
  run(["git","fetch","origin","main"], {cwd});
  run(["git","checkout","-B",command.branch,"origin/main"], {cwd});
  return { repository, cwd, credential };
}
function configureCommitter(cwd) {
  run(["git","config","user.name","Routalk Pilot Queue"],{cwd});
  run(["git","config","user.email","41898282+github-actions[bot]@users.noreply.github.com"],{cwd});
}
function verifyChangedPayloads(paths, cwd) {
  for (const rel of paths) {
    const absolute = `${cwd}/${rel}`;
    const lower = rel.toLowerCase();

    if (lower.endsWith(".json")) {
      try {
        JSON.parse(fs.readFileSync(absolute, "utf8"));
      } catch (error) {
        terminalFail(`Payload verification failed for ${rel}: invalid JSON (${error.message})`);
      }
      continue;
    }

    if (lower.endsWith(".js") || lower.endsWith(".cjs") || lower.endsWith(".mjs")) {
      const result = run([process.execPath, "--check", absolute], {cwd, allowFailure:true});
      if (result.status !== 0) {
        terminalFail(`Payload verification failed for ${rel}: ${result.stderr || result.stdout || "JavaScript syntax error"}`);
      }
    }
  }

  console.log("[VERIFY] Changed payload syntax checks passed");
}
function verifyPreparedWorkspace(repository, cwd) {
  if (repository !== DEFAULT_REPOSITORY) return;

  const verifier = `${cwd}/scripts/verify-release.js`;
  const manifest = `${cwd}/pilot-verification/verification-manifest.v1.json`;
  if (!fs.existsSync(verifier) || !fs.statSync(verifier).isFile())
    terminalFail("Deterministic verification is unavailable: scripts/verify-release.js is missing");
  if (!fs.existsSync(manifest) || !fs.statSync(manifest).isFile())
    terminalFail("Deterministic verification is unavailable: verification manifest is missing");

  const result = run([
    process.execPath,
    "scripts/verify-release.js",
    "--manifest",
    "pilot-verification/verification-manifest.v1.json",
  ], {cwd, allowFailure:true});

  if (result.status !== 0) {
    terminalFail(
      `Deterministic verification failed before PR creation.\n` +
      `stdout: ${result.stdout || ""}\n` +
      `stderr: ${result.stderr || ""}`
    );
  }

  console.log("[VERIFY] Canonical Routalk Pilot verification passed before PR creation");
}
function createPullRequest(command, repository, cwd, credential) {
  run(["git","push","--set-upstream","origin",command.branch],{cwd});
  const body = `${command.pr_body || ""}\n\n---\nPilot queue command: \`${command.command_id}\`\nCreated from the encrypted Routalk Pilot queue.`.trim();
  const created = run(["gh","pr","create",...ghRepoArgs(repository),"--base","main","--head",command.branch,
    "--title",command.pr_title || `Pilot change: ${command.command_id}`,"--body",body],
    {cwd,allowFailure:true,env:credential.env});

  if (created.status !== 0) {
    if (prLedgerContains(command.command_id, repository, credential)) {
      console.log(`[OK] ${command.command_id}: pull request creation reconciled after ambiguous GitHub response`);
      return;
    }

    const cleanup = run(["git","push","origin","--delete",command.branch],{cwd,allowFailure:true});
    if (cleanup.status === 0)
      console.log(`[RECOVERY] ${command.command_id}: removed orphaned branch after PR creation failure`);
    else
      console.error(`[RECOVERY] ${command.command_id}: could not remove orphaned branch ${command.branch}`);

    fail(`Pull request creation failed after branch push.\nstdout: ${created.stdout || ""}\nstderr: ${created.stderr || ""}`);
  }

  console.log(`[OK] ${command.command_id}: pull request created in ${repository}`);
}
function processApply(command) {
  const prepared = prepareCommandBranch(command);
  if (!prepared) return;
  const { repository, cwd, credential } = prepared;
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
    verifyChangedPayloads(writtenPaths, cwd);
    verifyPreparedWorkspace(repository, cwd);
    run([
      "git","commit",
      "-m",command.commit_message || `Pilot queue: ${command.command_id}`,
      "-m",`Pilot queue command: ${command.command_id}`
    ],{cwd});
    createPullRequest(command, repository, cwd, credential);
  } finally { if (cwd !== process.cwd()) fs.rmSync(cwd,{recursive:true,force:true}); }
}
function findOpenQueueRecord(commandId) {
  const result = run([
    "gh","issue","list",
    "--repo",DEFAULT_REPOSITORY,
    "--state","open",
    "--limit","1000",
    "--json","number,title"
  ], {allowFailure:true});
  if (result.status !== 0) return null;

  let issues;
  try { issues = JSON.parse(result.stdout || "[]"); }
  catch { return null; }

  const expected = `Pilot queue command ${commandId}`;
  return issues.find((issue) => issue.title === expected) || null;
}

function markTerminalFailure(commandId, message) {
  const record = findOpenQueueRecord(commandId);
  if (!record?.number) {
    console.error(`[FAILURE] ${commandId}: terminal failure could not locate its queue record`);
    return false;
  }

  const summary = String(message || "Pilot command failed deterministic verification")
    .replace(/\s+/g, " ")
    .slice(0, 600);

  const result = run([
    "gh","issue","close",String(record.number),
    "--repo",DEFAULT_REPOSITORY,
    "--reason","not planned",
    "--comment",`Pilot stopped retrying this command because the same package cannot succeed unchanged. ${summary}`
  ], {allowFailure:true});

  if (result.status !== 0) {
    console.error(`[FAILURE] ${commandId}: could not persist terminal queue state`);
    return false;
  }

  console.log(`[FAILURE] ${commandId}: terminal queue state persisted; scheduled retries stopped`);
  return true;
}

function currentBlobSha(path, cwd) {
  const result = run(["git","rev-parse",`HEAD:${path}`],{cwd,allowFailure:true});
  if (result.status !== 0) fail(`Deletion target does not exist on main: ${path}`);
  return String(result.stdout || "").trim().toLowerCase();
}
function processDelete(command) {
  const prepared = prepareCommandBranch(command);
  if (!prepared) return;
  const { repository, cwd, credential } = prepared;
  try {
    for (const item of command.deletions) {
      const observed = currentBlobSha(item.path, cwd);
      if (observed !== item.expected_blob_sha) {
        terminalFail(`Deletion target changed since approval: ${item.path}`);
      }
    }
    configureCommitter(cwd);
    run(["git","rm","--",...command.deletions.map((item) => item.path)],{cwd});
    verifyPreparedWorkspace(repository, cwd);
    run([
      "git","commit",
      "-m",command.commit_message || `Pilot delete: ${command.command_id}`,
      "-m",`Pilot queue command: ${command.command_id}`
    ],{cwd});
    createPullRequest(command, repository, cwd, credential);
  } finally { if (cwd !== process.cwd()) fs.rmSync(cwd,{recursive:true,force:true}); }
}
function main() {
  const queuePath = process.argv[2], secret = process.env.PILOT_QUEUE_SECRET;
  if (!queuePath || !secret) fail("Pilot queue path and secret are required");
  const command = validateCommand(decryptEnvelope(JSON.parse(fs.readFileSync(queuePath,"utf8")),secret));
  try {
    if (command.action === "delete") processDelete(command);
    else processApply(command);
  } catch (error) {
    if (error?.pilotTerminal) markTerminalFailure(command.command_id, error.message);
    throw error;
  }
}
if (require.main === module) { try { main(); } catch(error) { console.error(`[ERROR] ${error.message || error}`); process.exitCode=1; } }
module.exports = {
  decryptEnvelope,
  validateCommand,
  _test: { chooseRepositoryCredential },
};
