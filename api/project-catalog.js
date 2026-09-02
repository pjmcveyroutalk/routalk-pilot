const crypto = require("node:crypto");
const PROJECTS = require("../config/projects");
const { resolveTargetGithubToken } = require("../lib/github-credentials");

const GITHUB_API = "https://api.github.com";
const CONTROL_REPOSITORY = "pjmcveyroutalk/routalk-pilot";
const MAX_PAGES = 10;

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function validRepository(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value);
}
function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "routalk-pilot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}
async function github(path, token, options = {}, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${GITHUB_API}${path}`, {
      ...options,
      headers: { ...headers(token), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}
function renderProjects(projects) {
  const lines = ["module.exports = Object.freeze({"];
  for (const [repository, project] of Object.entries(projects)) {
    lines.push(`  ${JSON.stringify(repository)}: Object.freeze({`);
    lines.push(`    role: ${JSON.stringify(project.role)},`);
    if (project.production_verifier) {
      lines.push("    production_verifier: Object.freeze({");
      lines.push(`      url: ${JSON.stringify(project.production_verifier.url)},`);
      lines.push(`      auth: ${JSON.stringify(project.production_verifier.auth)},`);
      lines.push("    }),");
    }
    lines.push("  }),");
  }
  lines.push("});", "");
  return lines.join("\n");
}
function gitBlobSha(content) {
  const body = Buffer.from(content);
  return crypto.createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}
function buildRegistrationPackage(repository, requestId, expectedBlobSha) {
  if (PROJECTS[repository]) return null;
  if (!/^[0-9a-f]{40}$/.test(expectedBlobSha || "")) {
    throw new Error("Current Pilot project-registry baseline is unavailable.");
  }
  const projects = { ...PROJECTS, [repository]: Object.freeze({ role: "target" }) };
  const suffix = crypto.createHash("sha256")
    .update(`${repository}:${requestId}`).digest("hex").slice(0, 12);
  const projectName = repository.split("/")[1].replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 56);
  return {
    version: 1,
    command_id: `PILOT-REGISTER-${suffix}`,
    action: "apply",
    repository: CONTROL_REPOSITORY,
    branch: `chatgpt/register-${projectName}-${suffix}`,
    files: [{
      path: "config/projects.js",
      content_b64: Buffer.from(renderProjects(projects)).toString("base64"),
      expected_blob_sha: expectedBlobSha,
    }],
    change_scope: {
      requested_change: `Register ${repository} as a Pilot target.`,
      preserve: [
        "All existing project registrations and production verifier settings",
        "Pilot control-repository role and project-registry format",
        "Existing queue, merge, deployment, and production-verification authorities",
      ],
      allowed_variation: [
        `Add ${repository} with role target; deployment verification remains separately provisioned`,
      ],
      touched_paths: ["config/projects.js"],
    },
    approval: {
      basis: "direct_request",
      reference: `Project registration approved for ${repository}.`.slice(0, 240),
    },
    commit_message: `Register ${repository} as a Pilot target`,
    pr_title: `Onboarding: register ${projectName}`,
    pr_body:
      "Pilot project registration. This adds the repository as a target through the guarded Pilot queue and explicit merge-approval path. Production verification remains separately provisioned.",
  };
}
async function listAuthorizedRepositories(token, owner, fetchImpl = fetch) {
  const repositories = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await github(
      `/user/repos?per_page=100&page=${page}&sort=full_name&direction=asc&affiliation=owner%2Ccollaborator%2Corganization_member`,
      token, {}, fetchImpl
    );
    if (!result.ok) {
      const error = new Error("GitHub repository discovery failed");
      error.status = result.status;
      throw error;
    }
    const items = Array.isArray(result.data) ? result.data : [];
    for (const item of items) {
      const repository = String(item?.full_name || "");
      if (!validRepository(repository)) continue;
      if (repository.split("/")[0].toLowerCase() !== owner.toLowerCase()) continue;
      repositories.push({
        repository,
        default_branch: String(item?.default_branch || "main"),
        private: item?.private === true,
      });
    }
    if (items.length < 100) break;
  }
  return repositories;
}
function buildCatalog(discovered) {
  const byRepository = new Map();
  for (const [repository, project] of Object.entries(PROJECTS)) {
    byRepository.set(repository, {
      repository,
      role: project.role,
      registered: true,
      authorized: false,
      verification_configured: Boolean(project.production_verifier),
      default_branch: null,
      private: null,
    });
  }
  for (const item of discovered) {
    const existing = byRepository.get(item.repository);
    byRepository.set(item.repository, {
      repository: item.repository,
      role: existing?.role || "available",
      registered: Boolean(existing?.registered),
      authorized: true,
      verification_configured: Boolean(existing?.verification_configured),
      default_branch: item.default_branch,
      private: item.private,
    });
  }
  return [...byRepository.values()].sort((a, b) => {
    if (a.role === "control") return -1;
    if (b.role === "control") return 1;
    return a.repository.localeCompare(b.repository);
  });
}
function send(res, status, requestId, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Pilot-Request-Id", requestId);
  return res.status(status).json({ ...body, request_id: requestId });
}
function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
module.exports = async function handler(req, res) {
  const requestId = crypto.randomUUID();
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, requestId, { error: "Method not allowed" });
  }
  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const token = resolveTargetGithubToken();
  if (!triggerSecret || !token) {
    return send(res, 503, requestId, {
      error: "Pilot repository discovery is not configured",
      code: "PROJECT_DISCOVERY_NOT_CONFIGURED",
    });
  }
  const supplied = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (!safeEqual(supplied, triggerSecret)) {
    return send(res, 401, requestId, { error: "Unauthorized" });
  }
  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";

  if (req.method === "GET") {
    try {
      const discovered = await listAuthorizedRepositories(token, owner);
      return send(res, 200, requestId, { ok: true, projects: buildCatalog(discovered) });
    } catch (error) {
      return send(res, error.status === 401 ? 502 : 503, requestId, {
        error: "Pilot could not discover authorized GitHub repositories.",
        code: error.status === 401 ? "GITHUB_CREDENTIAL_REJECTED" : "GITHUB_REPOSITORY_DISCOVERY_FAILED",
        github_status: error.status || null,
      });
    }
  }

  const repository = String(readBody(req).repository || "").trim();
  if (!validRepository(repository) ||
      repository.split("/")[0].toLowerCase() !== owner.toLowerCase()) {
    return send(res, 400, requestId, {
      error: "Repository is invalid or outside Pilot's configured GitHub owner.",
      code: "INVALID_TARGET_REPOSITORY",
    });
  }
  if (PROJECTS[repository]) {
    return send(res, 200, requestId, {
      registered: true,
      repository,
      registration_required: false,
      next_action: "RUN_PILOT_ONBOARDING",
    });
  }

  const encoded = repository.split("/").map(encodeURIComponent).join("/");
  const access = await github(`/repos/${encoded}`, token);
  if (!access.ok) {
    return send(res, [401, 403, 404].includes(access.status) ? 409 : 503, requestId, {
      error: "Pilot cannot register a repository its target GitHub credential cannot access.",
      code: "TARGET_REPO_NOT_ACCESSIBLE",
      github_status: access.status || null,
    });
  }

  const registry = await github(
    `/repos/${CONTROL_REPOSITORY}/contents/config/projects.js?ref=main`, token
  );
  const registrySha = String(registry.data?.sha || "");
  if (!registry.ok || !/^[0-9a-f]{40}$/.test(registrySha)) {
    return send(res, 503, requestId, {
      error: "Pilot could not verify the current project registry.",
      code: "PROJECT_REGISTRY_BASELINE_UNAVAILABLE",
    });
  }
  if (gitBlobSha(renderProjects(PROJECTS)) !== registrySha) {
    return send(res, 409, requestId, {
      error: "Pilot's deployed project registry is behind GitHub main. Retry after deployment completes.",
      code: "PROJECT_REGISTRY_DEPLOYMENT_STALE",
    });
  }

  const registrationPackage = buildRegistrationPackage(repository, requestId, registrySha);
  return send(res, 200, requestId, {
    registered: false,
    repository,
    registration_required: true,
    registration_package: registrationPackage,
    next_action: "REVIEW_PROJECT_REGISTRATION",
  });
};

module.exports._test = {
  buildCatalog,
  buildRegistrationPackage,
  gitBlobSha,
  listAuthorizedRepositories,
  renderProjects,
  validRepository,
};
