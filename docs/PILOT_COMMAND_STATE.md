# Pilot Command State Foundation

This module establishes Pilot-owned command lifecycle semantics without replacing the proven transport yet.

## Why this exists

The phone remains the control surface. Pilot needs a stable internal model for command state so storage and execution providers can change without changing the mobile experience.

The current GitHub Issue queue remains a working transport/fallback. It is not the long-term authoritative product database.

## Lifecycle

RECEIVED → VALIDATED → QUEUED → DISPATCHING/RUNNING → AWAITING_APPROVAL → MERGED/COMPLETED

Any non-terminal state may fail only where explicitly allowed by the transition table. Terminal records cannot be reopened by accident.

## Adapter boundary

`createCommandStoreAdapter()` defines the minimum storage contract:

- `findByCommandId(commandId)` for idempotency
- `persist(command, encryptedEnvelope)` for durable storage

A GitHub-backed adapter can satisfy this today. A Pilot database/queue adapter can replace it later without changing command validation or lifecycle semantics.

## Compatibility

This foundation intentionally changes no existing API behavior on its own. It is the safe seam for the next wiring step into `/api/queue` and `/api/status`.
