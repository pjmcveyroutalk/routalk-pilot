const COMMAND_STATES = Object.freeze({
  RECEIVED: "RECEIVED",
  VALIDATED: "VALIDATED",
  QUEUED: "QUEUED",
  DISPATCHING: "DISPATCHING",
  RUNNING: "RUNNING",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  MERGED: "MERGED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

const TERMINAL_STATES = new Set([
  COMMAND_STATES.MERGED,
  COMMAND_STATES.COMPLETED,
  COMMAND_STATES.FAILED,
]);

const TRANSITIONS = Object.freeze({
  [COMMAND_STATES.RECEIVED]: new Set([
    COMMAND_STATES.VALIDATED,
    COMMAND_STATES.FAILED,
  ]),
  [COMMAND_STATES.VALIDATED]: new Set([
    COMMAND_STATES.QUEUED,
    COMMAND_STATES.FAILED,
  ]),
  [COMMAND_STATES.QUEUED]: new Set([
    COMMAND_STATES.DISPATCHING,
    COMMAND_STATES.RUNNING,
    COMMAND_STATES.FAILED,
  ]),
  [COMMAND_STATES.DISPATCHING]: new Set([
    COMMAND_STATES.RUNNING,
    COMMAND_STATES.FAILED,
  ]),
  [COMMAND_STATES.RUNNING]: new Set([
    COMMAND_STATES.AWAITING_APPROVAL,
    COMMAND_STATES.COMPLETED,
    COMMAND_STATES.FAILED,
  ]),
  [COMMAND_STATES.AWAITING_APPROVAL]: new Set([
    COMMAND_STATES.MERGED,
    COMMAND_STATES.FAILED,
  ]),
  [COMMAND_STATES.MERGED]: new Set([COMMAND_STATES.COMPLETED]),
  [COMMAND_STATES.COMPLETED]: new Set(),
  [COMMAND_STATES.FAILED]: new Set(),
});

function isCommandState(value) {
  return Object.values(COMMAND_STATES).includes(value);
}

function createCommandRecord(command, details = {}) {
  if (!command || typeof command !== "object") {
    throw new Error("command is required");
  }
  if (typeof command.command_id !== "string" || !command.command_id) {
    throw new Error("command_id is required");
  }

  const now = details.now || new Date().toISOString();
  return Object.freeze({
    version: 1,
    command_id: command.command_id,
    action: command.action || "apply",
    state: COMMAND_STATES.RECEIVED,
    created_at: now,
    updated_at: now,
    storage: details.storage || null,
    storage_record: details.storage_record ?? null,
    metadata: Object.freeze({ ...(details.metadata || {}) }),
  });
}

function transitionCommandRecord(record, nextState, details = {}) {
  if (!record || typeof record !== "object" || !isCommandState(record.state)) {
    throw new Error("record has an invalid state");
  }
  if (!isCommandState(nextState)) {
    throw new Error(`unknown command state: ${nextState}`);
  }
  if (record.state === nextState) return record;
  if (TERMINAL_STATES.has(record.state)) {
    throw new Error(`terminal command cannot transition from ${record.state}`);
  }

  const allowed = TRANSITIONS[record.state];
  if (!allowed || !allowed.has(nextState)) {
    throw new Error(`invalid command transition: ${record.state} -> ${nextState}`);
  }

  return Object.freeze({
    ...record,
    state: nextState,
    updated_at: details.now || new Date().toISOString(),
    storage: details.storage ?? record.storage,
    storage_record: details.storage_record ?? record.storage_record,
    metadata: Object.freeze({
      ...(record.metadata || {}),
      ...(details.metadata || {}),
    }),
  });
}

function workflowToCommandState(workflow, newPullRequestCount = 0) {
  if (!workflow) return COMMAND_STATES.QUEUED;

  if (workflow.status !== "completed") {
    return COMMAND_STATES.RUNNING;
  }

  if (workflow.conclusion !== "success") {
    return COMMAND_STATES.FAILED;
  }

  if (newPullRequestCount > 0) {
    return COMMAND_STATES.AWAITING_APPROVAL;
  }

  return COMMAND_STATES.COMPLETED;
}

function createCommandStoreAdapter(adapter) {
  if (
    !adapter ||
    typeof adapter.findByCommandId !== "function" ||
    typeof adapter.persist !== "function"
  ) {
    throw new Error("command store adapter is invalid");
  }

  return Object.freeze({
    async enqueue(command, encryptedEnvelope) {
      const existing = await adapter.findByCommandId(command.command_id);
      if (existing) {
        const error = new Error("command_id is already queued");
        error.code = "DUPLICATE_COMMAND";
        throw error;
      }

      let record = createCommandRecord(command, {
        storage: adapter.name || "unknown",
      });
      record = transitionCommandRecord(record, COMMAND_STATES.VALIDATED);

      const stored = await adapter.persist(command, encryptedEnvelope);
      record = transitionCommandRecord(record, COMMAND_STATES.QUEUED, {
        storage: adapter.name || "unknown",
        storage_record: stored?.record ?? null,
        metadata: stored?.metadata || {},
      });

      return record;
    },
  });
}

module.exports = {
  COMMAND_STATES,
  TERMINAL_STATES,
  TRANSITIONS,
  createCommandRecord,
  transitionCommandRecord,
  workflowToCommandState,
  createCommandStoreAdapter,
  isCommandState,
};
