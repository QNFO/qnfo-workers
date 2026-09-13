# qnfo-ops job status — keyless

**Public, no API key required.** Open this page or the JSON below in any browser.

| surface | URL |
|---|---|
| this page | https://github.com/QNFO/qnfo-workers/blob/main/qnfo-ops/status/JOBS.md |
| machine-readable | https://raw.githubusercontent.com/QNFO/qnfo-workers/main/qnfo-ops/status/jobs.json |
| JSON (rendered) | https://github.com/QNFO/qnfo-workers/blob/main/qnfo-ops/status/jobs.json |

Snapshot observed through **2026-09-13T13:40:48.465Z**. Source: `qnfo-audit` D1, table
`ops_jobs`, read through the ops endpoint's read-only SQL path.

## Why this file exists

`GET /v1/jobs` and `GET /v1/jobs/:id` on `qnfo-ops.q08.workers.dev` are **bearer-gated**
(`authOk()` compares the SHA-256 of `Authorization: Bearer …` against `OPS_ROUTER_AUTH_KEY`).
A client that is handed only a URL gets `{"error":"Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY"}`.

The in-worker fix is fully specified at
`patches/2026-09-13-public-job-status-route.md` but **is not applied** and cannot be applied from
the ops endpoint. This file is the keyless surface that *can* be produced with the capabilities
this endpoint actually holds.

## Totals

| status | jobs | with a written response | last updated |
|---|---:|---:|---|
| succeeded | 46 | 45 | 2026-09-13T13:40:48.465Z |
| **continuing** | **39** | **39** | 2026-09-13T13:40:34.195Z |
| running | 3 | 0 | 2026-09-13T13:40:31.905Z |
| failed | 8 | 1 | 2026-09-12T13:27:59.053Z |

## Read this before trusting any status here — D17

**39 jobs sit in `status='continuing'` with a finished answer already written.** The terminal status
is never written in the same statement that writes `response`, so a poller reads `continuing`
forever on exactly the chain that a poller exists to watch. The count grew **26 → 32 → 39** during
2026-09-13. A keyless status surface is cosmetically satisfied and functionally useless until D17
ships. Fix belongs in the same deploy as the public route: write `response`, the terminal status,
and a new `terminal_at` in one statement, plus a reaper.

Related: **D18** — the same missing terminal write causes the durable path to re-execute an
identical prompt (3× observed on two attachments), which multiplies compute and re-runs any
non-idempotent side effect inside a job.

## Redaction

Included: `id`, `status`, `model`, `strategy`, `created_at`, `updated_at`, `response_chars`, `has_error`.
Excluded: `response`, `payload`, `tool_log`, `error`.

This is a deliberate deviation from the route spec's `publicJobView`, which strips `payload` but
returns `response` unauthenticated. A committed file is public **and permanently indexable**, so it
redacts one step further: `response` bodies quote D1 rows, R2 keys, service versions and occasionally
email content. If a live keyless surface with response bodies is wanted, it has to be the in-worker
route with a `?fields=` allowlist — not this file.

## Limits

- This is a **snapshot**, not a live endpoint. It is refreshed only when a session writes it.
- Job ids are not enumerable here; only the newest 20 appear, and `jobs.json` carries no full list.
- The snapshot cannot show a job that was created after `observed_through`.
