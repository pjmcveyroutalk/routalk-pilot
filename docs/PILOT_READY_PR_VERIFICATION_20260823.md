# Routalk Pilot Ready-PR Verification

Date: August 23, 2026

## Purpose

Verify the hardened phone-native control loop after the workflow upgrade.

## Expected evidence

- GitHub Actions uses actions/checkout@v6.
- The bridge creates a ready pull request, not a draft.
- Pilot displays the new pull request on mobile.
- Protected mobile merge validates checks before merging.
- The merged chatgpt/* branch is deleted automatically.
- Vercel completes the production deployment.
- The final result is recorded in the Pilot audit trail.

This file contains no credentials or customer data.
