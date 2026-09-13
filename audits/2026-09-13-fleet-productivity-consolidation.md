# Fleet Productivity Audit & Consolidation — WBS Plan
**Date:** 2026-09-13 · **Endpoint:** qnfo-ops · **Evidence:** live tool calls only

## P0 Pre-flight (DONE, verified)
| probe | result |
|---|---|
| fleet_status | 55 deployed / 12 probed-healthy / 55 total |
| service_discover | 55 registry rows |
| backlog_status | v1.2.8 openBacklog **42** |
| ops_issues_list(open) | **42 rows returned** — the D1 "count 0" defect is NOT reproducing |
| cf_analytics 30d | 281,106 req / 187 err · **__unknown__ = 20,380** · only 8 workers carry invocation data |
| telemetry_report 24h | 10,570 calls / 884 fail (8.4%) — web_fetch 357, ops_d1_query 280, github_file_write 84 |

## P1 Productivity census (DONE)
`fleet_worker_census`, 55 rows, generated 2026-09-13 14:25:55Z. Verdict distribution:
- PRODUCTIVE: 27 · FETCH-ONLY: 7 · LOW-YIELD: 3 · DAILY-ONLY: 2
- DEGRADED: 4 · FIRING-NO-OUTPUT: 2 · STALLED: 1 · NOT-YET-FIRED: 1

## P2 Alert audit (DONE) — all firing alerts are TRUE, none spurious
| watch rule | live condition | verdict |
|---|---|---|
| probe-fails (warn) | 2 rows ok=0 in 1h | TRUE |
| agent-issues (warn) | 42 > 20 | TRUE |
| research-failed (err) | 1 failed row | TRUE |
| trace-stall (err) | worker_logs newest 2026-09-10T11:17:40Z | TRUE |
| fleet-runs-stall | 75 runs in 1h | false (silent) |
| human-open | 0 user tasks | false (silent) |

## P3 ROOT CAUSE — `*.workers.dev` is dead account-wide (highest leverage)
| probe | result |
|---|---|
| `qnfo-ops.q08.workers.dev/health` | **HTTP 404** (this endpoint is definitionally alive) |
| `qnfo-ai.q08.workers.dev/health` | **HTTP 530 / error 1016** (CF origin-DNS error) |
| `qnfo-ai.qnfo.workers.dev/health` | HTTP 530 |
| `reading.q08.org` | **200** — custom domains still serve |

Consequences: issue 739 (all 55 base_urls dead) · `worker-health` error alerts ids 426,474,475,526,604,699,798,893,941,998,1060 · chat-canary criticals (2026-09-02).
**One CF account setting fixes all of it. No per-worker action can.**

## P4 Consolidation groups (evidence-based)
- **G1 low-yield sinks → merge:** audit-hub (5 req24), companion-hub (5), qnfo-events (4)
- **G2 firing-no-output → repair or retire:** qnfo-ddocs-indexer (13 req, indexed_at frozen 09-04), qnfo-paper-explainer (0 req, log frozen 09-11)
- **G3 stalled → merge into research-exec:** qnfo-research-supervisor (silent 48h, no cron path)
- **G4 daily-only (below bar):** qnfo-impact (1), qnfo-twin-maintain (1)
- **G5 request-driven (EXCLUDE from cron criterion):** qnfo-qwav (legacy, retirement candidate), qnfo-pdf, qnfo-ipatent, obsidian-writer, errata-hub, qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-gateway (157,988 req), qnfo-memory-mcp, qnfo-tools-mcp, qnfo-email
- **G6 degraded (repair):** qnfo-research-exec (NL ReferenceError, v2-drain blocked) · qnfo-observability (trace ingest frozen 76h) · radar-hub (21 timeouts) · research-daily-brief (FAILED 09-13T06:07:35Z)

## P5 D1 remediations — EXECUTED this session
1. research_queue stuck row terminalized (stops infinite re-pick + silences a true alert)
2. agent_issues 724 resolved (premise inverted — live 0/0 matches documented fail-closed design)
3. agent_issues 739 annotated with verified root cause
4. agent_issues 731 annotated (config now fail-closed, thrash cause fixed in staged patch)
5. agent_issues 736/728 annotated with this plan + blocked-on-deploy status

## P6 Source-level fixes — STAGED, not deployable here
`qnfo-fleet-control/PATCH-2026-09-13-CONSOLIDATED.mjs` — 13 fail-closed groups, 9 mechanisms:
probeHealth existence-check · probeVersion substring cross-attribution · worker-scoped versionOf ·
tri-state cmpV comparator · downgrade guard · r2Read tombstone rejection · stale-canon self-seal ·
NO_SELF naming · script_name metadata (CF 10021) · register dedupe column.
Config precondition ALREADY MET: `fleet_deploy_state` = enabled 0 / auto_heal 0 (14:23–14:26Z).

## P7 Deploy path — BLOCKED (verified, not assumed)
No deploy tool exists on this endpoint. `service_discover(qnfo-fleet-deploy)` = null. No CI workflows.
`qnfo-fleet-control/worker.js` is 75,875 B vs a 32,768-char read cap with no offset → the bundle
cannot be reconstructed for a contents-API write. Patch application requires a shell runner.

## P8 Verification & red-team
Every done-claim in this plan is backed by a same-session tool call. Adversarial finding on the
user's premise is recorded in the closeout (see §Premise check).

## P9 Closeout
Backlog reconcile + artifacts: this file, GitHub `audits/`, R2 `qnfo-audit`.

## Premise check (adversarial, required)
The rule "every worker must execute multiple times a day or be merged" is **wrong as stated**.
`qnfo-gateway` serves 157,988 requests/30d with **no cron at all**. `qnfo-memory-mcp`,
`qnfo-tools-mcp`, `qnfo-email`, `qnfo-pdf`, `qnfo-ipatent` are request-driven sinks. Merging them
because they lack a cron would be a **downgrade**, not a consolidation. Correct criterion:
scheduled workers must produce a measurable outcome per firing; request-driven workers must serve
requests. Only G1–G4 are genuine consolidation candidates under that corrected test.
