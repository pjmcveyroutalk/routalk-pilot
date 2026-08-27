# Git deployment observation — maintainability correction

This replaces the accidentally minified `api/command.js` introduced by PR #162 with a readable structured implementation.

Behavior is intentionally preserved:
- observe the exact merged SHA through GitHub combined commit status;
- expose `deployment_observation`;
- require successful Vercel Git deployment plus exact production revision verification before `COMPLETED`;
- keep the blocked Vercel REST/PAT path untouched.

No new feature or provider layer is introduced.
