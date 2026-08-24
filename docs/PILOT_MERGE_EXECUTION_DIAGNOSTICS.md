# Merge Execution Reliability and Diagnostics

The save-point audit after PR #62 found an important distinction: Pilot can pass its own preflight gates and still receive a denial from GitHub's actual merge endpoint.

Previously Pilot collapsed that into the unhelpful message `GitHub did not merge the pull request`, which made repeated debugging guesswork.

This change hardens the actual merge-execution stage:

- retries transient GitHub 405/409 merge denials up to four times;
- re-reads the PR between retries;
- refuses to continue if the head SHA changes;
- recognizes when another actor completed the merge during confirmation;
- returns a safe structured denial containing GitHub's HTTP status and message when it still fails.

No token, authorization header, or credential is returned.

This separates four distinct boundaries cleanly: mergeability, checks, immutable head SHA, and GitHub's final merge authorization/execution decision.
