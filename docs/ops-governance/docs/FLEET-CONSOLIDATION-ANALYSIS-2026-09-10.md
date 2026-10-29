# Fleet Consolidation Analysis — 2026-09-10

Source: qnfo-fleet-dashboard /api/state (per-script 24h analytics) + CF Workers API + health probes + worker_logs (qnfo-observability).
Fleet: 78 live workers (79 incl. deleted qnfo-system-health). 51 scheduled, 27 event-driven.

## Liveness gaps (24h req vs expected cron, dashboard lastRun)
- qnfo-venue-radar: last run 09-04 (6d) — daily cron, silent.
- personal-life-maintain: 09-04 (6d) — daily cron, silent.
- qnfo-research-radar: IDLE since 09-04 — superseded by cloud-ops jobResearchScan + research-supervisor.
- qnfo-blank-audit: 09-05; qnfo-impact: 09-06; qnfo-chat-canary: 09-06; research-daily-brief: 09-06.
- qnfo-analytics: 09-07 (2 req/24h). qnfo-twin-maintain: no lastRun. qnfo-idea-miner: 18/24 (underfiring).
- ERR: personal-api (2 err/24h), job-market-watch (1 err/1 req).
- Caveat: lastRun is GraphQL-attributed; fleet-calibrator showed 09-07 but its KV recs updated 09-10T03:01 (alive). Trace ingest (qnfo-observability) is the designed arbiter.

## Deprecation candidates
- qnfo-wrangler-test: test artifact, nocanon, 1042 -> DELETE.
- qnfo-chameleon: 1042, no cron, unknown purpose -> investigate/delete.
- qnfo-system-health: already deleted; purge stale registry/dashboard row.
- qnfo-research-radar: idle 6d, superseded -> deprecate or repurpose.
- qnfo-containers-pilot + qnfo-container-executor: cloudflare-containers pilot -> close or promote.
- qnfo-blank-audit / qnfo-auditor / qnfo-analytics: overlapping audit trio, near-idle -> merge.
- qnfo-ai-search: v1.0.2, mod 08-12 -> verify traffic; likely superseded by qnfo-ai RAG.

## Consolidation groups
1. Errata pipeline: errata-watch(:00) -> errata-respond(:15) -> errata-publish(:30) + errata-orchestrator => ONE worker, 3 cron offsets.
2. Idea pipeline: idea-miner(:00) + idea-triage(:00,*/10) + idea-factory => ONE worker (*/10).
3. Fleet-ops cluster: cloud-ops(16 crons), lifecycle(9), pipeline-ops, fleet-dashboard, fleet-advisor, fleet-deploy, fleet-calibrator, analytics, auditor, blank-audit, infra, impact, archive, backlog-exec, error-selfheal, kaizen, skill-sync => group into 4-5 workers (ops-digests, fleet-state+probes, audit, selfheal, kaizen).
4. Personal cluster (7): personal-api, twin-maintain, life-maintain, lifecycle, life-indexer, life-search, personal-events-radar => 3 workers (gateway, indexer, events).
5. Journal subsystem (4): jnl-watch, jnl-referee, jnl-reviser, jnl-zenodo => 2 workers.
6. Research scan layer: research-radar (deprecate), arxiv-radar, venue-radar, citation-watch, ddocs-indexer, research-supervisor => consolidate into research-supervisor + 2 radars.

## Same-minute cron collisions
:00 hourly: errata-watch, idea-miner, idea-triage, fleet-deploy. 17 * * * *: calendar-api, error-selfheal, observability.
0 4 * * *: archive, impact, twin-maintain, lifecycle. 0 6 * * *: paper-indexer, research-daily-brief, social.
30 6 * * *: intent-orchestrator, infra. 0 3 * * *: skill-sync, fleet-calibrator, lifecycle.
*/10: jnl-watch, idea-triage, research-exec. */15: fleet-dashboard, pipeline-ops.

## Observability gap (blocker for self-knowledge)
Logpush workers_trace_events -> R2 captures ONLY qnfo-memory-mcp events (566/566 rows). 77/78 workers invisible.
Root-cause hypotheses: (a) job created when memory-mcp was sole trace emitter; (b) logpush sampling/filter config;
(c) events only emitted for fetch events with trace context. Diagnose + fix so trace ingest covers the fleet.

## Target: 78 -> ~52 workers
Ecosystem chaining verified: personal-* (7) -> personal-life D1 + personal-api; QNFO research/publish/engagement -> living-paper + qnfo-audit + qnfo-outreach + qnfo-graph + portfolio-state D1s + R2/Vectorize; fleet-* -> qnfo-audit (ops brain). Unchained: wrangler-test, chameleon.
