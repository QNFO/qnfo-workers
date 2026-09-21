# qnfo-observability

**Purpose:** canonical fleet observability layer — makes the QNFO fleet observable to itself
(the system can only evolve intelligently if it can see itself).

**Capabilities:**
- INGEST: hourly parse of Cloudflare Logpush workers_trace_events (R2 qnfo-audit/workers_trace/*.log.gz) into D1 worker_logs. Covers ALL workers with zero per-worker code changes (console.log, exceptions, request/response summaries, CPU/wall time).
- LOG API: POST /log structured events (optional client snippet), GET /workers/logs query.
- SUMMARY: GET /fleet/summary joins worker_logs + fleet_probe_log + worker_invocations.
- DIGEST: hourly cloud_ops_events row (kind=fleet-observability-digest) + alerts on error-ratio anomalies.

**Deploy method:** wrangler deploy (this dir). Bindings: AUDIT (qnfo-audit D1), LOGS (R2 qnfo-audit). Cron: 17 * * * *.

**Canonical source:** QNFO/qnfo-workers/qnfo-observability/worker.js (deployed-current.worker.js mirrors the deployed bundle).

**Trust boundary (known failure mode):** POST /log is unauthenticated (append-only, low-value log rows);
Logpush gz files are re-delivered by Cloudflare, so dedupe relies on the UNIQUE event_hash index
(INSERT OR IGNORE) — a hash collision (<1e-9) could drop one row.
