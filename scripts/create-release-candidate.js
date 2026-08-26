#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = { verification: "", output: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--verification") args.verification = argv[++i] || fail("--verification requires a path");
    else if (value === "--output") args.output = argv[++i] || fail("--output requires a path");
    else if (value === "--help" || value === "-h") {
      console.log([
        "Routalk Pilot release-candidate builder",
        "",
        "Usage:",
        "  node scripts/create-release-candidate.js --verification PATH [--output PATH]",
        "",
        "Consumes PASS verification evidence and creates a provider-neutral",
        "release-candidate manifest. It performs no deployment or network call."
      ].join("\n"));
      process.exit(0);
    } else fail(`Unknown argument: ${value}`);
  }
  if (!args.verification) fail("--verification is required");
  return args;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Cannot read/parse verification evidence: ${error.message}`);
  }
}

function normalizeRelative(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) fail("Output path must be non-empty.");
  const normalized = filePath.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail(`Unsafe output path: ${filePath}`);
  }
  return normalized;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validateEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    fail("Verification evidence must be an object.");
  }
  if (evidence.schema_version !== 1) fail("Unsupported verification evidence schema.");
  if (evidence.result !== "PASS") fail("Release candidate requires PASS verification evidence.");
  if (!/^[a-f0-9]{40}$/i.test(evidence.source_sha || "")) {
    fail("Verification evidence must contain an exact 40-character source SHA.");
  }
  if (!/^[a-f0-9]{64}$/i.test(evidence.artifact_digest_sha256 || "")) {
    fail("Verification evidence must contain a valid artifact digest.");
  }
  if (!Array.isArray(evidence.artifact_files) || evidence.artifact_files.length < 1) {
    fail("Verification evidence has no artifact inventory.");
  }
  if (evidence.artifact_files.some((entry) => entry?.missing || !/^[a-f0-9]{64}$/i.test(entry?.sha256 || ""))) {
    fail("Verification evidence contains a missing or unhashed artifact.");
  }
  if (!Array.isArray(evidence.checks) || evidence.checks.length < 1) {
    fail("Verification evidence has no checks.");
  }
  if (evidence.checks.some((check) => check?.status !== "PASS")) {
    fail("Verification evidence contains a non-passing check.");
  }
}

function main() {
  const args = parseArgs(process.argv);
  const root = process.cwd();
  const evidence = readJson(path.resolve(root, args.verification));
  validateEvidence(evidence);

  const fingerprintMaterial = [
    "routalk-pilot-release-candidate-v1",
    evidence.source_sha.toLowerCase(),
    evidence.artifact_digest_sha256.toLowerCase(),
    String(evidence.manifest_name || "")
  ].join("\n");

  const candidateFingerprint = sha256(Buffer.from(fingerprintMaterial, "utf8"));
  const candidate = {
    schema_version: 1,
    kind: "routalk-pilot-release-candidate",
    candidate_id: `rc-${evidence.source_sha.slice(0, 12)}-${candidateFingerprint.slice(0, 12)}`,
    source_sha: evidence.source_sha.toLowerCase(),
    verification: {
      schema_version: evidence.schema_version,
      verifier_version: String(evidence.verifier_version || ""),
      manifest_name: String(evidence.manifest_name || ""),
      artifact_digest_sha256: evidence.artifact_digest_sha256.toLowerCase(),
      evidence_sha256: sha256(Buffer.from(JSON.stringify(evidence), "utf8"))
    },
    artifacts: evidence.artifact_files.map((entry) => ({
      path: String(entry.path),
      bytes: Number(entry.bytes),
      sha256: String(entry.sha256).toLowerCase()
    })),
    lifecycle: {
      state: "VERIFIED",
      approved_for_release: false,
      deployed: false,
      deployment_provider: null,
      deployment_id: null,
      production_verified: false
    }
  };

  const rendered = `${JSON.stringify(candidate, null, 2)}\n`;
  process.stdout.write(rendered);

  if (args.output) {
    const output = path.resolve(root, normalizeRelative(args.output));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, rendered, "utf8");
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schema_version: 1,
    kind: "routalk-pilot-release-candidate-error",
    error: error.message
  }, null, 2)}\n`);
  process.exitCode = 1;
}
