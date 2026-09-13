# Red-team remediation + test — 2026-09-13 (qnfo-ops / ops-exec)

Trigger: user instruction "execute red team remediation and test".
Method: every claim below carries a live tool return from this session (2026-09-13T06:34Z onward).
Predecessor artifacts: `audits/2026-09-12-redteam-remediation.md`,
`audits/2026-09-13-redteam-test-closeout.md`, `audits/2026-09-13-fix-queue.json` (F1–F13).

## 0. Capability test (this is the remediation enabler)

The 2026-09-13 closeout asserted `github_file_write` was in "persistent failure
(31x / 168h no recovery)" and therefore treated all repo-side remediation as
best-effort. **This file is the live test of that claim.** If it exists in
`QNFO/qnfo-workers`, the write path works and the blocker is withdrawn.

- Result: **WRITE PATH WORKS** — this artifact was created by `github_file_write`
  in the same session that re-verified the defect inventory below.
- Consequence: the earlier "no remediation possible" conclusion was **too strong**.
  Source *is* reachable (`QNFO/qnfo-workers` contains all 96 worker directories),
  so source-level fixes are shippable as commits/PRs even though `wrangler deploy`
  is not available from this endpoint.

## 1. Live re-grounding (2026-09-13T06:34Z)

| Metric | Live value | Source |
|---|---|---|
| Fleet deployed | 55 | `fleet_status` |
| Fleet probed healthy | 12 | `fleet_status` (qnfo-ai 5.25.1, qnfo-ai-search 1.0.2, qnfo-archive 1.2.0, qnfo-backlog-exec 1.2.6, qnfo-email 1.8.0, qnfo-email-orchestrator 0.3.4-glm53, qnfo-gateway 3.6.1-subscribers, qnfo-kaizen 0.3.2-glm53, qnfo-lifecycle 1.6.1, qnfo-memory-mcp 2.0.3, qnfo-paper-indexer 2.2.0, qnfo-skill-sync 1.1.2) |
| Open backlog | 24 | `backlog_status` openBacklog=24; D1 `agent_issues` status='open' = 24 |
| agent_issues total | 672 | closed 318 + wontfix 258 + resolved 72 + open 24 |
| Category mix | model-health 10, ai-calibration 10 (9 high + 1 med), research-pipeline 2, fleet-self-improve 1, infra 1 | D1 group-by |
| Priority mix | high 11, medium 13, low 0 | D1 group-by |

Both counters agree (D1 = backlog_status = 24). The 2026-09-11 counter split remains resolved.

## 2. Defect re-verification against the fix queue

| ID | Sev | Prior claim | Live verdict | Evidence |
|---|---|---|---|---|
| F6 | high | AI health probes `*.q08.workers.dev` → 404 to external clients | **CONFIRMED** | `web_fetch https://qnfo-ai.q08.workers.dev/health` → `HTTP 404`, this session |
| F1 | high | probe fails on HTTP 200 (echo predicate) | open, source located | `qnfo-ai-calibration/worker.js` present in repo |
| F3 | high | `endpoint/deepseek-direct/models` fails on http=200 | open, source located | same worker |
| F4 | med | dual roster: `@cf/` ids degraded with cf=0, probe=null | open | issues #672/#673/#674 mix alias + `@cf/` ids in one title |
| F5 | med | MODELS roster missing llama-3.2-11b-vision | open | #662 `[ai-cal] roster drift: llama-3.2-11b-vision` |
| F9 | high | ensemble 0/3 legs, unbounded re-arm | open | #644 TERMINAL research failure 45, #651 TERMINAL research failure 51 |
| F13 | med | 24 open issues uncloseable by the drain | **CONFIRMED** | `backlog_status` 24 open; drain has no probe target for code defects |

## 3. Issues confirmed present in the live backlog

24 rows, ids 635–676. Highest severity (11 high):
- ai-calibration/gw-fail ×9: ids 654, 655, 656, 657, 658, 659, 660, 670 (429/400 on
  `@cf/` models) — filed 2026-09-11T13:30Z and later.
- ai-calibration probe ×1: id 664 (llama-3.2-11b-vision, detail `http=200 echo=false "OK"`).
- research-pipeline ×2: ids 644, 651 (ensemble 0/3 legs).

## 4. Structural blockers that remain real

- **No deploy tool.** `wrangler deploy` requires CLOUDFLARE_API_TOKEN; no shell, no
  deploy binding. `run_code` is isolated compute (no network, no filesystem).
- **No D1 write path.** `ops_d1_query` is SELECT/WITH only → F13 cannot be executed
  from here; defect rows cannot be filed or closed.
- **Large-file edits.** `qnfo-ops/worker.js` (157,722 B) exceeds the repo read limit
  (~32,768 chars, no offset param) → the telemetry-hours and listIssues-await patches
  cannot be written from here as full-file replacements.

## 5. Uncertainty

- `github_file_write` succeeding once does not prove it is reliable; the 31 prior
  failures may be transient or input-specific (e.g. missing `sha` on updates).
  Treat subsequent writes as verified-only-if-read-back.
- This artifact re-verifies F6 and the counts; it does **not** re-verify the gemma
  fixture, the commit sha `66e17b9c`, or the radar date-parsing defect (F8).
- The backlog moves: MODEL-DEGRADED tickets are created on a ~2h scheduler, so this
  snapshot is point-in-time.
