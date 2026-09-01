const crypto = require("node:crypto");
const projects = require("../config/projects");

const GITHUB_API = "https://api.github.com";
const VERCEL_API = "https://api.vercel.com";
const TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 4_000;
const CONTROL_REPOSITORY = "pjmcveyroutalk/routalk-pilot";
const REGISTRY_PATH = "config/projects.js";
const EXPERIMENTAL_TARGET = "pjmcveyroutalk/pilot-customer-zero-01";

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setSecurityHeaders(response, requestId) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Pilot-Request-Id", requestId);
}

function send(response, status, requestId, body) {
  return response.status(status).json({ ...body, request_id: requestId });
}

function readBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "object") return request.body;
  try { return JSON.parse(request.body); } catch { return {}; }
}

function validRepository(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value);
}

function renderProjects(source) {
  const lines = ["module.exports = Object.freeze({"];
  for (const [repository, project] of Object.entries(source)) {
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
  return crypto
    .createHash("sha1")
    .update(`blob ${body.length}\0`)
    .update(body)
    .digest("hex");
}

async function requestJson(url, token, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "routalk-pilot",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const data = await result.json().catch(() => ({}));
    return { ok: result.ok, status: result.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      timedOut: error?.name === "AbortError",
      data: {},
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function github(path, token, options = {}) {
  return requestJson(`${GITHUB_API}${path}`, token, {
    ...options,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
}

async function vercel(path, token, options = {}) {
  return requestJson(`${VERCEL_API}${path}`, token, options);
}

function buildUnregisterPackage(repository, expectedBlobSha, requestId) {
  if (!/^[0-9a-f]{40}$/.test(expectedBlobSha || "")) {
    throw new Error("Current Pilot project-registry baseline is unavailable.");
  }

  const nextProjects = Object.fromEntries(
    Object.entries(projects).filter(([key]) => key !== repository),
  );
  if (Object.keys(nextProjects).length === Object.keys(projects).length) {
    throw new Error("Project is not registered in Pilot.");
  }

  const suffix = crypto
    .createHash("sha256")
    .update(`${repository}:${requestId}:unregister`)
    .digest("hex")
    .slice(0, 12);
  const name = repository.split("/")[1];

  return {
    version: 1,
    command_id: `PILOT-UNREGISTER-${suffix}`,
    action: "apply",
    repository: CONTROL_REPOSITORY,
    branch: `chatgpt/unregister-${name}-${suffix}`,
    files: [{
      path: REGISTRY_PATH,
      content_b64: Buffer.from(renderProjects(nextProjects)).toString("base64"),
      expected_blob_sha: expectedBlobSha,
    }],
    change_scope: {
      requested_change: `Remove deleted experimental project ${repository} from the Pilot registry.`,
      preserve: [
        "All remaining project registrations and verifier settings",
        "Pilot control-repository role",
        "Queue, merge, deployment, authentication, and verification contracts",
      ],
      allowed_variation: [
        `Remove only ${repository} from config/projects.js`,
      ],
      touched_paths: [REGISTRY_PATH],
    },
    approval: {
      basis: "direct_request",
      reference: `Controlled teardown of disposable project ${repository}.`,
    },
    commit_message: `Unregister deleted project ${name}`,
    pr_title: `Teardown: unregister ${name}`,
    pr_body:
      "Controlled teardown cleanup after the disposable Customer Zero project was deleted. Removes only its Pilot registry entry.",
  };
}

async function inspect(repository, targetToken, controlToken, vercelToken, teamId) {
  const project = projects[repository];
  if (!project || project.role !== "target") {
    return { ready: false, code: "PROJECT_NOT_REGISTERED" };
  }

  const registry = await github(
    `/repos/${CONTROL_REPOSITORY}/contents/${REGISTRY_PATH}?ref=main`,
    controlToken,
  );
  const registrySha = String(registry.data?.sha || "");
  const deployedRegistrySha = gitBlobSha(renderProjects(projects));
  const registryCurrent =
    registry.ok &&
    /^[0-9a-f]{40}$/.test(registrySha) &&
    registrySha === deployedRegistrySha;

  const repositoryResult = await github(`/repos/${repository}`, targetToken);
  const projectName = repository.split("/")[1].toLowerCase();
  const vercelResult = await vercel(
    `/v9/projects/${encodeURIComponent(projectName)}?teamId=${encodeURIComponent(teamId)}`,
    vercelToken,
  );

  const githubPresent = repositoryResult.ok;
  const githubAdmin =
    repositoryResult.ok &&
    repositoryResult.data?.permissions?.admin !== false;
  const vercelPresent = vercelResult.ok;
  const vercelAbsent = vercelResult.status === 404;

  return {
    ready:
      registryCurrent &&
      githubPresent &&
      githubAdmin &&
      (vercelPresent || vercelAbsent),
    code: registryCurrent ? "READY_FOR_TEARDOWN" : "REGISTRY_BASELINE_STALE",
    registry: {
      current: registryCurrent,
      expected_blob_sha: registryCurrent ? registrySha : null,
    },
    github: {
      present: githubPresent,
      admin: githubAdmin,
      status: repositoryResult.status || null,
    },
    vercel: {
      present: vercelPresent,
      already_absent: vercelAbsent,
      status: vercelResult.status || null,
    },
  };
}

module.exports = async function handler(request, response) {
  const requestId = crypto.randomUUID();
  setSecurityHeaders(response, requestId);

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, requestId, { error: "Method not allowed" });
  }

  const contentLength = Number(request.headers["content-length"] || 0);
  if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) {
    return send(response, 413, requestId, { error: "Request body is too large" });
  }

  const triggerSecret = process.env.PILOT_TRIGGER_SECRET;
  const targetToken =
    process.env.PILOT_TARGET_GITHUB_TOKEN ||
    process.env.PILOT_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    "";
  const controlToken = process.env.PILOT_GITHUB_TOKEN || "";
  const vercelToken =
    process.env.PILOT_VERCEL_TOKEN ||
    process.env.VERCEL_TOKEN ||
    "";
  const teamId =
    process.env.PILOT_VERCEL_TEAM_ID ||
    "team_jC9jlJ9GZ9GSjrbYoD0pin3U";

  if (!triggerSecret || !targetToken || !controlToken || !vercelToken) {
    return send(response, 503, requestId, {
      error: "Pilot teardown is not configured.",
      code: "TEARDOWN_NOT_CONFIGURED",
    });
  }

  const supplied = String(request.headers.authorization || "").replace(/^Bearer /, "");
  if (!safeEqual(supplied, triggerSecret)) {
    return send(response, 401, requestId, { error: "Unauthorized" });
  }

  const body = readBody(request);
  const repository =
    typeof body.repository === "string" ? body.repository.trim() : "";
  const mode = typeof body.mode === "string" ? body.mode.trim() : "";

  if (!validRepository(repository)) {
    return send(response, 400, requestId, {
      error: "Repository must use owner/name format.",
      code: "INVALID_REPOSITORY",
    });
  }

  if (repository !== EXPERIMENTAL_TARGET) {
    return send(response, 403, requestId, {
      error:
        "Experimental teardown is locked to the disposable Customer Zero 01 repository.",
      code: "TEARDOWN_TARGET_NOT_ALLOWED",
    });
  }

  const readiness = await inspect(
    repository,
    targetToken,
    controlToken,
    vercelToken,
    teamId,
  );

  if (mode === "inspect") {
    return send(response, readiness.ready ? 200 : 409, requestId, {
      repository,
      destructive: true,
      confirmation_required: `DELETE ${repository}`,
      readiness,
    });
  }

  if (mode !== "execute") {
    return send(response, 400, requestId, {
      error: "Mode must be inspect or execute.",
      code: "INVALID_TEARDOWN_MODE",
    });
  }

  if (body.confirmation !== `DELETE ${repository}`) {
    return send(response, 400, requestId, {
      error: "Exact destructive confirmation is required.",
      code: "TEARDOWN_CONFIRMATION_REQUIRED",
    });
  }

  if (!readiness.ready) {
    return send(response, 409, requestId, {
      error: "Pilot refused teardown because the preflight did not pass.",
      code: "TEARDOWN_PREFLIGHT_FAILED",
      readiness,
    });
  }

  const projectName = repository.split("/")[1].toLowerCase();
  let vercelDeleted = readiness.vercel.already_absent;
  if (!vercelDeleted) {
    const deletedVercel = await vercel(
      `/v9/projects/${encodeURIComponent(projectName)}?teamId=${encodeURIComponent(teamId)}`,
      vercelToken,
      { method: "DELETE" },
    );
    vercelDeleted = deletedVercel.ok || deletedVercel.status === 404;
    if (!vercelDeleted) {
      return send(response, 409, requestId, {
        error: "Vercel project deletion failed. GitHub was left untouched.",
        code: "VERCEL_DELETE_FAILED",
        vercel_status: deletedVercel.status || null,
        github_deleted: false,
      });
    }
  }

  const deletedGithub = await github(`/repos/${repository}`, targetToken, {
    method: "DELETE",
  });
  const githubDeleted = deletedGithub.ok || deletedGithub.status === 404;

  if (!githubDeleted) {
    return send(response, 409, requestId, {
      error:
        "Vercel project was deleted, but GitHub repository deletion failed. Repair GitHub delete permission and retry this same teardown.",
      code: "PARTIAL_TEARDOWN_GITHUB_DELETE_FAILED",
      vercel_deleted: true,
      github_deleted: false,
      github_status: deletedGithub.status || null,
    });
  }

  const cleanupPackage = buildUnregisterPackage(
    repository,
    readiness.registry.expected_blob_sha,
    requestId,
  );

  return send(response, 200, requestId, {
    deleted: true,
    repository,
    vercel_deleted: true,
    github_deleted: true,
    registry_cleanup_required: true,
    cleanup_package: cleanupPackage,
    next_action: "REVIEW_REGISTRY_CLEANUP_IN_PILOT",
  });
};

module.exports._test = {
  EXPERIMENTAL_TARGET,
  buildUnregisterPackage,
  gitBlobSha,
  renderProjects,
  validRepository,
};
