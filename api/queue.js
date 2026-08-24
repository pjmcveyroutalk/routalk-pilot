const crypto = require("node:crypto");
const {
  COMMAND_STATES,
  createCommandStoreAdapter,
  transitionCommandRecord,
} = require("../lib/command-state");
const {
  createGithubIssueCommandStore,
} = require("../lib/stores/github-issue-command-store");

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 100_000;
const MAX_FILES = 20;
const MAX_FILE_BYTES = 32_000;
const MAX_TOTAL_FILE_BYTES = 32_000;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
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

function validRepositoryPart(value) {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(value || "");
}

function validWorkflow(value) {
  return /^[A-Za-z0-9_.-]{1,100}\.ya?ml$/.test(value || "");
}

function validCommandId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value || "");
}

function validBranch(value) {
  return (
    /^chatgpt\/[A-Za-z0-9._/-]{1,120}$/.test(value || "") &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.endsWith("/")
  );
}

function validTarget(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240) {
    return false;
  }
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  const lowered = normalized.toLowerCase();
  return (
    !normalized.startsWith("/") &&
    !parts.includes("") &&
    !parts.includes(".") &&
    !parts.includes("..") &&
    !lowered.startsWith(".git/") &&
    lowered !== ".git" &&
    !lowered.startsWith(".github/workflows/")
  );
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

function validateText(value, field, maxLength, required = false) {
  if (value == null || value === "") {
    if (required) throw new Error(`${field} is required`);
    return "";
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function normalizeCommand(body) {
  const commandId = validateText(body.command_id, "command_id", 80, true);
  if (!validCommandId(commandId)) throw new Error("command_id is invalid");

  const action = validateText(body.action, "action", 16, true).toLowerCase();
  if (!new Set(["apply", "merge"]).has(action)) {
    throw new Error("action must be apply or merge");
  }

  if (action === "merge") {
    const prNumber = Number(body.pr_number);
    if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
      throw new Error("pr_number is invalid");
    }
    return { version: 1, command_id: commandId, action, pr_number: prNumber };
  }

  const branch = validateText(body.branch, "branch", 128, true);
  if (!validBranch(branch)) throw new Error("branch is invalid");

  if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > MAX_FILES) {
    throw new Error(`files must contain 1 to ${MAX_FILES} entries`);
  }

  const seenTargets = new Set();
  let totalBytes = 0;
  const files = body.files.map((file, index) => {
    if (!file || typeof file !== "object") {
      throw new Error(`files[${index}] is invalid`);
    }

    const path = validateText(file.path, `files[${index}].path`, 240, true)
      .replaceAll("\\", "/");
    if (!validTarget(path)) throw new Error(`files[${index}].path is unsafe`);
    if (seenTargets.has(path)) throw new Error(`duplicate target path: ${path}`);
    seenTargets.add(path);

    const contentBase64 = validateText(
      file.content_b64,
      `files[${index}].content_b64`,
      Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8,
      true,
    );
    const content = Buffer.from(contentBase64, "base64");
    if (content.length > MAX_FILE_BYTES || content.toString("base64") !== contentBase64) {
      throw new Error(`files[${index}].content_b64 is invalid or too large`);
    }
    totalBytes += content.length;
    return { path, content_b64: contentBase64 };
  });

  if (totalBytes > MAX_TOTAL_FILE_BYTES) {
    throw new Error("combined file payload is too large");
  }

  return {
    version: 1,
    command_id: commandId,
    action,
    branch,
    files,
    commit_message: validateText(body.commit_message, "commit_message", 200),
    pr_title: validateText(body.pr_title, "pr_title", 200),
    pr_body: validateText(body.pr_body, "pr_body", 8_000),
  };
}

function encryptCommand(command, secret) {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(command));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: 1,
    algorithm: "A256GCM",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "routalk-pilot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function github(url, token, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    const result = await fetch(url, {
      ...options,
      headers: { ...githubHeaders(token), ...(options.headers || {}) },
      signal: controller.signal,
    });
    const data = await result.json().catch(() => ({}));
    return { ok: result.ok, status: result.status, data };
  } catch (error) {
    return { ok: false, status: 0, timedOut: error?.name === "AbortError" };
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
  const queueSecret = process.env.PILOT_QUEUE_SECRET;
  const githubToken = process.env.PILOT_GITHUB_TOKEN;
  if (!triggerSecret || !queueSecret || !githubToken) {
    return send(response, 503, requestId, { error: "Pilot queue is not configured" });
  }

  const authorization = request.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!safeEqual(suppliedSecret, triggerSecret)) {
    return send(response, 401, requestId, { error: "Unauthorized" });
  }

  let command;
  try {
    command = normalizeCommand(readBody(request));
  } catch (error) {
    return send(response, 400, requestId, {
      error: error.message || "Invalid command",
    });
  }

  const owner = process.env.PILOT_GITHUB_OWNER || "pjmcveyroutalk";
  const repository = process.env.PILOT_GITHUB_REPO || "routalk-pilot";
  const workflow =
    process.env.PILOT_GITHUB_WORKFLOW || "routalk-pilot-bridge.yml";
  const mainRef = process.env.PILOT_GITHUB_REF || "main";
  if (
    !validRepositoryPart(owner) ||
    !validRepositoryPart(repository) ||
    !validWorkflow(workflow)
  ) {
    return send(response, 503, requestId, {
      error: "Pilot queue configuration is invalid",
    });
  }

  const baseUrl = `${GITHUB_API}/repos/${owner}/${repository}`;
  const envelope = encryptCommand(command, queueSecret);
  const githubStore = createGithubIssueCommandStore({
    baseUrl,
    githubToken,
    githubRequest: github,
  });
  const store = createCommandStoreAdapter(githubStore);

  let commandRecord;
  try {
    commandRecord = await store.enqueue(command, envelope);
  } catch (error) {
    if (error.code === "DUPLICATE_COMMAND") {
      return send(response, 409, requestId, { error: error.message });
    }
    if (error.code === "PAYLOAD_TOO_LARGE") {
      return send(response, 413, requestId, { error: error.message });
    }
    console.error("Pilot command storage failed", {
      requestId,
      code: error.code,
    });
    return send(response, error.timedOut ? 504 : 502, requestId, {
      error: error.message || "Pilot command could not be queued",
    });
  }

  const dispatched = await github(
    `${baseUrl}/actions/workflows/${workflow}/dispatches`,
    githubToken,
    {
      method: "POST",
      body: JSON.stringify({
        ref: mainRef,
        inputs: {
          source: "pilot_queue",
          command_id: command.command_id,
        },
      }),
    },
  );

  if (dispatched.ok) {
    commandRecord = transitionCommandRecord(
      commandRecord,
      COMMAND_STATES.DISPATCHING,
      { metadata: { dispatch_started: true } },
    );
  } else {
    console.warn("Pilot command queued; immediate dispatch failed", {
      requestId,
      status: dispatched.status,
    });
  }

  return send(response, 202, requestId, {
    accepted: true,
    command_id: command.command_id,
    queue_record: commandRecord.storage_record,
    state: commandRecord.state,
    command_record: commandRecord,
    dispatch_started: dispatched.ok,
    recovery: dispatched.ok
      ? undefined
      : "The scheduled recovery cycle will process this command",
  });
};

module.exports._test = {
  encryptCommand,
  normalizeCommand,
  validBranch,
  validCommandId,
  validTarget,
};
