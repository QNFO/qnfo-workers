# APPLIER-ROT reconciliation — 2026-09-29

Source: qnfo-ops session. All claims below are backed by same-session tool output
(HTTP fetches against `main`, D1 queries against QNFO_AUDIT, live tool invocation).

## Finding

`ci-status/applier-doctor.json` (ts 2026-09-29T16:37:43Z) filed 15 issues
(ids 1413-1438) asserting that 14 applier scripts "never reach main".

**That premise is false.** The instrument measures *script application*
(whether the applier's effect is present) but reports it as *script presence*.
See umbrella issue 1444 (APPLIER-DOCTOR-FALSE-POSITIVE-CLASS-1).

### Direct refutation — script presence

`HEAD https://raw.githubusercontent.com/QNFO/qnfo-workers/main/scripts/<name>`
returned **HTTP 200 for all 14** applier scripts:

attachguard-xml-form-patch.py, d1guard-literal-aware-patch.py,
deploy-guard-wrap-patch.py, fleet-autoaudit-v4-envelope-patch.py,
raw-put-schedules-patch.py, run-gate-internal-patch.py,
driftguard-label-and-lifecycle-sot-patch.py, driftguard-server-version-patch.py,
github409-variant-reread-patch.py, selfheal-rate-aware-patch.py,
selfheal-volfloor-patch.py, telemetry-truth-patch.py,
apply-pending-patches.py, deploy-guard-ms-failclosed-patch.py

### Direct refutation — target effects present on main

| Target file | Marker | Count |
|---|---|---|
| `qnfo-ops/worker.js` (367668 B) | `attachGuardXml` | 2 |
| `qnfo-ops/worker.js` | `sha_retried` (409 retry) | 1 |
| `qnfo-ops/worker.js` | `DEPLOY_GUARD` | 1 |
| `qnfo-ops/worker.js` | `issue_ledger` (self-heal metric) | 11 |
| `qnfo-ops/worker.js` | `failureRate` / `alreadyOpen` / `recovered` | 1 / 2 / 3 |
| `scripts/raw_put.py` (18819 B) | `schedules_apply()` + `AUTODEPLOY-SCHEDULES-NOT-APPLIED-1` | present / 5 |
| `scripts/deploy-drift-guard.py` (20702 B) | `SERVER_CONST` | 2 |
| `scripts/deploy-drift-guard.py` | `label_mismatch` | 2 |
| `scripts/fleet-autoaudit.py` (17947 B) | `def d1_ok(res)` / `def d1_err(res)` | 1 / 1 |

### Behavioural proof (strongest evidence class)

1. **D1 REST envelope fix (issue 1403, closed):** `audits/fleet-autoaudit-2026-09-29.json`
   now reports `"d1_write_failures": [], "d1_writes_ok": 110, "_guard_rc": 0`.
   Pre-fix this was `d1_writes_ok: 0` with 110 phantom `"None"` failures.
2. **TELEMETRY-SELFHEAL-RATE-AWARE-1 (issue 1423, refuted):** `telemetry_analyze(24h)`
   before: `{scanned:12, persistent:[], filed:0}` (structurally dead).
   After: `{scanned:18, persistent:[], recovered:5, alreadyOpen:8, filed:0, rates:{...}}`
   with per-tool failure rates.
3. **INTERNAL-SERVICE-BINDING-AUTH-1 (issue 1419, refuted):** `ops_issue_run(confirm=true)`
   returned `{ok:true, triggered:true, http:200, worker:"qnfo-backlog-exec",
   inventory:{laneCount:14, total:141}}` — the drain executed over the service
   binding with no auth failure.

## Disposition

- **Closed as refuted (13):** 1414, 1415, 1416, 1417, 1418, 1419, 1420, 1421,
  1422, 1423, 1436, 1437, 1438. Close evidence recorded in `issue_triage`
  under `rc='APPLIER-ROT-REFUTE-1'`.
- **Kept open (2):**
  - **1413** APPLIER-ROT-NO-CONSUMER-1 — legitimate: no consumer drains
    non-applied appliers. Unaffected by the measurement error.
  - **1424** SELFHEAL-VOLFLOOR-1 — literal presence refuted (script on main,
    7834 B) but the **effect is unverified**: no `minVolume`/`volfloor`
    identifier exists in the live bundle. Kept open pending effect verification.
- **Kept open (1):** **1444** umbrella — the instrument is still wrong;
  the remedy is an applier-doctor fix, not ticket closure.

## Live failure profile (telemetry_analyze, 24h, 2026-09-29T16:48:23Z)

| Tool | errors | successes | rate |
|---|---|---|---|
| shell_pipeline | 4 | 4 | 50.00% |
| web_fetch | 41 | 39 | 51.25% |
| git_clone_exec | 6 | 15 | 28.57% |
| container_workspace_exec | 2 | 5 | 28.57% |
| exec_python | 10 | 28 | 26.32% |
| github_file_write | 31 | 161 | 16.15% |
| cf_worker_read | 25 | 210 | 10.64% |
| shell_exec | 95 | 890 | 9.64% |
| ops_issue_run | 5 | 48 | 9.43% |
| ops_d1_write | 16 | 244 | 6.15% |
| github_repo_read | 24 | 776 | 3.00% |
| run_code_net | 5 | 247 | 1.98% |
| ops_d1_query | 13 | 2232 | **0.58%** |

`ops_d1_query` at 0.58% is the post-repair rate for the schema-hint fix
(`d1_schema_index.col` backfill); it was the dominant error class earlier.

**Dominant live class = container instability** (shell_exec, shell_pipeline,
git_clone_exec, container_workspace_exec, exec_python). Filed as
**CONTAINER-INSTABILITY-1** (agent_issues id 1445). Observed error text:
`container error` and `container timeout after 300000ms (cold start ~15s;
retry or increase timeout_ms)`; `container_status` reported
`initialized:false` repeatedly and `/workspace` state was lost at least
3 times in-session.

## Adversarial limits of this reconciliation

1. Marker-count scanning proves string presence, not behavioural correctness.
   Only the three items in "Behavioural proof" are behaviourally established.
2. `raw.githubusercontent.com` serves CDN-cached `main`; a commit landing in
   the cache window could make a presence check stale. Blob-level comparison
   (git hash-object vs GitHub blob sha) was used for the one file where this
   mattered (`fleet-autoaudit.py`: sha256 `1b417329...` == `main` blob
   `817dd999b751355136a7c785e65b31507d30a38b`, 17947 B).
3. The 13 refutations rest on script presence + target-effect markers; a
   script could be present and its effect present while the applier is still
   independently broken. That is a *different* defect from "never reaches
   main" and is not what these tickets claimed.
4. Issue 1424's effect remains unverified — it is deliberately not closed.
