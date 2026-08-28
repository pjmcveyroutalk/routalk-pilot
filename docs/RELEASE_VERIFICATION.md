# Routalk Pilot Release Verification

## Completion contract
A command is `COMPLETED` only when all three facts are true:
1. the intended PR is merged;
2. the exact merged revision has successful deployment evidence;
3. production verification reports healthy and proves the exact expected revision is live.

Otherwise a merged command remains `MERGED` unless an authoritative failure condition applies. Closed-unmerged PRs are `FAILED`.

Deployment observation accepts only deployment-like statuses with a nonempty context and valid HTTPS target URL. Generic repository statuses do not prove deployment.

External targets must expose an authenticated production verification contract that checks live application health and compares the expected revision to one explicit production revision source.

Verified external E2E baseline (2026-08-28): `pjmcveyroutalk/sport-my-fitness` completed the package -> PR -> merge -> deployment -> exact production revision verification lifecycle. Latest verified E2E merge at checkpoint: `7bbdaf87fb0aa86810928f28037bd1806b197d04`.
