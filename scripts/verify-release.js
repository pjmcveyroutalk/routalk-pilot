#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const VERIFIER_VERSION = "1.0.0";

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const args = { manifest: "pilot-verification/verification-manifest.v1.json", output: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--manifest") args.manifest = argv[++i] || fail("--manifest requires a path");
    else if (value === "--output") args.output = argv[++i] || fail("--output requires a path");
    else if (value === "--help" || value === "-h") {
      console.log("Routalk Pilot provider-independent verifier\n\nUsage: node scripts/verify-release.js [--manifest PATH] [--output PATH]\n\nNo GitHub, Vercel, or network calls are made.");
      process.exit(0);
    } else fail(`Unknown argument: ${value}`);
  }
  return args;
}
function normalizeRelative(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) fail("Every path must be a non-empty string.");
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === "..")) fail(`Unsafe path in verification manifest: ${filePath}`);
  return normalized;
}
function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (error) { fail(`Cannot read/parse verification manifest: ${error.message}`); }
}
function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function getSourceSha() {
  const supplied = (process.env.PILOT_SOURCE_SHA || "").trim();
  if (supplied) return supplied;
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? (result.stdout || "").trim() : "unavailable";
}
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail("Verification manifest must be an object.");
  if (manifest.schema_version !== 1) fail("Only verification schema_version 1 is supported.");
  if (typeof manifest.name !== "string" || !manifest.name.trim()) fail("Manifest name is required.");
  if (!Array.isArray(manifest.artifact_files) || !manifest.artifact_files.length) fail("artifact_files must not be empty.");
  if (!Array.isArray(manifest.checks) || !manifest.checks.length) fail("checks must not be empty.");
}
function executeCheck(root, check) {
  const base = { id: typeof check.id === "string" ? check.id : "(missing-id)", type: check.type || "(missing-type)", status: "FAIL", detail: "" };
  try {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(base.id)) throw new Error("Invalid check id.");
    if (check.type === "file_exists") {
      const rel = normalizeRelative(check.path), full = path.join(root, rel);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`Missing file: ${rel}`);
      base.status = "PASS"; base.detail = rel; return base;
    }
    if (check.type === "contains") {
      const rel = normalizeRelative(check.path);
      if (typeof check.text !== "string" || !check.text) throw new Error("contains.text is required.");
      const content = fs.readFileSync(path.join(root, rel), "utf8");
      if (!content.includes(check.text)) throw new Error(`Expected text not found in ${rel}.`);
      base.status = "PASS"; base.detail = `${rel} contains required marker`; return base;
    }
    if (check.type === "node_syntax") {
      const rel = normalizeRelative(check.path);
      const result = spawnSync(process.execPath, ["--check", path.join(root, rel)], { encoding: "utf8" });
      if (result.status !== 0) throw new Error((result.stderr || result.stdout || `Syntax check failed: ${rel}`).trim());
      base.status = "PASS"; base.detail = `${rel} parses with node --check`; return base;
    }
    throw new Error(`Unsupported check type: ${check.type}`);
  } catch (error) { base.detail = error.message; return base; }
}
function main() {
  const args = parseArgs(process.argv), root = process.cwd();
  const manifest = readJson(path.resolve(root, args.manifest));
  validateManifest(manifest);
  const artifactEntries = manifest.artifact_files.map(normalizeRelative).sort().map((rel) => {
    const full = path.join(root, rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return { path: rel, bytes: 0, sha256: null, missing: true };
    const bytes = fs.readFileSync(full); return { path: rel, bytes: bytes.length, sha256: sha256(bytes), missing: false };
  });
  const canonical = artifactEntries.map((e) => `${e.path}\0${e.sha256 || "MISSING"}\0${e.bytes}`).join("\n");
  const checks = manifest.checks.map((check) => executeCheck(root, check));
  for (const e of artifactEntries.filter((x) => x.missing)) checks.push({ id: `artifact-${e.path.replace(/[^A-Za-z0-9._-]/g, "-").slice(0,60)}`, type: "artifact_presence", status: "FAIL", detail: `Missing artifact file: ${e.path}` });
  const result = { schema_version: 1, verifier_version: VERIFIER_VERSION, manifest_name: manifest.name, source_sha: getSourceSha(), artifact_digest_sha256: sha256(Buffer.from(canonical, "utf8")), artifact_files: artifactEntries, checks, result: checks.every((c) => c.status === "PASS") ? "PASS" : "FAIL" };
  const rendered = `${JSON.stringify(result, null, 2)}\n`; process.stdout.write(rendered);
  if (args.output) { const out = path.resolve(root, normalizeRelative(args.output)); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, rendered, "utf8"); }
  process.exitCode = result.result === "PASS" ? 0 : 1;
}
try { main(); } catch (error) { process.stderr.write(`${JSON.stringify({ schema_version: 1, verifier_version: VERIFIER_VERSION, result: "FAIL", configuration_error: error.message }, null, 2)}\n`); process.exitCode = 2; }
