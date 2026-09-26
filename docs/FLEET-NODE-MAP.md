# FLEET-NODE-MAP (canonical, 2026-09-26)

Live census of the ENTIRE Cloudflare quniverse infrastructure (account edb167b78c9fb901ea5bca3ce58ccc4b).
Evidence: CF API same-turn reads (workers/scripts, d1, vectorize, r2, kv, queues, DO namespaces, pages,
zones+dns_records, rum site_info, ai-gateway, per-worker schedules+secrets). Registry: qnfo-audit.service_registry (38 live).

## Node inventory (12 classes, 117 named nodes)

| class | live | notes |
|---|---|---|
| workers | 38 | 25 modified TODAY (multi-session dev velocity) |
| cron schedules | 50 | across 28 workers; qnfo-lifecycle 8, fleet-control 5 |
| d1 databases | 10 | qnfo-audit 284MB, personal-life 50MB, living-paper 40MB |
| vectorize indexes | 9 | personal-life 154k vectors; qnfo-infra 3 + qnfo-ops-semcache 9 = prune candidates |
| r2 buckets | 19 | personal + fleet mixed |
| kv namespaces | 4 | |
| queues | 2 | qnfo-ops-jobs + dlq |
| durable object classes | 5 | ops AgenticOpsExec, personal PersonalTwinAgent, fleet FleetAdvisor, containers ShellContainer, agent-orchestrator AgentTask |
| pages projects | 7 | q08-archive, qnfo-landing, qnfo-hub, qnfo-publications, qwav-demo-bt-qec, ask-qwav, qwav |
| zones | 12 | 181 DNS records total (qnfo.org 71); ipatent.me has 0 records = FLAG |
| web analytics sites | 10-12 | one per zone |
| ai gateways | 1 | default + dedicated ops gateway; spend_limit monthly-150 |

Aux: 87 secrets across 24 workers (top: intent-orchestrator 11, ops 10, ai 9, fleet-control 7, tools-mcp 6).

## Traffic (30d, workersInvocationsAdaptive + infra_analytics)
total 436,747 requests / 330 errors. Top: qnfo-gateway 190,846 | qnfo-ai 37,524 | calendar-api 23,770 |
qnfo-ops 12,453 | fleet-exec 11,451 | qnfo-lifecycle 9,650 | qnfo-memory-mcp 6,937 | qnfo-email 6,172 |
qnfo-archive 5,543 | qnfo-paper-indexer 5,033 | qnfo-tools-mcp 5,263 | personal-companion 4,755 |
qnfo-deploy-guard 2,476 | qnfo-infra 2,340 | qnfo-containers-pilot 1,875 | qnfo-ipatent 572 | q08-signal-engine 54.

## Creep root-cause (why 30 -> 38 after the 2026-09-26 consolidation)
1. Creation-side default: each new feature ships as a NEW worker (fastest path; no registration barrier existed).
2. Consolidation cut LIVE functions (CONSOLIDATION-VS-LIVE-FUNCTION-1): qnfo-social (distribution amplifier,
   119 posted threads) and qnfo-observability were retired on invocation counts, then reinstated WITH new
   feature velocity (0.7.5->0.7.12, v1.2.10) -> net growth above baseline.
3. Registry absorbs live-but-unregistered workers (q08-signal-engine registered same-cycle).
4. Concurrent sessions: 25/38 workers modified TODAY by parallel agent sessions with no coordination gate.
5. The cap was enforced by CAMPAIGNS (57->30), not by a standing gate -> drift accumulates between campaigns.

## The cap (qnfo-audit.fleet_budget) and its enforcement
- Manifest seeded 2026-09-26, 12 classes (workers cap 30 / target 24, cron 48, d1 10, vec 10, r2 20, kv 5,
  queues 4, do 6, pages 7, zones 12, analytics 12, gateways 1).
- NODE-BUDGET-GATE-1 lives in qnfo-fleet-control 0.4.28-budgetgate (commits d250c28 + 1131276):
  scan()/optimizeFleet() refresh fleet_budget.current from the live script list and write a
  self_heal_actions disposition + fleet_drift_report BUDGET line whenever a class is >= cap.
  RUNTIME VERIFIED 2026-09-26 17:02Z: "BUDGET-OVER workers live=38 cap=30 (+8); cron_schedules cur=50 cap=48".
- NET-ZERO RULE: at/over cap, every NEW worker registration must name a same-class retirement.
- FAIL-LOUD: a blind gate (budget table missing) writes BUDGET-AUDIT-ERROR to the drift report.

## Solo-manageability verdict
30 workers is the largest state ever verified stable (drift 0); 38 demonstrably exceeds the verification
bandwidth (ghost deps, clobbered deploys, metric misdefinitions all clustered this week). Target band 20-24.
Constraint is NOT Cloudflare cost -- it is per-node contract surface: deploy+version+cron+registry+secrets
per worker, 50 crons, 87 secrets, 181 DNS records.
