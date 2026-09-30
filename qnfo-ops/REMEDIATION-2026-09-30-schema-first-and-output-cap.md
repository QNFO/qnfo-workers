# REMEDIATION 2026-09-30 — Schema-First D1 Access + Output-Cap Decoupling

Status: **STAGED / PARTIALLY LANDED**. Authored from a live fleet audit on 2026-09-30.
Tracking issues: **#1530** (SCHEMA-FIRST-1), **#1531** (OPS-OUTPUT-CAP-CLAMP-1), open **#1489**.

This file is additive and executable-inert (docs only). It deliberately does **not**
touch `worker.js`, because a main-branch commit to `worker.js` is redeployed by
`qnfo-fleet-control` on its `*/20` cycle (REPO-IS-DEPLOY-SOURCE-1) and the guarded
deploy preconditions below are not yet all met.

---

## 1. Finding A — `ops_d1_query` failure class is agent schema-guessing

### 1.1 Evidence (same-turn, 2026-09-30)
| Signal | Value | Source |
|---|---|---|
| Tool failures / calls, 24h | **1637 / 16251** | `telemetry_report` |
| `ops_d1_query` failures, 24h | **814** (rank 1) | `telemetry_report` |
| `ops_d1_query` failure rate, 6h | **14.6%** (76 err / 444 ok, `recent:true`) | `telemetry_analyze` |
| Classified cause | `agent-schema-guess` | `tool_error_triage` |

Raw `err_head` samples (verbatim):
- `D1_ERROR: no such column: schedule at offset 13` — guessed `fleet_crons.schedule`
- `D1_ERROR: no such table: fleet_worker_census`
- `D1_ERROR: no such column: create...` — guessed `personal.queries.created_at`
- `D1_ERROR: no such column: er...` — guessed `tool_error_triage.errors`

### 1.2 Root cause
The agent writes SQL against **guessed** schemas. A complete, accurate discovery
surface already exists and is simply unused:

```
SELECT db, tbl, col, coltype, required, pk, cols
  FROM d1_schema_index WHERE db = 'audit' AND tbl = '<table>';
```

Verified 2026-09-30: `d1_schema_index` holds **325 tables / 326 rows** for `db='audit'`
(plus personal 41, outreach 18, living 18, portfolio 16, graph 12, cms 8, ipatent 5) and
`col`/`cols` carry the **full** comma-separated column list — e.g.
`cloud_ops_events → id,ts,kind,text,meta,job,status`. The index is correct; it is not consulted.

### 1.3 Related closed-but-recurring defect
**#1490** (`OPS-D1-QUERY-SCHEMA-HINT-TRUNCATED-1`, the D1 error hint) is **CLOSED**, yet the
failure class it targeted still recurs at ~814/day. Per RE-FALSIFICATION-CLOSED-GATE-1 a
closed issue needs a passing live re-probe; here the re-probe **fails**. Closed ≠ fixed.

### 1.4 Permanent fix (two legs)
1. **Tool-surface directive** — add to the `ops_d1_query` tool description in
   `qnfo-ops/worker.js`:
   > Before querying an unfamiliar table, first run
   > `SELECT col FROM d1_schema_index WHERE db = '<db>' AND tbl = '<table>'`.
   > Never guess column names.
2. **Freshness** — `d1_schema_index` has **no freshness column**, so staleness is
   undetectable. Add `refreshed_at` and a cron that rebuilds the index from
   `sqlite_master` for all 8 bound DBs; alert when `refreshed_at` exceeds cadence.

---

## 2. Finding B — advertised `max_output` 393216 is unreachable (live)

### 2.1 Evidence
`cf_worker_read` on live `qnfo-ops` (version **2.38.1-toolbudget-relock**) returns a bundle
still containing:

```js
var GW_MAX_OUT = 32768;
var DEFAULT_MAX_OUT = 393216;
```

Every upstream request body clamps to it — 5 sites — e.g.
`max_tokens: Math.min(answerCap, GW_MAX_OUT)`. Therefore the manifest/health-advertised
`max_output: 393216` cannot be reached; the effective ceiling is **32,768 output tokens**.

Secondary cap, same bundle: `const cap = resultCap || 16e3;` — **every tool result is
truncated to ~16 KB** before the model sees it.

### 2.2 Staged patch (in-repo, not applied)
`qnfo-ops/PATCH-2026-09-30-output-cap-decoupling.diff` (5,542 B, sha `94dcd8c7`) adds
`GW_MAX_OUT_CEILING` + `gwMaxOut(env)` (reads `OPS_GATEWAY_MAX_OUT`), swaps all 5 clamps,
defaults the tool-result cap to `MAX_TOOL_RESULT_CHARS` instead of `16e3`, and makes the
tool-round dynamic max env-overridable (`OPS_TOOL_ROUND_DYN_MAX`).

Narrative + third mechanism (tool-round cap): `FINDING-2026-09-30-response-truncation-three-mechanisms.md`.

### 2.3 Honest scoping (do not over-claim)
The finding's own measurement: `ops_ai_log` max response is 19,550 chars and the token cap
**has not fired** in the logged window. So raising the answer cap alone changes nothing.
The user-visible cut is driven by **cap #1 (16 KB tool-result)** and **cap #3 (tool-round)**.
Fix the measurement-honest one first.

### 2.4 Deploy preconditions (why this is staged, not shipped)
A self-deploy is the classic blast-radius trap: a bad deploy takes down the endpoint that
would perform the repair. Open/past blockers:
- **#1505** `CONTAINER-DECLARED-INERT-1` — `scripts/raw_put.py` container declaration is inert (**open**).
- **#1487** / **#1497** — container/binding stripping (**closed**), but the guard is only as good as its last re-probe.
- **#1489** `CF-WORKER-READ-TRUNCATION-LIE-1` (**open**) — `cf_worker_read` returns a false
  `size`/`truncated` pair for large workers. **Reproduced live 2026-09-30**: it reported
  `size: 31126` for a ~380 KB worker. This defect has already fabricated root causes in audits,
  and it directly undermines any deploy that verifies by reading the bundle back.

**Required guarded deploy path:** read full bindings **+ containers + limits**, echo them in
the upload metadata, deploy, then post-deploy assert `cpu_ms`, binding count, and container
count against the pre-read values.

---

## 3. Definition of Done for this remediation
- [ ] `ops_d1_query` tool description carries the schema-first directive (worker.js change).
- [ ] `d1_schema_index.refreshed_at` + refresh cron live; staleness alerting wired.
- [ ] `ops_d1_query` 24h failure rate < 2% for two consecutive windows (re-falsification probe).
- [ ] `#1489` fixed (part selection by `Content-Disposition` naming `worker.js` **and**
      non-JSON content-type, or take the largest part) and re-probed.
- [ ] Guarded deploy path proven: deploy → assert binding count + container count + `cpu_ms`.
- [ ] Then and only then: apply `PATCH-2026-09-30-output-cap-decoupling.diff`.
