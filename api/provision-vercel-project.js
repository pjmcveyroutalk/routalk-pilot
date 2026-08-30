const crypto = require("node:crypto");
const projects = require("../config/projects");

const VERCEL_API = "https://api.vercel.com";
const VERCEL_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 4_000;

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
  try {
    return JSON.parse(request.body);
  } catch {
    return {};
  }
}

function validRepository(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
  );
}

async function vercel(path, token, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERCEL_TIMEOUT_MS);

  try {
    const result = await fetch(`${VERCEL_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
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

function classifyFailure(result) {
  const message = String(
    result.data?.error?.message ||
    result.data?.message ||
    "",
  ).trim();

  if (result.timedOut) {
    return {
      status: 504,
      code: "VERCEL_TIMEOUT",
      error: "Vercel did not respond before Pilot's provisioning timeout.",
    };
  }

  if (result.status === 401 || result.status === 403) {
    return {
      status: 409,
      code: "VERCEL_CREDENTIAL_REQUIRED",
      error:
        "Pilot reached Vercel, but its Vercel management credential is missing, expired, or not authorized for the configured team.",
    };
  }

  if (message.toLowerCase().includes("install") &&
      message.toLowerCase().includes("github")) {
    return {
      status: 409,
      code: "VERCEL_GITHUB_INTEGRATION_REQUIRED",
      error:
        "Vercel cannot link this private GitHub repository until the Vercel GitHub integration has access to it.",
    };
  }

  if (result.status === 409) {
    return {
      status: 409,
      code: "VERCEL_PROJECT_CONFLICT",
      error: message || "A Vercel project with this name already exists.",
    };
  }

  return {
    status: 502,
    code: "VERCEL_PROJECT_CREATE_FAILED",
    error: message
      ? `Vercel did not create the deployment project: ${message}`
      : "Vercel did not create the deployment project.",
  };
}

function selectProductionDomain(data) {
  const domains = Array.isArray(data?.domains) ? data.domains : [];
  const candidates = domains
    .filter((item) =>
      item &&
      typeof item.name === "string" &&
      item.name.trim() &&
      item.verified !== false &&
      !item.redirect
    )
    .map((item) => ({
      name: item.name.trim().toLowerCase(),
      production: item.gitBranch == null && item.customEnvironmentId == null,
    }));

  const selected =
    candidates.find((item) => item.production) ||
    candidates[0] ||
    null;

  return selected ? `https://${selected.name}` : null;
}

async function productionUrlForProject(projectIdOrName, token, teamId) {
  const domains = await vercel(
    `/v9/projects/${encodeURIComponent(projectIdOrName)}/domains?production=true&teamId=${encodeURIComponent(teamId)}`,
    token,
  );

  if (!domains.ok) {
    return {
      ok: false,
      status: domains.status,
      timedOut: domains.timedOut,
      data: domains.data,
    };
  }

  const url = selectProductionDomain(domains.data);
  return {
    ok: Boolean(url),
    status: domains.status,
    url,
    data: domains.data,
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
  const vercelToken =
    process.env.PILOT_VERCEL_TOKEN ||
    process.env.VERCEL_TOKEN ||
    "";
  const teamId =
    process.env.PILOT_VERCEL_TEAM_ID ||
    "team_jC9jlJ9GZ9GSjrbYoD0pin3U";

  if (!triggerSecret) {
    return send(response, 503, requestId, {
      error: "Pilot trigger authentication is not configured.",
      code: "PILOT_TRIGGER_NOT_CONFIGURED",
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
  const repository =
    typeof body.repository === "string" ? body.repository.trim() : "";

  if (!validRepository(repository)) {
    return send(response, 400, requestId, {
      error: "Repository must use owner/name format.",
      code: "INVALID_REPOSITORY",
    });
  }

  const project = projects[repository];
  if (!project || project.role !== "target") {
    return send(response, 409, requestId, {
      error: "Pilot refused deployment provisioning because this repository is not a registered target.",
      code: "PROJECT_NOT_REGISTERED",
      next_action: "REGISTER_PROJECT",
    });
  }

  if (!vercelToken) {
    return send(response, 409, requestId, {
      error:
        "Pilot needs a one-time Vercel management credential before it can create deployment projects.",
      code: "VERCEL_CREDENTIAL_REQUIRED",
      next_action: "CONFIGURE_PILOT_VERCEL_TOKEN",
    });
  }

  const name = repository.split("/")[1].toLowerCase();

  const existing = await vercel(
    `/v9/projects/${encodeURIComponent(name)}?teamId=${encodeURIComponent(teamId)}`,
    vercelToken,
  );

  if (existing.ok) {
    const projectId = existing.data?.id || name;
    const production = await productionUrlForProject(projectId, vercelToken, teamId);

    if (!production.ok) {
      return send(response, 409, requestId, {
        error:
          "Vercel project exists, but Pilot could not resolve an authoritative production domain yet.",
        code: "VERCEL_PRODUCTION_DOMAIN_NOT_READY",
        vercel_status: production.status || null,
        next_action: "WAIT_FOR_PRODUCTION_DOMAIN",
      });
    }

    return send(response, 200, requestId, {
      created: false,
      already_exists: true,
      repository,
      project: {
        id: existing.data?.id || null,
        name: existing.data?.name || name,
      },
      production_url: production.url,
      expected_production_url: production.url,
      next_action: "WAIT_FOR_PRODUCTION_DEPLOYMENT",
    });
  }

  if (existing.status !== 404) {
    const failure = classifyFailure(existing);
    return send(response, failure.status, requestId, {
      error: failure.error,
      code: failure.code,
      vercel_status: existing.status || null,
      next_action:
        failure.code === "VERCEL_CREDENTIAL_REQUIRED"
          ? "CONFIGURE_PILOT_VERCEL_TOKEN"
          : "RETRY_AFTER_DIAGNOSIS",
    });
  }

  const created = await vercel(
    `/v11/projects?teamId=${encodeURIComponent(teamId)}`,
    vercelToken,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        gitRepository: {
          type: "github",
          repo: repository,
        },
      }),
    },
  );

  if (!created.ok) {
    const failure = classifyFailure(created);
    return send(response, failure.status, requestId, {
      error: failure.error,
      code: failure.code,
      vercel_status: created.status || null,
      next_action:
        failure.code === "VERCEL_CREDENTIAL_REQUIRED"
          ? "CONFIGURE_PILOT_VERCEL_TOKEN"
          : failure.code === "VERCEL_GITHUB_INTEGRATION_REQUIRED"
            ? "REPAIR_VERCEL_GITHUB_REPOSITORY_ACCESS"
            : "RETRY_AFTER_DIAGNOSIS",
    });
  }

  const projectId = created.data?.id || name;
  const production = await productionUrlForProject(projectId, vercelToken, teamId);

  if (!production.ok) {
    return send(response, 201, requestId, {
      created: true,
      repository,
      project: {
        id: created.data?.id || null,
        name: created.data?.name || name,
      },
      production_url: null,
      expected_production_url: null,
      production_domain_pending: true,
      next_action: "WAIT_FOR_PRODUCTION_DOMAIN",
    });
  }

  return send(response, 201, requestId, {
    created: true,
    repository,
    project: {
      id: created.data?.id || null,
      name: created.data?.name || name,
    },
    production_url: production.url,
    expected_production_url: production.url,
    next_action: "WAIT_FOR_PRODUCTION_DEPLOYMENT",
  });
};

module.exports._test = {
  classifyFailure,
  validRepository,
  selectProductionDomain,
};
