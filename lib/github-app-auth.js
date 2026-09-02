const crypto = require("node:crypto");

const GITHUB_API = "https://api.github.com";
const APP_TOKEN_TIMEOUT_MS = 10_000;
const AUTH_MODES = new Set(["pat", "app_preferred", "app_required"]);

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function normalizePrivateKey(value) {
  return String(value || "").replaceAll("\\n", "\n").trim();
}

function resolveAuthMode(env = process.env) {
  const raw = String(env.PILOT_GITHUB_AUTH_MODE || "pat").trim().toLowerCase();
  if (!AUTH_MODES.has(raw)) {
    return { ok: false, error: "Invalid PILOT_GITHUB_AUTH_MODE" };
  }
  return { ok: true, mode: raw };
}

function readAppConfig(env = process.env) {
  const appId = String(env.PILOT_GITHUB_APP_ID || "").trim();
  const installationId = String(env.PILOT_GITHUB_APP_INSTALLATION_ID || "").trim();
  const privateKey = normalizePrivateKey(env.PILOT_GITHUB_APP_PRIVATE_KEY);

  const present = [appId, installationId, privateKey].filter(Boolean).length;
  if (present > 0 && present < 3) {
    return { ok: false, error: "GitHub App configuration is incomplete" };
  }

  if (present === 0) {
    return { ok: true, configured: false };
  }

  if (!/^\d+$/.test(appId) || !/^\d+$/.test(installationId)) {
    return { ok: false, error: "GitHub App identifiers are invalid" };
  }

  if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
    return { ok: false, error: "GitHub App private key is invalid" };
  }

  return {
    ok: true,
    configured: true,
    appId,
    installationId,
    privateKey,
  };
}

function createAppJwt({ appId, privateKey, now = Date.now() }) {
  const nowSeconds = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iat: nowSeconds - 60,
    exp: nowSeconds + 540,
    iss: String(appId),
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    privateKey,
  );
  return `${signingInput}.${base64url(signature)}`;
}

async function mintInstallationToken({
  repository,
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
}) {
  const config = readAppConfig(env);
  if (!config.ok) return config;
  if (!config.configured) {
    return { ok: false, error: "GitHub App is not configured" };
  }

  const parts = String(repository || "").split("/");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[0]) ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[1])
  ) {
    return { ok: false, error: "Repository is invalid" };
  }

  let jwt;
  try {
    jwt = createAppJwt({
      appId: config.appId,
      privateKey: config.privateKey,
      now,
    });
  } catch {
    return { ok: false, error: "Could not sign GitHub App JWT" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APP_TOKEN_TIMEOUT_MS);
  try {
    const result = await fetchImpl(
      `${GITHUB_API}/app/installations/${config.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "User-Agent": "routalk-pilot",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          repositories: [parts[1]],
          permissions: {
            pull_requests: "write",
            checks: "read",
            statuses: "read",
          },
        }),
        signal: controller.signal,
      },
    );

    const data = await result.json().catch(() => ({}));
    if (!result.ok || typeof data.token !== "string" || !data.token) {
      return {
        ok: false,
        error: "GitHub App installation token request failed",
        http_status: result.status,
      };
    }

    return {
      ok: true,
      token: data.token,
      expires_at: String(data.expires_at || ""),
      source: "github_app",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error?.name === "AbortError"
          ? "GitHub App installation token request timed out"
          : "GitHub App installation token request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveMergeGithubCredential({
  repository,
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
}) {
  const modeResult = resolveAuthMode(env);
  if (!modeResult.ok) return modeResult;

  const mode = modeResult.mode;
  const pat = String(env.PILOT_GITHUB_TOKEN || "").trim();

  if (mode === "pat") {
    return pat
      ? { ok: true, token: pat, source: "pat", mode }
      : { ok: false, error: "PILOT_GITHUB_TOKEN is not configured", mode };
  }

  const config = readAppConfig(env);
  if (!config.ok) {
    return { ...config, mode };
  }
  if (!config.configured) {
    return {
      ok: false,
      error: "GitHub App authentication mode requires complete App configuration",
      mode,
    };
  }

  const app = await mintInstallationToken({
    repository,
    env,
    fetchImpl,
    now,
  });

  if (app.ok) {
    return { ...app, mode };
  }

  if (mode === "app_preferred" && pat) {
    return {
      ok: true,
      token: pat,
      source: "pat_fallback",
      mode,
      diagnostic: app.error,
      app_http_status: app.http_status || 0,
    };
  }

  return {
    ok: false,
    error: app.error,
    http_status: app.http_status || 0,
    mode,
  };
}

module.exports = {
  createAppJwt,
  mintInstallationToken,
  readAppConfig,
  resolveAuthMode,
  resolveMergeGithubCredential,
};
