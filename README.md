# Routalk Pilot

Routalk Pilot is a phone-first software build, approval, deployment, and production-verification control system.

## Canonical operator flow
Phone -> import reviewed `.pilot` package -> submit -> Pilot creates isolated `chatgpt/*` PR -> approve/merge -> deployment observation -> exact production revision verification -> complete.

## Canonical architecture
See `docs/ARCHITECTURE.md`, `docs/COMMAND_CONTRACT.md`, `docs/OPERATIONS.md`, and `docs/RELEASE_VERIFICATION.md`. Historical proof and diagnostic files are not active architecture unless one of those documents explicitly references them.

Status: stabilization/hygiene after the verified external-repository E2E lifecycle.
