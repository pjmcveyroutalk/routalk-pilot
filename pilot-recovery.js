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

window.PilotRecovery = Object.freeze({
  rememberCommandId,
  readLastCommandId,
  clearLastCommandId,
  resumeUrl,
});
