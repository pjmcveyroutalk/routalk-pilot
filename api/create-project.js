const crypto = require("node:crypto");
const PROJECTS = require("../config/projects");

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 4_000;
const CONTROL_REPOSITORY = "pjmcveyroutalk/routalk-pilot";

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validProjectName(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 100 &&
    /^[A-Za-z0-9._-]+$/.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

function normalizeDescription(value) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > 200) {
    throw new Error("Project description must be 200 characters or fewer.");
  }
  return value.trim();
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
  try {
    return JSON.parse(request.body);
  } catch {
    return {};
  }
}

async function github(path, token, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);

  try {
    const result = await fetch(`${GITHUB_API}${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "routalk-pilot",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const data = await result.json().catch(() => ({}));
    return {
      ok: result.ok,
      status: result.status,
      data,
      acceptedPermissions:
        result.headers.get("x-accepted-github-permissions") || "",
      oauthScopes: result.headers.get("x-oauth-scopes") || "",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      timedOut: error?.name === "AbortError",
      data: {},
      acceptedPermissions: "",
      oauthScopes: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyCreateFailure(result) {
  const githubMessage = String(result.data?.message || "").trim();

  if (result.timedOut) {
    return {
      httpStatus: 504,
      code: "GITHUB_TIMEOUT",
      error: "GitHub did not respond before Pilot's project-creation timeout.",
    };
  }

  if (result.status === 401) {
    return {
      httpStatus: 502,
      code: "GITHUB_CREDENTIAL_REJECTED",
      error:
        "GitHub rejected Pilot's project-creation credential. The credential must be repaired before Pilot can create projects.",
    };
  }

  if (result.status === 403) {
    return {
      httpStatus: 409,
      code: "GITHUB_REPOSITORY_CREATE_PERMISSION_REQUIRED",
      error:
        "Pilot reached GitHub, but its GitHub credential is not allowed to create this repository. Project creation requires repository Administration: write permission (or an equivalent classic-token repo scope).",
    };
  }

  if (result.status === 422) {
    const alreadyExists =
      Array.isArray(result.data?.errors) &&
      result.data.errors.some((item) =>
        String(item?.message || "").toLowerCase().includes("already exists"),
      );

    if (alreadyExists) {
      return {
        httpStatus: 409,
        code: "REPOSITORY_ALREADY_EXISTS",
        error: "A repository with that name already exists.",
      };
    }

    return {
      httpStatus: 400,
      code: "GITHUB_REPOSITORY_VALIDATION_FAILED",
      error: githubMessage
        ? `GitHub rejected the repository settings: ${githubMessage}`
        : "GitHub rejected the repository settings.",
    };
  }

  return {
    httpStatus: 502,
    code: "GITHUB_REPOSITORY_CREATE_FAILED",
    error: githubMessage
      ? `GitHub did not create the project repository: ${githubMessage}`
      : "GitHub did not create the project repository.",
  };
}

function renderProjects(projects) {
  const lines = ["module.exports = Object.freeze({"];

  for (const [repository, project] of Object.entries(projects)) {
    lines.push(`  ${JSON.stringify(repository)}: Object.freeze({`);
    lines.push(`    role: ${JSON.stringify(project.role)},`);

    if (project.production_verifier) {
      lines.push("    production_verifier: Object.freeze({");
      lines.push(
        `      url: ${JSON.stringify(project.production_verifier.url)},`,
      );
      lines.push(
        `      auth: ${JSON.stringify(project.production_verifier.auth)},`,
      );
      lines.push("    }),");
    }

    lines.push("  }),");
  }

  lines.push("});", "");
  return lines.join("\n");
}

function buildRegistrationPackage(repository, requestId) {
  if (PROJECTS[repository]) return null;

  const projects = {
    ...PROJECTS,
    [repository]: Object.freeze({ role: "target" }),
  };

  const suffix = crypto
    .createHash("sha256")
    .update(`${repository}:${requestId}`)
    .digest("hex")
    .slice(0, 12);

  const projectName = repository.split("/")[1]
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .slice(0, 56);

  return {
    version: 1,
    command_id: `PILOT-REGISTER-${suffix}`,
    action: "apply",
    repository: CONTROL_REPOSITORY,
    branch: `chatgpt/register-${projectName}-${suffix}`,
    files: [
      {
        path: "config/projects.js",
        content_b64: Buffer.from(renderProjects(projects)).toString("base64"),
      },
    ],
    commit_message: `Register ${repository} as a Pilot target`,
    pr_title: `Onboarding: register ${projectName}`,
    pr_body:
      "Pilot-created project registration. This adds the repository as a target through the normal guarded Pilot queue and explicit merge-approval path. Production verification remains intentionally unconfigured so readiness can identify that as a separate onboarding requirement.",
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
  const githubToken =
    process.env.PILOT_TARGET_GITHUB_TOKEN ||
    process.env.PILOT_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN;

  if (!triggerSecret || !githubToken) {
    return send(response, 503, requestId, {
      error: "Pilot project creation is not configured",
      code: "PROJECT_CREATION_NOT_CONFIGURED",
    });
  }

  const authorization = request.headers.authorization || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!safeEqual(supplied, triggerSecret)) {
    return send(response, 401, requestId, { error: "Unauthorized" });
  }

  const body = readBody(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!validProjectName(name)) {
    return send(response, 400, requestId, {
      error:
        "Project name must be 1–100 characters using only letters, numbers, dot, dash, or underscore.",
      code: "INVALID_PROJECT_NAME",
    });
  }

  let description;
  try {
    description = normalizeDescription(body.description);
  } catch (error) {
    return send(response, 400, requestId, {
      error: error.message,
      code: "INVALID_PROJECT_DESCRIPTION",
    });
  }

  const expectedOwner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";

  const identity = await github("/user", githubToken);
  if (!identity.ok) {
    return send(response, identity.timedOut ? 504 : 502, requestId, {
      error: "Pilot could not verify its GitHub identity before project creation.",
      code: "GITHUB_IDENTITY_CHECK_FAILED",
      github_status: identity.status || null,
    });
  }

  const actualOwner = String(identity.data?.login || "");
  if (
    !actualOwner ||
    actualOwner.toLowerCase() !== expectedOwner.toLowerCase()
  ) {
    return send(response, 403, requestId, {
      error:
        "Pilot refused project creation because the GitHub owner does not match its configured owner.",
      code: "GITHUB_OWNER_MISMATCH",
    });
  }

  const created = await github("/user/repos", githubToken, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      private: true,
      auto_init: true,
      has_issues: true,
      has_projects: false,
      has_wiki: false,
    }),
  });

  if (!created.ok) {
    const failure = classifyCreateFailure(created);

    return send(response, failure.httpStatus, requestId, {
      error: failure.error,
      code: failure.code,
      github_status: created.status || null,
      github_message: String(created.data?.message || "").trim() || null,
      accepted_permissions: created.acceptedPermissions || null,
      oauth_scopes: created.oauthScopes || null,
      next_action:
        failure.code === "GITHUB_REPOSITORY_CREATE_PERMISSION_REQUIRED"
          ? "REPAIR_GITHUB_PROJECT_CREATION_PERMISSION"
          : "RETRY_AFTER_DIAGNOSIS",
    });
  }

  const fullName = String(created.data?.full_name || `${actualOwner}/${name}`);
  const htmlUrl = String(
    created.data?.html_url || `https://github.com/${fullName}`,
  );
  const registrationPackage = buildRegistrationPackage(fullName, requestId);

  return send(response, 201, requestId, {
    created: true,
    repository: fullName,
    url: htmlUrl,
    visibility: "private",
    initialized: true,
    default_branch: created.data?.default_branch || "main",
    registration_required: Boolean(registrationPackage),
    registration_package: registrationPackage,
    next_action: registrationPackage
      ? "REVIEW_PROJECT_REGISTRATION"
      : "RUN_PILOT_ONBOARDING",
  });
};

module.exports._test = {
  buildRegistrationPackage,
  classifyCreateFailure,
  normalizeDescription,
  renderProjects,
  validProjectName,
};
