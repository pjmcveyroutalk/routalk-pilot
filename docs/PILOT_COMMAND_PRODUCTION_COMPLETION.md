# Command Production Completion

Pilot command recovery now distinguishes a Git merge from a verified live result.

For a merged pull request, `/api/command` invokes Pilot's authenticated provider-neutral `/api/verify-production` boundary. The command remains `MERGED` until the live Pilot application passes that verification, then advances to `COMPLETED`.

The mobile recovery surface displays the production verification result and automatically keeps checking while the command is `MERGED`.

This deliberately preserves provider independence: command completion depends on the application being verifiably live, not on a Vercel-specific deployment record.
