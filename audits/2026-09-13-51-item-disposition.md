# Disposition of all 51 open agent_issues — 2026-09-13 (qnfo-ops)

**REV 2 — CORRECTED.** Rev 1 carried the retracted "workers.dev dead account-wide" root cause
for issue 739 and an over-strong deploy-blocked conclusion. Both are fixed below. The 51-row
snapshot is also **stale**: the live open count moved 42 → 51 → 59 during the session.

Source: `SELECT ... WHERE status='open'` at 2026-09-13T14:33Z (51 rows, newest first).
Legend: **FIXED** = remediated this session with tool proof · **STALE** = claim no longer holds ·
**ROOT-CAUSED** = cause identified · **DEPLOY** = needs a deploy runner · **HUMAN** = CF account
or credential action.

| id | title (short) | disposition |
|---|---|---|
| 744 | JNL-PIPELINE-ORPHAN-BINDING (wrong D1 id) | DEPLOY — wrangler.toml binding |
| 707 | [qnfo-ops] F14 async replay 400 | DEPLOY — ops worker source |
| 706 | [qnfo-research-exec] NL is not defined | DEPLOY — patch staged; FIX C precondition VERIFIED satisfied |
| 739 | REGISTRY-BASE-URL-DEAD | **ROOT-CAUSED, CORRECTED** — NOT dead account-wide. 6 of 9 names return 200; the real 530 cause is unrouted `*.qnfo.org` pretty-names (register 217). Defect is registry data (workers with `workers_dev` disabled), not routing |
| 764 | [SECURITY] memory-mcp unauth SSE | HUMAN — credential/endpoint auth |
| 757 | CONTROL-PLANE-WRITE-RACE (~2 min flip) | DEPLOY |
| 758 | DRIFT-VERSION-SOURCE-CONFLICT | DEPLOY |
| 761 | OPS-D1-WRITE-GUARD-CORRECTION | DEPLOY — corrects 735's second clause |
| 759 | DEMO-HEARTBEAT-NOT-D1-CONTROLLED | DEPLOY |
| 760 | BACKLOG-DRAIN-DUPLICATE-INVOCATION | DEPLOY — my own drain is one instance |
| 762 | VENUE-RADAR-SCAN-UNSUPPORTED-STEP-TYPE | DEPLOY |
| 755 | [qnfo-agent-ws] MISSING-SECRET | HUMAN — secret provisioning |
| 756 | [qnfo-tools-mcp] UNUSED-SURFACE | CONSOLIDATION candidate (G5) |
| 754 | AI-GATEWAY-EMBEDDING-RATE-CAPACITY | DEPLOY |
| 753 | MONITOR-SINGLE-POINT-OF-FAILURE | DEPLOY |
| 752 | OBSERVABILITY-INGEST-CURSOR-NEVER-ADVANCES | DEPLOY |
| 750 | REGISTRY-STATE-CONTRADICTS-DEPLOYMENT | **FIXED** — 6 rows merged→live, re-read shows 0 non-live |
| 749 | LOOP-EXECUTOR-ACCOUNTS-FOR-NOTHING | DEPLOY |
| 763 | RESEARCH-QUEUE-EXPRESS-ABORTS-FROM-OPS | DEPLOY |
| 751 | IDEAS-FEED-NOT-INGESTED | DEPLOY |
| 747 | SECURITY-EXPOSURE-R2 (9 credentials readable) | **HUMAN — top priority.** Not touched; nothing read or echoed |
| 746 | FIX-ORDERING-HAZARD | HUMAN — and see 786: mass-tombstoning 47 mirrors exceeds this hazard |
| 745 | SCHEDULER-LIVENESS-SIGNAL | DEPLOY |
| 740 | SELF-REWRITE-LOOP-ZERO-YIELD | DEPLOY + registry |
| 738 | PERSONAL-COMPANION 10021 do-not-fix-in-isolation | **CONFIRMED LIVE** — the hourly `v1.1.0→1.0.0` attempt is blocked ONLY by 10021 |
| 737 | DOCUMENTATION-SPRAWL | process |
| 736 | WORKER-PRODUCTIVITY-CONSOLIDATION | ANNOTATED + plan; merges blocked |
| 735 | OPS-D1-WRITE-GUARD-LEXICAL | STALE in part — 761 supersedes the INSERT clause |
| 723 | INTEGRATION-PAYLOAD-STRUCTURALLY-CORRUPT | DEPLOY |
| 720 | RESEARCH-EXEC-DOUBLE-SQL-BUG | DEPLOY |
| 721 | OBSERVABILITY-VERSION-CONFLICT/DOWNGRADE | DEPLOY |
| 722 | OBSERVABILITY-ROSTER-THREE-WAY | DEPLOY |
| 719 | RESEARCH-DAILY-BRIEF FAILED 09-13 | DEPLOY |
| 727 | AMH-OK-ON-STALE-PROBE | **FIXED** — 8 rows now `status='stale'` |
| 731 | DEPLOY-HEALER-DISABLED-AND-THRASH | ANNOTATED — disable correct-by-design; fix staged |
| 718 | PROMPT-RUNTIME-TOOL-MISMATCH | DEPLOY; only 1 such row open |
| 716 | AUTO-REENTRY NOISE | STALE — `intake_new=0`, `intake_oldest=null` |
| 715 | ISSUE-LOOP-CLOSES-WHILE-CONDITION-PERSISTS | DEPLOY |
| 713 | DISPATCH-QUEUE-NEVER-DRAINS | STALE — 23 superseded + 1 resolved; 10 queued |
| 714 | ISSUE-SYSTEM-SPRAWL | **REPRODUCED** — open 42→51→59 vs backlog 42→50→64; mechanism in 784 |
| 712 | QNFO.ORG 5xx burst | **ROOT CAUSE WAS RECORDED** — in `task_dod_register` 217, not here. Reproduced |
| 710 | CHECKER-FAILOPEN | DEPLOY |
| 709 | GATEWAY-QUALITY blank-audit | DEPLOY |
| 711 | AI-LATENCY slow-share 16% | DEPLOY |
| 708 | FLEET-IMPROVEMENTS dead end | DEPLOY — needs a consumer |
| 703 | PIPELINE-SUPERVISOR-SILENT-48H | DEPLOY — no cron path |
| 704 | TERMINAL-FAILURE-NEVER-MATERIALIZES | **FIXED** — rule was TRUE; row terminalized |
| 705 | LATEX-FAIL-TRUNCATED-450 | DEPLOY |
| 702 | TRACE-STALL | ROOT-CAUSED — `worker_logs` newest 2026-09-10T11:17:40Z |
| 697 | ALERT-STORM qnfo-pipeline-ops (802) | ROOT-CAUSED — no registry row; escalated by drain |
| 698 | AI-GATEWAY 20402 HTTP 400s | DEPLOY |

## Added after the 51-row snapshot
| id | title | disposition |
|---|---|---|
| **784** | AUDIT-FILER-IS-OPS — qnfo-ops audit loop is the runaway filer (70 of ~95 rows in 2h) | Filed with DoD |
| **786** | MIRROR-SHADOWS-CANONICAL — 47 of 55 workers resolve canonical from `deployed-current.worker.js` | Filed; 3 mirrors read directly, all live bundles |

## Tally
- **FIXED with proof: 4** (750, 727, 704, registry drift)
- **STALE / falsified: 5** (713, 716, 735-in-part, 704-in-part, 712's "not recorded")
- **ROOT-CAUSED: 5** (739-corrected, 702, 697, 714, 738-confirmed-live)
- **HUMAN-gated: 5** (747, 764, 755, 746, 739's registry-data fix)
- **DEPLOY-blocked: the remainder**

## Structural conclusion (revised)
**The deploy path is partially working.** `qnfo-backlog-exec` shipped twice on 2026-09-13 via
the R2 canonical path. What is blocked is the **GitHub** canonical path for the 47 workers
shadowed by a `deployed-current.worker.js` mirror (issue 786), plus every fix whose bundle
exceeds the 32,768-char read cap. The precise missing capability is a **manual
`workflow_dispatch`** of `.github/workflows/apply-staged-patchers.yml` — which exists, is
fail-closed, and whose FIX C precondition is verified satisfied — plus a human decision on the
heal flag that must first explain `healed=1` (now explained: backlog-exec).
