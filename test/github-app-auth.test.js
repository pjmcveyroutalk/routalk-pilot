const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  createAppJwt,
  readAppConfig,
  resolveAuthMode,
  resolveMergeGithubCredential,
} = require("../lib/github-app-auth");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const PRIVATE_KEY = privateKey.export({
  type: "pkcs8",
  format: "pem",
});

function decodePart(value) {
  return JSON.parse(
    Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64")
      .toString("utf8"),
  );
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

async function run() {
  assert.deepEqual(resolveAuthMode({}), { ok: true, mode: "pat" });
  assert.equal(resolveAuthMode({ PILOT_GITHUB_AUTH_MODE: "wat" }).ok, false);

  const partial = readAppConfig({
    PILOT_GITHUB_APP_ID: "123",
  });
  assert.equal(partial.ok, false);

  const jwt = createAppJwt({
    appId: "123",
    privateKey: PRIVATE_KEY,
    now: 1_800_000_000_000,
  });
  const [headerPart, payloadPart, signaturePart] = jwt.split(".");
  const header = decodePart(headerPart);
  const payload = decodePart(payloadPart);
  assert.equal(header.alg, "RS256");
  assert.equal(payload.iss, "123");
  assert.equal(payload.exp - payload.iat, 600);
  assert.equal(
    crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      publicKey,
      Buffer.from(
        signaturePart.replaceAll("-", "+").replaceAll("_", "/"),
        "base64",
      ),
    ),
    true,
  );

  const pat = await resolveMergeGithubCredential({
    repository: "pjmcveyroutalk/routalk-pilot",
    env: {
      PILOT_GITHUB_AUTH_MODE: "pat",
      PILOT_GITHUB_TOKEN: "control-token",
    },
  });
  assert.equal(pat.ok, true);
  assert.equal(pat.source, "pat");
  assert.equal(pat.token, "control-token");

  let requestedBody = null;
  const app = await resolveMergeGithubCredential({
    repository: "pjmcveyroutalk/routalk-pilot",
    env: {
      PILOT_GITHUB_AUTH_MODE: "app_required",
      PILOT_GITHUB_APP_ID: "123",
      PILOT_GITHUB_APP_INSTALLATION_ID: "456",
      PILOT_GITHUB_APP_PRIVATE_KEY: PRIVATE_KEY,
    },
    fetchImpl: async (url, options) => {
      assert.ok(String(url).endsWith("/app/installations/456/access_tokens"));
      assert.ok(String(options.headers.Authorization).startsWith("Bearer "));
      requestedBody = JSON.parse(options.body);
      return response(201, {
        token: "ghs_test_installation_token",
        expires_at: "2026-09-03T01:00:00Z",
      });
    },
  });
  assert.equal(app.ok, true);
  assert.equal(app.source, "github_app");
  assert.equal(app.token, "ghs_test_installation_token");
  assert.deepEqual(requestedBody.repositories, ["routalk-pilot"]);
  assert.deepEqual(requestedBody.permissions, {
    pull_requests: "write",
    checks: "read",
    statuses: "read",
  });
  assert.equal("administration" in requestedBody.permissions, false);
  assert.equal("workflows" in requestedBody.permissions, false);

  const preferredFallback = await resolveMergeGithubCredential({
    repository: "pjmcveyroutalk/routalk-pilot",
    env: {
      PILOT_GITHUB_AUTH_MODE: "app_preferred",
      PILOT_GITHUB_TOKEN: "compatibility-token",
      PILOT_GITHUB_APP_ID: "123",
      PILOT_GITHUB_APP_INSTALLATION_ID: "456",
      PILOT_GITHUB_APP_PRIVATE_KEY: PRIVATE_KEY,
    },
    fetchImpl: async () => response(403, { message: "Forbidden" }),
  });
  assert.equal(preferredFallback.ok, true);
  assert.equal(preferredFallback.source, "pat_fallback");
  assert.equal(preferredFallback.token, "compatibility-token");
  assert.equal(preferredFallback.app_http_status, 403);

  const requiredFailure = await resolveMergeGithubCredential({
    repository: "pjmcveyroutalk/routalk-pilot",
    env: {
      PILOT_GITHUB_AUTH_MODE: "app_required",
      PILOT_GITHUB_TOKEN: "must-not-be-used",
      PILOT_GITHUB_APP_ID: "123",
      PILOT_GITHUB_APP_INSTALLATION_ID: "456",
      PILOT_GITHUB_APP_PRIVATE_KEY: PRIVATE_KEY,
    },
    fetchImpl: async () => response(403, { message: "Forbidden" }),
  });
  assert.equal(requiredFailure.ok, false);
  assert.equal(requiredFailure.http_status, 403);

  const incompletePreferred = await resolveMergeGithubCredential({
    repository: "pjmcveyroutalk/routalk-pilot",
    env: {
      PILOT_GITHUB_AUTH_MODE: "app_preferred",
      PILOT_GITHUB_TOKEN: "must-not-hide-partial-config",
      PILOT_GITHUB_APP_ID: "123",
    },
  });
  assert.equal(incompletePreferred.ok, false);

  console.log("GitHub App auth foundation tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
