# qnfo-containers-pilot v0.2.0

Cloudflare Containers executor -- Docker-free Python execution + workspace FS, audit-logged.
Fleet reference for cloud-native Python (no local Docker; public registry image reference).

## Capabilities (Bearer PILOT_TOKEN, fail-closed)

| Route | Method | Auth | Effect |
|-------|--------|------|--------|
| /health | GET | none | static liveness (no container start) |
| /version | GET | PILOT_TOKEN | `python --version` via exec() (logged) |
| /status | GET | PILOT_TOKEN | `container.running` (scale-to-zero probe) |
| /exec | POST | PILOT_TOKEN | run `python -c <body.code>`, return stdout/stderr/exitCode (logged) |
| /workspace/write | POST | PILOT_TOKEN | write file under /workspace (base64 body.content, logged) |
| /workspace/read | POST | PILOT_TOKEN | read file under /workspace (base64, logged) |

## v0.2.0 changes (commit 8e87c14, 2026-09-06)
- AUDIT D1 binding -> qnfo-audit.cloud_ops_events; every exec/version/workspace op logged (kind container.*).
- /workspace/write + /workspace/read (register row 94 executor-side e2e: write then read back).
- Output caps: MAX_CODE 40000, MAX_OUT 60000 with truncated flags; path-traversal guard (rejects ..).
- FAILURE MODE (known): python:3.12-slim image has NO git/node; use docker.io/nikolaik/python-nodejs:python3.12-nodejs22-slim (verified on Docker Hub 2026-09-06, amd64+arm64, 207 MB) for repo tooling (rows 92/96 owner qnfo-code-agent).

## Deploy
- `cd qnfo-workers/qnfo-containers-pilot && wrangler deploy` (image = docker.io/library/python:3.12-slim, no Docker build)
- Secret: `wrangler secret put PILOT_TOKEN`
- Canonical source: QNFO/qnfo-workers/qnfo-containers-pilot

## Notes
- Container: lite (1/16 vCPU, 256 MiB, 2 GB), max 3 concurrent; firecracker runtime.
- Main process `python -m http.server 8080` keeps container alive for exec() and exposes :8080.
- Scale-to-zero: charges stop after idle sleep; /status reports container.running.
