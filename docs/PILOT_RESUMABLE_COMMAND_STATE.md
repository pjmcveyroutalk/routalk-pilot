# Resumable Command Lookup

`GET /api/command?command_id=...` gives Pilot a stable, authenticated way to recover command state after the phone browser session disappears.

For the current compatibility phase, the endpoint reconstructs lifecycle state from the GitHub Issue storage adapter and the PR created for that command:

- open queue record → `QUEUED`
- processed record + open PR → `AWAITING_APPROVAL`
- processed record + merged PR → `MERGED`
- processed record without an active PR → `COMPLETED`

The API exposes Pilot lifecycle terms rather than forcing the mobile client to understand GitHub Issue/PR semantics.

This is intentionally a migration seam. When a Pilot-owned database/queue becomes authoritative, the endpoint can read that store without changing the phone-facing contract.
