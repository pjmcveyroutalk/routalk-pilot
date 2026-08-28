const LAST_COMMAND_KEY = "pilot:last-command-id";
const PENDING_PACKAGE_KEY = "routalk-pilot.pending-package.v2";
const DEFAULT_TARGET_REPOSITORY = "pjmcveyroutalk/routalk-pilot";

try {
  localStorage.removeItem(PENDING_PACKAGE_KEY);
} catch {
  // Best-effort cleanup only.
}

function rememberCommandId(commandId) {
  if (
    typeof commandId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(commandId)
  ) {
    localStorage.setItem(LAST_COMMAND_KEY, commandId);
    return true;
  }
  return false;
}

function readLastCommandId() {
  const value = localStorage.getItem(LAST_COMMAND_KEY);
  return value && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)
    ? value
    : null;
}

function clearLastCommandId() {
  localStorage.removeItem(LAST_COMMAND_KEY);
}

function resumeUrl(commandId = readLastCommandId()) {
  return commandId
    ? `/resume.html?command_id=${encodeURIComponent(commandId)}`
    : "/resume.html";
}

function formatMergeDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") return "";

  const parts = [];

  for (const check of diagnostics.failing_check_runs || []) {
    parts.push(
      `Check failed: ${check.name || "unnamed check"}${check.app ? ` (${check.app})` : ""} — ${check.conclusion || check.status || "failed"}`,
    );
  }

  for (const status of diagnostics.failing_commit_statuses || []) {
    parts.push(
      `Status failed: ${status.context || "unnamed status"} — ${status.state || "failure"}${status.description ? `: ${status.description}` : ""}`,
    );
  }

  for (const check of diagnostics.pending_check_runs || []) {
    parts.push(
      `Check pending: ${check.name || "unnamed check"}${check.app ? ` (${check.app})` : ""} — ${check.status || "pending"}`,
    );
  }

  for (const status of diagnostics.pending_commit_statuses || []) {
    parts.push(
      `Status pending: ${status.context || "unnamed status"}${status.description ? `: ${status.description}` : ""}`,
    );
  }

  return parts.join("\n");
}

function validRepository(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value)
  );
}

function showPackageRepository(repository) {
  const summary = document.querySelector("#package-summary");
  if (!summary) return;

  for (const term of summary.querySelectorAll("dt")) {
    if (term.textContent === "Repository") {
      const detail = term.nextElementSibling;
      if (detail) detail.textContent = repository;
      return;
    }
  }

  const term = document.createElement("dt");
  term.textContent = "Repository";

  const detail = document.createElement("dd");
  detail.textContent = repository;
  detail.style.fontWeight = "900";

  summary.prepend(detail);
  summary.prepend(term);
}

function installImportReset() {
  const button = document.querySelector("#package-file-button");
  const input = document.querySelector("#package-file");
  const review = document.querySelector("#package-review");
  const summary = document.querySelector("#package-summary");
  const submit = document.querySelector("#package-submit-button");
  const status = document.querySelector("#status");

  if (!button || !input) return;

  button.addEventListener(
    "click",
    () => {
      try {
        localStorage.removeItem(PENDING_PACKAGE_KEY);
      } catch {
        // Best-effort cleanup only.
      }

      input.value = "";

      if (review) review.hidden = true;
      if (summary) summary.replaceChildren();
      if (submit) submit.disabled = true;

      if (status) {
        status.textContent = "Choose a new build package.";
        status.dataset.state = "";
      }
    },
    true,
  );

  input.addEventListener("change", () => {
    if (!input.files?.[0]) return;

    setTimeout(() => {
      if (submit) submit.disabled = false;
    }, 0);
  });
}

function installPackageTargetVisibility() {
  const input = document.querySelector("#package-file");
  if (!input) return;

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const value = JSON.parse(await file.text());

      const repository =
        value.repository == null || value.repository === ""
          ? DEFAULT_TARGET_REPOSITORY
          : value.repository;

      if (!validRepository(repository)) return;

      setTimeout(() => {
        const review = document.querySelector("#package-review");

        if (review && !review.hidden) {
          showPackageRepository(repository);
        }
      }, 0);
    } catch {
      // Main package validation owns error handling.
    }
  });
}

function installPilotHelpers() {
  installImportReset();
  installPackageTargetVisibility();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installPilotHelpers, {
    once: true,
  });
} else {
  installPilotHelpers();
}

const originalFetch = window.fetch.bind(window);

window.fetch = async function pilotDiagnosticFetch(input, init) {
  const response = await originalFetch(input, init);

  const requestUrl =
    typeof input === "string"
      ? input
      : input && typeof input.url === "string"
        ? input.url
        : "";

  if (!requestUrl.includes("/api/merge") || response.ok) {
    return response;
  }

  try {
    const cloned = response.clone();
    const body = await cloned.json();
    const diagnosticText = formatMergeDiagnostics(body.check_diagnostics);

    if (!diagnosticText) return response;

    const enriched = {
      ...body,
      error: `${
        body.error || "Pull request checks blocked the merge"
      }\n${diagnosticText}`,
    };

    return new Response(JSON.stringify(enriched), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return response;
  }
};

window.PilotRecovery = Object.freeze({
  rememberCommandId,
  readLastCommandId,
  clearLastCommandId,
  resumeUrl,
  formatMergeDiagnostics,
});

const mergeTapLocks = new WeakSet();

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest?.(".merge-button");
    if (!button) return;

    if (mergeTapLocks.has(button)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    mergeTapLocks.add(button);
    setTimeout(() => mergeTapLocks.delete(button), 1500);
  },
  true,
);
