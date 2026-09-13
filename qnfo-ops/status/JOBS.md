# qnfo-ops job status — keyless

**Public, no API key required.** Open this page or the JSON below in any browser.

| surface | URL |
|---|---|
| this page | https://github.com/QNFO/qnfo-workers/blob/main/qnfo-ops/status/JOBS.md |
| machine-readable | https://raw.githubusercontent.com/QNFO/qnfo-workers/main/qnfo-ops/status/jobs.json |
| JSON (rendered) | https://github.com/QNFO/qnfo-workers/blob/main/qnfo-ops/status/jobs.json |

Snapshot observed through **2026-09-13T13:49:23.826Z**. Source: `qnfo-audit` D1, table
`ops_jobs`, read through the ops endpoint's read-only SQL path.

## Why this file exists

`GET /v1/jobs` and `GET /v1/jobs/:id` on `qnfo-ops.q08.workers.dev` are **bearer-gated**
(`authOk()` compares the SHA-256 of `Authorization: Bearer …` against `OPS_ROUTER_AUTH_KEY`).
A client that is handed only a URL gets `{"error":"Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY"}`.

Confirmed by test: an **unauthenticated** `GET /v1/jobs/job-ba4db44e03c8f4` returns **HTTP 404**,
while the same id is present in D1 as `status='succeeded'` (created 13:45:11.680Z, updated
13:45:33.213Z, 745 response chars). The gate masks a live row as absent. A second probe of both
`/v1/jobs` and `/v1/jobs/<id>` also returned HTTP 404 rather than 401, so the public path does not
merely reject — it fails to route.

The in-worker fix is fully specified at
`patches/2026-09-13-public-job-status-route.md` but **is not applied** and cannot be applied from
the ops endpoint. This file is the keyless surface that *can* be produced with the capabilities
this endpoint actually holds.

## How to tell whether a job succeeded

1. Read `status`. But `status` alone misleads on ~40% of rows — see D17 below.
2. `response_chars > 0` means the leg produced output. Read it.
3. **Grep the response body for `INCOMPLETE:`** — that, not `status`, decides task completion.
   A job with `status='succeeded'` can still end in an `INCOMPLETE:` trailer. Verified on
   `job-ba4db44e03c8f4`: `status='succeeded'`, response opens "The task is at its terminal state…"
   and closes with an `INCOMPLETE:` list.
4. Treat `continuing` as "leg done, chain handed off". Check the **newest** job for that chain,
   not the id you were handed.
5. `updated_at` advances only at the terminal transition, not during the run. Compare `elapsed_s`
   against the observed max (**801.457 s**) to judge a stall.
6. 7 of 8 `failed` rows carry **no error text** — you can learn *that* it failed, never *why*.
7. `tool_log` truncates at 3,000 chars, so the job record is not a complete account of what ran.
8. There is no `parent_id` / `chain_id` / `depth` column, so a multi-leg chain cannot be followed
   by query.

## Totals

| status | jobs | note |
|---|---:|---|
| succeeded | 48 | leg returned; may still carry an `INCOMPLETE:` trailer |
| **continuing** | **42** | answer already written, terminal status never set (D17) |
| running | 5 | all under 2.5 min old at snapshot time |
| failed | 8 | 7 of 8 have NULL error text |
| **total** | **103** | |

## Correction issued this snapshot — `updated_at` DOES advance

A prior snapshot asserted that `updated_at` "is set once at pickup and never advanced", making a
hung job indistinguishable from a healthy one. **That is falsified.** All four jobs that read
`running` in the previous snapshot have since transitioned, and their `updated_at` moved with them:

| job | transition | updated_at before → after |
|---|---|---|
| job-24f8e860fa0240 | running → succeeded | 13:34:33.921 → **13:47:52.441** |
| job-0de34b1c03d96d | running → continuing | 13:45:18.352 → **13:46:53.098** |
| job-220de5e6fea9c4 | running → continuing | 13:39:41.696 → **13:48:01.378** |
| job-e06897c0ff7013 | running → continuing | 13:40:31.905 → **13:48:10.841** |

Accurate statement: `updated_at` is written **at pickup and again at the terminal transition,
but not as a heartbeat during the run**. A stall is therefore detectable by elapsed time, not by
`updated_at` alone.

**None of the four were stuck.** Max observed runtime across 24 jobs is **801.457 s (13.36 min)**,
set by `job-24f8e860fa0240`, which completed successfully. The previous "indeterminate by
construction" verdict is resolved by observation: they were genuinely in flight.

## Read this before trusting any status here — D17

**42 jobs sit in `status='continuing'` with a finished answer already written.** The terminal status
is never written in the same statement that writes `response`, so a poller reads `continuing`
forever on exactly the chain that a poller exists to watch. The count grew **26 → 32 → 39 → 42**
during 2026-09-13, while `succeeded` grew only 47 → 48: D17 accumulates faster than jobs terminate.
A keyless status surface is cosmetically satisfied and functionally useless until D17 ships. Fix
belongs in the same deploy as the public route: write `response`, the terminal status, and a new
`terminal_at` in one statement, plus a reaper.

Related: **D18** — the same missing terminal write causes the durable path to re-execute an
identical prompt (3× observed on two attachments), which multiplies compute and re-runs any
non-idempotent side effect inside a job.

## D19 — this file has a write race

This snapshot is refreshed only when a session writes it, and multiple sessions write it
concurrently. Observed during this refresh: a `github_file_write` against the sha read minutes
earlier returned **`GitHub 409: does not match`** because another session had committed in between.

Consequences, both real:
- **Last-writer-wins with no ordering.** A stale session can overwrite a fresher snapshot, so
  `observed_through` can move *backwards*. The file cannot be trusted to be monotonic.
- **Silent content loss.** Merging is manual. This revision was merged to preserve the prior
  session's 404-test finding, but nothing enforces that.

Do not treat `observed_through` as a monotonic clock. If two snapshots disagree, the newer
timestamp is not necessarily the one you are reading.

## Redaction

Included: `id`, `status`, `model`, `strategy`, `created_at`, `updated_at`, `elapsed_s`,
`response_chars`, `has_error`, `resolved`.
Excluded: `response`, `payload`, `tool_log`, `error`.

This is a deliberate deviation from the route spec's `publicJobView`, which strips `payload` but
returns `response` unauthenticated. A committed file is public **and permanently indexable**, so it
redacts one step further: `response` bodies quote D1 rows, R2 keys, service versions and occasionally
email content. If a live keyless surface with response bodies is wanted, it has to be the in-worker
route with a `?fields=` allowlist — not this file.

## Limits

- This is a **snapshot**, not a live endpoint. It is refreshed only when a session writes it.
- **The snapshot is self-perturbing.** Every invocation of the ops endpoint writes an `ops_jobs`
  row, so any read of this table is stale within minutes and can never be consistent. The five
  `running` rows above were created by the very session that wrote this file. Treat the numbers as
  indicative, never as a settled count.
- Job ids are not enumerable here; only the newest 24 appear, and `jobs.json` carries no full list.
- The snapshot cannot show a job that was created after `observed_through`.
