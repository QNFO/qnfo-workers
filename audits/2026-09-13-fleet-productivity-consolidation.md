# Fleet Productivity Audit & Consolidation — WBS Plan
**Date:** 2026-09-13 · **Endpoint:** qnfo-ops · **Evidence:** live tool calls only
**REV 2 — CORRECTED.** Two claims in rev 1 were falsified by later testing and are retracted
in place below. See `audits/2026-09-13-CORRECTION-rootcause-retraction.md` for the full record.

## P0 Pre-flight (DONE, verified)
| probe | result |
|---|---|
| fleet_status | 55 deployed / 12 probed-healthy / 55 total |
| service_discover | 55 registry rows |
| backlog_status | v1.2.8 openBacklog **42** at session start |
| ops_issues_list(open) | **42 rows returned** — the D1 "count 0" defect is NOT reproducing |
| cf_analytics 30d | 281,106 req / 187 err · **__unknown__ = 20,380** · only 8 workers carry invocation data |
| telemetry_report 24h | 10,570 calls / 884 fail (8.4%) — web_fetch 357, ops_d1_query 280, github_file_write 84 |

## P1 Productivity census (DONE)
`fleet_worker_census`, 55 rows, generated 2026-09-13 14:25:55Z.
27 PRODUCTIVE · 7 FETCH-ONLY · 3 LOW-YIELD · 2 DAILY-ONLY · 4 DEGRADED ·
2 FIRING-NO-OUTPUT · 1 STALLED · 1 NOT-YET-FIRED.

## P2 Alert audit (DONE) — all firing alerts are TRUE, none spurious
probe-fails 2 rows ok=0 · agent-issues 42>20 · research-failed 1 row · trace-stall
(worker_logs newest 2026-09-10T11:17:40Z). fleet-runs-stall and human-open correctly silent.

## P3 — RETRACTED (rev 1 was wrong). The routing claim, corrected
**RETRACTED:** "`*.q08.workers.dev` is dead account-wide — one CF account setting fixes
issue 739 and the worker-health alert cluster."

**FALSIFIED by direct test (9-name sample):** qnfo-kaizen, qnfo-ai-search, qnfo-archive,
qnfo-memory-mcp, qnfo-backlog-exec, qnfo-paper-indexer all return **HTTP 200** with valid
JSON; only qnfo-gateway (404), qnfo-ops (404) and qnfo-ai (530) fail. **6 of 9 (67%) work.**
The subdomain is alive and issue 739's "all 55 base_urls return 404" is substantially false.

**The real 530 cause**, already recorded in `task_dod_register` id 217 (2026-09-11) and
independently reproduced today: a `*.qnfo.org` wildcard resolves every pretty-name at the
proxied edge, but only the routed hosts have worker routes, so unrouted names fall through to
placeholder origin `192.0.2.1` → **530**. Verified: `qnfo-kaizen.qnfo.org/health` → 530 and
`qnfo-ops.qnfo.org/health` → 530 while `qnfo-kaizen.q08.workers.dev/health` → 200.

**The genuine defect is registry data, not routing:** the registry stores
`https://<name>.q08.workers.dev` for every worker, but some scripts have `workers_dev`
disabled (custom-domain-only), so their stored URL cannot be probed. Fix: store each worker's
actual reachable URL, or record per-name probeability.

## P3b — Deploy path: PARTIALLY WORKING (corrects an over-strong claim)
`fleet_deploys` shows **`qnfo-backlog-exec` successfully redeployed twice on 2026-09-13** —
id 69 (1.2.6→1.2.7, 08:01:43, ok=1) and id 75 (1.2.7→1.2.8, 14:02:44, ok=1) — both from
`r2:qnfo-canonical/qnfo-backlog-exec.js`. That also resolves the `healed=1` in the 14:05:46
scan note. **Deploys ship via the R2 canonical path.**

**But 47 of 55 workers (85%) have their GitHub canonical shadowed** by a
`deployed-current.worker.js` mirror that precedes `worker.js` in the candidate order
(`fleet_drift_report` `source_path` distribution; 3 mirrors read directly and all are live
bundles, not tombstones). For those workers a fix committed to `worker.js` never deploys and
drift detection compares the repo to itself. Filed as issue **786**.

**LIVE HAZARD:** `personal-companion` is pushed **`v1.1.0 → 1.0.0` every hour**
(`fleet_deploys` ids 70–74), blocked **only** by the unrelated CF `10021` script_name bug.
Fixing that 400 in isolation ships a downgrade — exactly issue 738's warning, now evidenced.

## P4 Consolidation groups (evidence-based)
- **G1 low-yield sinks → merge:** audit-hub (5 req24), companion-hub (5), qnfo-events (4)
- **G2 firing-no-output → repair or retire:** qnfo-ddocs-indexer, qnfo-paper-explainer
- **G3 stalled → merge into research-exec:** qnfo-research-supervisor (48h, no cron path)
- **G4 daily-only:** qnfo-impact (1), qnfo-twin-maintain (1)
- **G5 request-driven (EXCLUDE from the cron criterion):** qnfo-gateway (157,988 req/30d),
  qnfo-memory-mcp, qnfo-tools-mcp, qnfo-email, qnfo-pdf, qnfo-ipatent, qnfo-qwav,
  obsidian-writer, errata-hub, qnfo-agent-orchestrator, qnfo-agent-ws
- **G6 degraded (repair):** qnfo-research-exec, qnfo-observability, radar-hub, research-daily-brief

## P5 D1 remediations — EXECUTED
Issue 750 (6 registry rows merged→live, verified persisting) · issue 727 (stale health) ·
issue 704 (research_queue terminalized, failed 1→0) · registry version drift · annotations on
712, 713, 724, 728, 729, 731, 735, 736, 739, 697, 714 · 4 human-gated register rows (231–234)
· issues 784 (audit loop is the filer) and 786 (mirror shadowing) filed.

## P6 Source-level fixes — STAGED, not deployable here
`qnfo-fleet-control/PATCH-2026-09-13-CONSOLIDATED.mjs` (13 groups, 9 mechanisms) ·
`qnfo-research-exec/apply-research-exec-fix.mjs` (FIX A/B/C/D; FIX C precondition VERIFIED
satisfied — the mirror tombstone is in place, sha `725a3e84`). CI runner exists:
`.github/workflows/apply-staged-patchers.yml`, self-described as the missing piece in the
deploy chain, but **workflow_dispatch-only** — no tool on qnfo-ops can trigger it.

## P7 Deploy path — BLOCKED (verified, not assumed)
No deploy tool and no GitHub Actions dispatch capability on this endpoint.
`qnfo-fleet-control/worker.js` = 75,875 B and `qnfo-research-exec/worker.js` = 80,916 B both
exceed the **32,768-char read cap, re-verified by direct test** (`maxChars=200000` →
"truncated to 32768 chars"), so neither bundle can be reconstructed for a contents-API write.
The deploy module itself was never read.

## P8 Verification & red-team
Every done-claim is backed by a same-session tool call. Six of my own claims were retracted or
refined this session (see the corrections ledger).

## P9 Closeout
Artifacts: this file · `audits/2026-09-13-51-item-disposition.md` ·
`audits/2026-09-13-CORRECTION-rootcause-retraction.md` · R2
`qnfo-audit/fleet-productivity/2026-09-13-closeout.md`.

## Premise check (adversarial)
The rule "every worker must execute multiple times a day or be merged" is **wrong as stated**.
`qnfo-gateway` serves 157,988 requests/30d with **no cron at all**; memory-mcp, tools-mcp,
email, pdf and ipatent are request-driven sinks. Merging them for lacking a cron would be a
**downgrade**. Correct test: scheduled workers must produce an outcome per firing;
request-driven workers must serve requests. Only G1–G4 qualify.

## Corrections ledger (my own claims, this session)
| claim | status |
|---|---|
| `*.q08.workers.dev` dead account-wide | **retracted** — 6/9 names return 200 |
| "no CI workflows" | **retracted** — `.github/workflows` exists |
| "nothing can ship / deploy path dead" | **retracted** — backlog-exec shipped twice today |
| read cap 32,768 | **verified by direct test** |
| patcher's "19 rows masked as ok" | **stale** — 0 masked |
| advisor is the runaway filer | **rejected by source** — it dedupes; `source='qnfo-ops'` is the filer |
