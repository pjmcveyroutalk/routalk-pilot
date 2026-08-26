const LAST_COMMAND_KEY = "pilot:last-command-id";

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

// Pilot's main page already displays result.error from /api/merge.
// Enrich only that response so the phone sees the exact blocker returned
// by the protected merge API without changing any merge/check behavior.
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
      error: `${body.error || "Pull request checks blocked the merge"}\n${diagnosticText}`,
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
