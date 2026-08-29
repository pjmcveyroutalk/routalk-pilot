const crypto = require("node:crypto");

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 4_000;

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
    });
  }

  let description;
  try {
    description = normalizeDescription(body.description);
  } catch (error) {
    return send(response, 400, requestId, { error: error.message });
  }

  const expectedOwner =
    process.env.PILOT_GITHUB_OWNER ||
    "pjmcveyroutalk";

  const identity = await github("/user", githubToken);
  if (!identity.ok) {
    return send(response, identity.timedOut ? 504 : 502, requestId, {
      error: "Pilot could not verify its GitHub identity before project creation.",
    });
  }

  const actualOwner = String(identity.data?.login || "");
  if (
    !actualOwner ||
    actualOwner.toLowerCase() !== expectedOwner.toLowerCase()
  ) {
    return send(response, 403, requestId, {
      error: "Pilot refused project creation because the GitHub owner does not match its configured owner.",
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
    const alreadyExists =
      created.status === 422 &&
      Array.isArray(created.data?.errors) &&
      created.data.errors.some((item) =>
        String(item?.message || "").toLowerCase().includes("already exists"),
      );

    return send(
      response,
      alreadyExists ? 409 : created.timedOut ? 504 : 502,
      requestId,
      {
        error: alreadyExists
          ? "A repository with that name already exists."
          : "GitHub did not create the project repository.",
        github_status: created.status || null,
      },
    );
  }

  const fullName = String(created.data?.full_name || `${actualOwner}/${name}`);
  const htmlUrl = String(
    created.data?.html_url || `https://github.com/${fullName}`,
  );

  return send(response, 201, requestId, {
    created: true,
    repository: fullName,
    url: htmlUrl,
    visibility: "private",
    initialized: true,
    default_branch: created.data?.default_branch || "main",
    next_action: "RUN_PILOT_ONBOARDING",
  });
};

module.exports._test = {
  normalizeDescription,
  validProjectName,
};
