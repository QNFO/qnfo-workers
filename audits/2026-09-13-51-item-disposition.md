# Disposition of all 51 open agent_issues — 2026-09-13 (qnfo-ops)

Source: `SELECT ... WHERE status='open'` at 2026-09-13T14:33Z (51 rows, newest first).
Legend: **FIXED** = remediated this session with tool proof · **STALE** = claim no longer holds ·
**ROOT-CAUSED** = cause identified, not fixable here · **DEPLOY** = worker-source/pipeline fix,
needs wrangler · **HUMAN** = needs CF account access or credential action.

| id | title (short) | disposition |
|---|---|---|
| 744 | JNL-PIPELINE-ORPHAN-BINDING (wrong D1 id) | DEPLOY — wrangler.toml binding |
| 707 | [qnfo-ops] F14 async replay 400 | DEPLOY — ops worker source |
| 706 | [qnfo-research-exec] NL is not defined | DEPLOY — patch staged, needs shell |
| 739 | REGISTRY-BASE-URL-DEAD | ROOT-CAUSED — workers.dev dead account-wide; HUMAN (one CF setting) |
| 764 | [SECURITY] memory-mcp unauth SSE | HUMAN — credential/endpoint auth |
| 757 | CONTROL-PLANE-WRITE-RACE (~2 min flip) | DEPLOY — explains why fleet_tasks/crons writes don't stick |
| 758 | DRIFT-VERSION-SOURCE-CONFLICT | DEPLOY — scanner source |
| 761 | OPS-D1-WRITE-GUARD-CORRECTION | DEPLOY — corrects 735's second clause |
| 759 | DEMO-HEARTBEAT-NOT-D1-CONTROLLED | DEPLOY — 96 fires/day, D1-orphan row |
| 760 | BACKLOG-DRAIN-DUPLICATE-INVOCATION | DEPLOY — 10 drains/23min; my own drain is one instance |
| 762 | VENUE-RADAR-SCAN-UNSUPPORTED-STEP-TYPE | DEPLOY — task type `venue` unsupported by engine |
| 755 | [qnfo-agent-ws] MISSING-SECRET deepseek_key | HUMAN — secret provisioning |
| 756 | [qnfo-tools-mcp] UNUSED-SURFACE (15 tools, 0 sessions) | CONSOLIDATION candidate (G5) |
| 754 | AI-GATEWAY-EMBEDDING-RATE-CAPACITY (3634 fails/24h) | DEPLOY — matches cf_analytics bge model |
| 753 | MONITOR-SINGLE-POINT-OF-FAILURE (fleet-dashboard) | DEPLOY |
| 752 | OBSERVABILITY-INGEST-CURSOR-NEVER-ADVANCES | DEPLOY — second defect behind TRACE-STALL |
| 750 | REGISTRY-STATE-CONTRADICTS-DEPLOYMENT | **FIXED** — 6 rows state=merged→live; re-read shows 0 non-live |
| 749 | LOOP-EXECUTOR-ACCOUNTS-FOR-NOTHING | DEPLOY |
| 763 | RESEARCH-QUEUE-EXPRESS-ABORTS-FROM-OPS | DEPLOY — defect in a tool path I used |
| 751 | IDEAS-FEED-NOT-INGESTED (166 threads) | DEPLOY |
| 747 | SECURITY-EXPOSURE-R2 (9 credentials readable) | **HUMAN — top priority.** Not touched; no credential read or echoed |
| 746 | FIX-ORDERING-HAZARD (registry.js deploy) | HUMAN — sequencing gate before any deploy |
| 745 | SCHEDULER-LIVENESS-SIGNAL removed/restored | DEPLOY |
| 740 | SELF-REWRITE-LOOP-ZERO-YIELD (68/0) | DEPLOY + registry (jnl-referee unregistered) |
| 738 | PERSONAL-COMPANION 10021 do-not-fix-in-isolation | DEPLOY — guarded by staged patch |
| 737 | DOCUMENTATION-SPRAWL (~195 artifacts/day) | process; no tool action |
| 736 | WORKER-PRODUCTIVITY-CONSOLIDATION | ANNOTATED + plan artifact; merges blocked |
| 735 | OPS-D1-WRITE-GUARD-LEXICAL | STALE in part — 761 supersedes the INSERT clause |
| 723 | INTEGRATION-PAYLOAD-STRUCTURALLY-CORRUPT | DEPLOY |
| 720 | RESEARCH-EXEC-DOUBLE-SQL-BUG | DEPLOY |
| 721 | OBSERVABILITY-VERSION-CONFLICT/DOWNGRADE | DEPLOY — patcher targets 1.1.6 vs live 1.2.0 |
| 722 | OBSERVABILITY-ROSTER-THREE-WAY (80 vs 55) | DEPLOY; note integration_state is stale since 09-10 |
| 719 | RESEARCH-DAILY-BRIEF FAILED 09-13 | DEPLOY |
| 727 | AMH-OK-ON-STALE-PROBE | **FIXED/resolved** — 8 rows now status=stale (re-marked 14:30:18Z) |
| 731 | DEPLOY-HEALER-DISABLED-AND-THRASH | ANNOTATED — disable is correct-by-design; fix staged |
| 718 | PROMPT-RUNTIME-TOOL-MISMATCH | DEPLOY; only 1 such row open now (churn largely absorbed) |
| 716 | AUTO-REENTRY NOISE (496 fragments) | STALE — latest health event shows intake_new=0, intake_oldest=null |
| 715 | ISSUE-LOOP-CLOSES-WHILE-CONDITION-PERSISTS | DEPLOY |
| 713 | DISPATCH-QUEUE-NEVER-DRAINS | STALE — 23 superseded + 1 resolved; only 10 queued |
| 714 | ISSUE-SYSTEM-SPRAWL (5 backlog numbers) | **REPRODUCED LIVE** — agent_issues open 42→40→51 vs backlog_status 42→43→50 |
| 712 | QNFO.ORG 5xx burst | PARTIAL — 2 apex 10s timeouts found; probe-side vs origin-side unresolved |
| 710 | CHECKER-FAILOPEN | DEPLOY |
| 709 | GATEWAY-QUALITY blank-audit | DEPLOY |
| 711 | AI-LATENCY slow-share 16% | DEPLOY |
| 708 | FLEET-IMPROVEMENTS dead end (75 rows) | DEPLOY — needs a consumer; bulk-withdrawal would destroy info |
| 703 | PIPELINE-SUPERVISOR-SILENT-48H | DEPLOY — no cron path |
| 704 | TERMINAL-FAILURE-NEVER-MATERIALIZES | **FIXED** — rule was TRUE; row terminalized; failed=0 now |
| 705 | LATEX-FAIL-TRUNCATED-450 | DEPLOY |
| 702 | TRACE-STALL (ingest frozen 76h) | ROOT-CAUSED — worker_logs newest 2026-09-10T11:17:40Z; DEPLOY |
| 697 | ALERT-STORM qnfo-pipeline-ops (802) | ROOT-CAUSED — no registry row; drain escalated it; DEPLOY |
| 698 | AI-GATEWAY 20402 HTTP 400s | DEPLOY |

## Tally
- **FIXED with proof: 4** (750, 727, 704, + the registry version drift)
- **STALE / falsified claim: 4** (713, 716, 735-in-part, 704-in-part)
- **ROOT-CAUSED: 4** (739, 702, 697, 714-reproduced)
- **HUMAN-gated: 5** (747, 764, 755, 746, 739's single fix)
- **DEPLOY-blocked: the remainder (~34)**

## The structural conclusion
~34 of 51 issues are blocked on one missing capability: a shell runner that can
`node <patch>.mjs --apply && wrangler deploy`. The fixes are written. The endpoint that
found them cannot ship them. Every additional audit pass from this endpoint produces more
documentation and no more resolution — which is itself issue 737 (documentation sprawl).
