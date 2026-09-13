# qnfo-ops job status — keyless

**Public, no API key required.** Open this page or the JSON below in any browser.

| surface | URL |
|---|---|
| this page | https://github.com/QNFO/qnfo-workers/blob/main/qnfo-ops/status/JOBS.md |
| machine-readable | https://raw.githubusercontent.com/QNFO/qnfo-workers/main/qnfo-ops/status/jobs.json |
| JSON (rendered) | https://github.com/QNFO/qnfo-workers/blob/main/qnfo-ops/status/jobs.json |

Snapshot observed through **2026-09-13T13:45:33.213Z** (query taken 2026-09-13T13:46:07.618Z).
Source: `qnfo-audit` D1, table `ops_jobs`, read through the ops endpoint's read-only SQL path.

## Why this file exists

`GET /v1/jobs` and `GET /v1/jobs/:id` on `qnfo-ops.q08.workers.dev` are **bearer-gated**
(`authOk()` compares the SHA-256 of `Authorization: Bearer …` against `OPS_ROUTER_AUTH_KEY`).
A client that is handed only a URL gets `{"error":"Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY"}`.

Confirmed by test this session: an **unauthenticated** `GET /v1/jobs/job-ba4db44e03c8f4` returns
**HTTP 404**, while the same id is present in D1 as `status='succeeded'` (created 13:45:11.680Z,
updated 13:45:33.213Z, 745 response chars). The gate masks a live row as a missing one — a 404
from this surface means "not authorized", **not** "does not exist".

The in-worker fix is fully specified at
`patches/2026-09-13-public-job-status-route.md` but **is not applied** and cannot be applied from
the ops endpoint. This file is the keyless surface that *can* be produced with the capabilities
this endpoint actually holds.

## Totals

| status | jobs | with a written response | last updated |
|---|---:|---:|---|
| succeeded | 47 | 46 | 2026-09-13T13:45:33.213Z |
| **continuing** | **39** | **39** | 2026-09-13T13:40:34.195Z |
| running | 4 | 0 | 2026-09-13T13:45:18.352Z |
| failed | 8 | 1 | 2026-09-12T13:27:59.053Z |

## The snapshot is self-perturbing — read this before citing any number

The previous snapshot in this file (`observed_through` 2026-09-13T13:40:48.465Z) reported
**succeeded 46 / running 3**. Five minutes later the same query returns **succeeded 47 / running 4**.
The cause is structural: **every invocation of the ops endpoint writes an `ops_jobs` row**, so the
act of measuring the table changes it. There is no consistent read of `ops_jobs` available to a
poller, and any number on this page is stale by the time it renders. Treat the totals as
indicative, never as a settled count.

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

- This is a **snapshot**, not a live endpoint. It is refreshed only when a session chooses to
  rewrite it; there is no cron behind it.
- `error` is excluded, so `has_error: 0` does **not** mean a job succeeded — 39 of them carry a
  finished answer while stuck in `continuing`.
- The redaction is enforced by convention in the writing session, not by code. Nothing prevents a
  future refresh from committing a `response` body.
- This file was itself the subject of a write-path defect this session; see
  `DRIFT-2026-09-13T1346Z.md` for the mechanism (concurrent writes in one batch race on a single
  branch-head precondition).
