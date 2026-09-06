# qnfo-containers-pilot

Cloudflare Containers pilot + fleet reference for cloud-native Python execution.

- **Purpose:** prove that the QNFO fleet can run Python (and any other language
  runtime) natively on Cloudflare -- closing the gap the JS-only Workers sandbox
  leaves for Python/Go workloads -- without any local Docker.
- **Capabilities:** run arbitrary Python via `ctx.container.exec()`, stream
  stdout/stderr/exit codes; liveness + scale-to-zero probes.
- **Deploy method:** `wrangler deploy` (registry image reference `docker.io/library/python:3.12-slim`,
  no Docker build). Secret: `wrangler secret put PILOT_TOKEN`.
- **Canonical source:** `QNFO/qnfo-workers/qnfo-containers-pilot`

## Endpoints

| Route | Method | Auth | Effect |
|-------|--------|------|--------|
| /health | GET | none | static liveness (no container start) |
| /version | GET | PILOT_TOKEN | `python --version` inside the container |
| /status | GET | PILOT_TOKEN | `container.running` (scale-to-zero probe) |
| /exec | POST | PILOT_TOKEN | run `python -c <body.code>`, return stdout/stderr/exitCode |

## Notes

- Container: `python:3.12-slim`, instance `lite` (1/16 vCPU, 256 MiB, 2 GB), max 3 concurrent.
- Main process is `python -m http.server 8080` (long-running), so the container
  stays alive for `exec()` and also exposes an HTTP surface on :8080.
- Scale-to-zero: charges stop after the container sleeps on idle; `/status` reports `container.running`.
