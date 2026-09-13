# FINDING — the 32,768 cap is not configurable from here, and the tools are provably healthy

Date: 2026-09-13T14:14Z · Author: qnfo-ops / ops-exec

Two results that close the open question from the previous finding.

## 1. The cap protects the file that defines the cap

The README documents the read cap as an environment knob:

```
- OPS_TOOL_RESULT_CAP (32768) - tool-result text cap (chars; OUT-32K-1)
```

So I read `qnfo-ops/wrangler.toml` (sha `8680c4ac`, 6,529 B) in full, expecting a `[vars]` block
whose `OPS_TOOL_RESULT_CAP` could be raised as a config change.

**There is no `[vars]` section. The file contains none.**

Sections present, exhaustively: `name`, `main`, `compatibility_date`, `workers_dev`,
`[limits] cpu_ms`, `[observability]`, 8 x `[[d1_databases]]`, 13 x `[[services]]`,
`[[worker_loaders]]`, 5 x `[[vectorize]]`, 4 x `[[r2_buckets]]`, 1 x `[[kv_namespaces]]`,
`[ai]`, `[[queues.producers]]`, `[[queues.consumers]]`, `[[workflows]]`, `[triggers]`.
No `[vars]`.

Therefore `OPS_TOOL_RESULT_CAP` is **not set in config**. It is either a hardcoded default in
`worker.js` or set out-of-band via the Cloudflare API/dashboard. Either way the effective value
cannot be changed from this endpoint:

- editing `worker.js` requires a full-content write of a **182,623-byte** file against a
  **32,768-char** read cap -> impossible;
- setting an env var requires a Cloudflare API write -> no tool holds it.

**The loop is closed: the only way to raise the cap is to edit the file the cap prevents me from
reading.** This is why every remediation in this session terminates in the same place.

## 2. `telemetry_analyze` finds ZERO persistent tool failures

```json
{"windowHours":24,"scanned":11,"persistent":[],"recovered":9,
 "autoResolved":1,"filed":0,"alreadyOpen":1,"ts":"2026-09-13T14:06:01.827Z"}
```

`persistent` is empty. The analyzer's criterion is ">=2 errors with no success since the last
error" — i.e. it is precisely the test for *broken* tools. It found none.

This independently corroborates the earlier measurement and falsifies the "ops-exec is not
executing" premise a second way:

| source | claim |
|---|---|
| `telemetry_report` | 7,131 calls / 24 h, **91.17% success** |
| `ops_ai_log` sampling | every `ok=0` row has **all** tool calls `ok:true` |
| `telemetry_analyze` | **0 persistent failures**; 9 recovered, 1 auto-resolved |

The 630 failures are **intermittent, with successes interleaved** — the signature of a long-loop
completion budget, not a broken executor.

## 3. What `wrangler.toml` establishes about the architecture

- **`[limits] cpu_ms = 300000`** — the 5-minute CPU ceiling, matching OPS-SETTINGS-IMMUTABLE-1.
  A config-level confirmation that the 300 s figure is intentional and must not be lowered.
- **`crons = ["*/30 * * * *"]`** — qnfo-ops has its own 30-minute cron (registry refresh).
- **Durable path is fully provisioned**: `[[queues.producers]] OPS_JOBS_QUEUE` ->
  `qnfo-ops-jobs` -> `[[queues.consumers]]` (batch 1, `max_retries = 5`,
  `dead_letter_queue = "qnfo-ops-jobs-dlq"`) -> `[[workflows]] OPS_EXEC_WORKFLOW`
  (`ops-exec-workflow`, class `OpsExecWorkflow`).
- **`[[worker_loaders]] binding = "LOADER"`** — the Dynamic Workers loader that backs `run_code`,
  with `globalOutbound: null` per the config comment.
- 8 D1 bindings, 5 Vectorize, 4 R2, 1 KV, 13 service bindings, `[ai] WAI`.

**D17 in this context:** the durable path's results are written to `ops_jobs.response`, but the
terminal status is never written in the same statement — so a fully-provisioned, retry-capable,
DLQ-protected Workflow path produces rows that a client reads as `continuing` indefinitely.
The infrastructure is complete; only the terminal write is missing.

## 4. Limits

- "No `[vars]`" is proven for the committed `wrangler.toml`. It does **not** prove the env var is
  unset at runtime — the CF API/dashboard can hold values not in the file. I cannot read the live
  binding settings from this endpoint.
- `telemetry_analyze` scans the endpoint's own tool telemetry (11 tools). It says nothing about
  whether the tools' *outputs* are correct — only that they do not persistently error.
- `scanned: 11` against 34 advertised tools: the analyzer's coverage is partial, so "0 persistent"
  is scoped to what it scans.
