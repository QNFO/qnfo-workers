# worker_logs sampling contract (WORKER-LOGS-CONTRACT-1)

Issue #1223 (WORKER-LOGS-SAMPLED-ERROR-VISIBILITY-1), 2026-10-01.

## What `qnfo-audit.worker_logs` is

`worker_logs` holds Workers Trace Event Logpush records. The `workers_trace/*.log.gz` objects land in R2 and
`qnfo-observability` ingests them (`ingestTrace`, deduped on `event_hash`).

Trace Logpush is a **per-script opt-in** (`logpush = true` in that worker's `wrangler.toml`, or the script setting
of the same name). Only the scripts that opted in emit records. On 2026-10-01 the last 24h held 508 rows from
two scripts: `qnfo-ai-search` (431) and `qnfo-pdf` (77). All were `fetch` / `ok` / `200`. The repo declares
`logpush = true` only in `memory-mcp` and `qnfo-error-selfheal`.

So `worker_logs` is **request-level detail for the opted-in scripts**. It is not a census of the fleet:
- A missing script means the script did not opt in. It does not mean the script is quiet.
- `0 non-200 rows` means nothing about fleet errors.

## Where fleet error rates come from

The fleet error measure is the Cloudflare GraphQL dataset `workersInvocationsAdaptive`. It is unsampled per
script, with `requests`, `errors`, status class and hour. `qnfo-fleet-dashboard` (`cfAnalytics`, 24h window,
every 15 min) uses it to compute:
- per-worker errors;
- errors inside the active window (`errors_active`);
- `last_error_hour`.

That feed drives the `worker-errors` dispatch category and the dashboard error flags.

## Rules

1. Never read `worker_logs` as evidence that the fleet, or a worker outside the opt-in set, had zero errors.
2. Fleet or per-worker error rates and "is X failing now" questions use `workersInvocationsAdaptive` (the
   dashboard feed), not `worker_logs`.
3. To get request-level detail for another worker, opt it in (`logpush = true`). That is a per-script cost and
   privacy decision: trace records carry request URLs, including personal-plane routes. It is not a default.
4. `fleet_error_state` (writer `qnfo-error-selfheal`, retired) is empty and must not be read as a current
   error source.
