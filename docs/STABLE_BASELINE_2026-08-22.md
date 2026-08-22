# Routalk Pilot stable baseline — 2026-08-22

## Confirmed working path

1. Commands are read from the isolated Routalk Pilot Google Sheet queue.
2. The GitHub Actions workflow validates commands and creates draft pull requests.
3. The mobile Run Now page authenticates through a server-only Vercel secret.
4. The Vercel API dispatches the GitHub Actions workflow immediately.
5. Workflow-dispatch run #7 completed successfully in 13 seconds.
6. Scheduled workflow runs remain available as a fallback.

## Production components

- Repository: `pjmcveyroutalk/routalk-pilot`
- Default branch: `main`
- Workflow: `.github/workflows/routalk-pilot-bridge.yml`
- Mobile page: `index.html`
- Dispatch endpoint: `api/dispatch.js`
- Production domain: `routalk-pilot-2djn.vercel.app`

## Security boundaries

- `PILOT_TRIGGER_SECRET` authenticates the mobile Run Now request.
- `PILOT_GITHUB_TOKEN` is server-only and dispatches the workflow.
- Neither secret belongs in Git, the command queue, screenshots, or chat.
- The bridge blocks workflow-file edits and repository path traversal.
- Apply commands are restricted to `chatgpt/*` branches.
- Merge commands are restricted to pull requests targeting `main` from `chatgpt/*` branches.

## Recovery order

1. Confirm the Vercel production deployment is Ready.
2. Confirm both required Vercel variables exist in Production.
3. Test Run Now and inspect `/api/dispatch` runtime logs on failure.
4. Confirm GitHub Actions can create pull requests.
5. Confirm the queue is publicly readable but not publicly editable.
6. Use scheduled runs as the fallback if instant dispatch is unavailable.

## Release gate before Xin

- Repeat instant dispatch successfully.
- Create, review, merge, and clean up a harmless test pull request.
- Confirm password-manager autofill works on the mobile page.
- Confirm no secrets appear in repository history, queue data, logs, or screenshots.
