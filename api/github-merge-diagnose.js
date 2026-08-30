const crypto = require("node:crypto");
const PROJECTS = require("../config/projects");

const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 10000;
const DEFAULT_TARGET_REPOSITORY = "pjmcveyroutalk/routalk-pilot";

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function validRepository(value) {
  if (typeof value !== "string") return false;
  const parts = value.split("/");
  return parts.length === 2 && parts.every((part) =>
    part.length > 0 && part.length <= 100 && /^[A-Za-z0-9_.-]+$/.test(part)
  );
}

function allowedRepositories() {
  const configured = process.env.PILOT_TARGET_REPOSITORIES || "";
  return new Set([
    DEFAULT_TARGET_REPOSITORY,
    ...Object.keys(PROJECTS).filter(validRepository),
    ...configured.split(",").map((v) => v.trim()).filter(validRepository),
  ]);
}

function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "routalk-pilot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function probe(url, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers(token),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      github_message: typeof data?.message === "string" ? data.message.slice(0, 240) : null,
      accepted_permissions: response.headers.get("x-accepted-github-permissions"),
      oauth_scopes: response.headers.get("x-oauth-scopes"),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      timeout: error?.name === "AbortError",
      github_message: error?.name === "AbortError" ? "Timed out" : "Network request failed",
      accepted_permissions: null,
      oauth_scopes: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET || "";
  const githubToken = process.env.PILOT_GITHUB_TOKEN || "";
  if (!triggerSecret || !githubToken) {
    return res.status(503).json({ error: "Diagnostic is not configured" });
  }

  const auth = String(req.headers.authorization || "");
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!safeEqual(supplied, triggerSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = typeof req.body === "object" && req.body ? req.body : {};
  const repository = String(body.repository || "").trim();
  const prNumber = Number(body.pr_number);

  if (!validRepository(repository) || !allowedRepositories().has(repository)) {
    return res.status(403).json({ error: "Repository is not allowlisted" });
  }
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    return res.status(400).json({ error: "Invalid pull request number" });
  }

  const base = `${GITHUB_API}/repos/${repository}`;
  const pull = await probe(`${base}/pulls/${prNumber}`, githubToken);

  let headSha = null;
  if (pull.ok) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/pulls/${prNumber}`, {
        headers: headers(githubToken),
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      headSha = typeof data?.head?.sha === "string" ? data.head.sha : null;
    } catch {
      headSha = null;
    } finally {
      clearTimeout(timeout);
    }
  }

  const result = {
    repository,
    pr_number: prNumber,
    pull_lookup: pull,
    head_sha_found: Boolean(headSha),
    check_runs: null,
    commit_status: null,
  };

  if (headSha) {
    [result.check_runs, result.commit_status] = await Promise.all([
      probe(`${base}/commits/${headSha}/check-runs?per_page=100`, githubToken),
      probe(`${base}/commits/${headSha}/status`, githubToken),
    ]);
  }

  const failed = Object.entries(result)
    .filter(([key, value]) =>
      ["pull_lookup", "check_runs", "commit_status"].includes(key) &&
      value && value.ok === false
    )
    .map(([key, value]) => ({ operation: key, status: value.status, github_message: value.github_message }));

  return res.status(200).json({
    ok: failed.length === 0,
    failed,
    result,
  });
};
