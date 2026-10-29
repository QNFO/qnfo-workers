# QNFO FLEET RUNTIME CENSUS — 2026-09-10 (schedules + 7d activity + chains)

> Complements FLEET-TAXONOMY-2026-09-09 (code-evidence classification) with RUNTIME evidence:
> live cron schedules (CF API, all 78 workers), 7-day invocation counts (CF GraphQL
> workersInvocationsAdaptive 2026-09-03..10), cross-worker call edges (canonical repos), and
> repo-vs-fleet residue. Answers: do they all run daily? same-time collisions? feed chains?
> deprecated/obsolete? ecosystem chaining?

## Method
- Schedules: GET /accounts/{acct}/workers/scripts/{name}/schedules for all 78 live workers (2026-09-10).
- Activity: CF GraphQL workersInvocationsAdaptive, 7d window; total 80,527 requests.
- Chains: grep of canonical wrangler.toml + worker.js for workers.dev/internal/qnfo.org edges + D1/R2 bindings.
- Residue: repo dirs (qnfo-workers/) vs live fleet; GraphQL script names vs fleet.

## 1. Do they all run daily? NO — 52 scheduled, 26 event-driven
- 52 workers carry >=1 cron trigger; 26 have NO cron (pure HTTP/API or service-bound): jnl-reviser,
  jnl-zenodo, obsidian-writer, personal-life-search, qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-ai,
  qnfo-ai-search, qnfo-code-agent, qnfo-code-orchestrator, qnfo-container-executor, qnfo-containers-pilot,
  qnfo-email, qnfo-errata-orchestrator, qnfo-gateway, qnfo-idea-factory, qnfo-ipatent, qnfo-memory-mcp,
  qnfo-pdf, qnfo-proof, qnfo-qwav, qnfo-research-supervisor, qnfo-skills-discovery, qnfo-thread-ingest,
  qnfo-tools-mcp, qnfo-wrangler-test.
- Cadence spread: sub-hourly (jnl-watch */10, research-exec */10, pipeline-ops */15, fleet-advisor */20),
  hourly (errata watch/respond/publish, idea-miner/triage, calendar-api, error-selfheal), sub-daily
  (ddocs-indexer */2h, email-orchestrator */3h, events */6h, personal-life-indexer */12h), daily
  (archive, impact, twin-maintain, blank-audit, register-guard, intent-orchestrator, paper-indexer,
  research-daily-brief, social, venue-radar, infra, analytics...), weekly (job-market-watch Tue,
  events-radar Mon, outreach Mon-Fri, kaizen Mon, personal-events-radar Tue), monthly (osf-integrity-check
  1st, research-radar 1st+Sun, citation-watch 1st/15th, cloud-ops 3rd).
- qnfo-cloud-ops carries 22 cron triggers (ops job monolith); qnfo-lifecycle carries 9 (aggregator that
  re-fires jobs at 0 * / 0 3 / 0 4 / 0 6 / 0 7 / */30 etc. — same slots as other workers).

## 2. Same-time + feed-into-each-other (consolidation evidence)
Same cron slot collisions (live schedules):
- 0 * * * *: qnfo-errata-watch + qnfo-fleet-deploy + qnfo-idea-miner + qnfo-idea-triage + qnfo-lifecycle (5)
- */30 * * * *: qnfo-ai-calibration + qnfo-lifecycle + qnfo-ops (3)
- 0 3 * * *: qnfo-fleet-calibrator + qnfo-lifecycle; 0 4 * * *: qnfo-archive + qnfo-impact + qnfo-lifecycle
- 0 6 * * *: qnfo-intent-orchestrator + qnfo-paper-indexer + research-daily-brief + qnfo-social + qnfo-lifecycle
- 17 * * * *: calendar-api + qnfo-error-selfheal; 30 6 * * *: qnfo-chat-canary + qnfo-infra + qnfo-intent-orchestrator
Sequential feed chains (verified by code edges/purposes):
- ERRATA: qnfo-errata-watch -> qnfo-errata-respond -> qnfo-errata-publish -> qnfo-errata-orchestrator (4 workers, hourly stagger)
- JOURNAL: jnl-watch -> jnl-referee -> jnl-reviser -> jnl-zenodo (4 workers, stage pipeline)
- IDEAS: qnfo-thread-ingest -> qnfo-idea-miner -> qnfo-idea-triage -> qnfo-idea-factory (4; thread-ingest feeds idea-miner explicitly)
- CODE: qnfo-code-orchestrator -> qnfo-code-agent (2)
- CONTAINERS: qnfo-containers-pilot -> qnfo-container-executor (2)
- RADAR->OBSIDIAN: events-radar, personal-events-radar, job-market-watch, qnfo-research-radar -> obsidian-writer (sink)
- MEMORY-MAINTAIN x3 overlap (taxonomy F5): personal-life-maintain / qnfo-twin-maintain / qnfo-lifecycle all write agent_memories

## 3. Deprecated / obsolete / residue
- NO worker has zero invocations in 7d (all 78 >= 1). But 5 deleted scripts still emit (GraphQL
  "__unknown__" rows: 61+19+9+8+1 = 98 requests) — deleted-worker residue.
- Near-dormant (<10 invocations/7d): obsidian-writer 2 (event sink; consumers are weekly - keep),
  job-market-watch 3 (weekly cron - expected), qnfo-wrangler-test 3 (TEST LEFTOVER - delete),
  qnfo-arxiv-radar 8 (daily - expected), personal-life-maintain 8, qnfo-twin-maintain 8,
  qnfo-container-executor 9 (pilot).
- Orphan repo dirs (deleted workers, repos linger): conference-radar (superseded by events-radar per
  QNFO.OPS.009), funding, machine-readability, personal-lifecycle, qnfo-agent-advisor,
  qnfo-system-health, qnfo-web-unified + dup dirs calendar/papers. -> git rm + push.
- Stale registry: qnfo-fleet-dashboard registry.js still lists qnfo-system-health (0 5 * * *) which
  does not exist in the fleet; registry says 48 scheduled vs live 52 cron'd workers -> regenerate.
- qnfo-chameleon (M0 scaffold, deployed 09-09, /v1/render returns 501): deployed ahead of consumers -
  review (keep for M1 or delete until consumers exist).
- FLEET-TAXONOMY-2026-09-09 F3/F4 still open: 27 workers lack /health+VERSION; 12 lack canonical repo dirs.

## 4. Ecosystem chaining (all workers chained to research outputs?)
- QNFO research plane (~40): idea*/thread-ingest -> research-* -> jnl-*/errata-*/paper-*/pdf/venue-radar/
  citation-watch/arxiv-radar/ddocs-indexer -> social/outreach/email -> publications + dissemination
  (living-paper, qnfo-graph, Zenodo, R2 releases, papers.qnfo.org). CHAINED.
- Personal Twin plane (~7): personal-api, personal-life-indexer, personal-life-maintain,
  personal-life-search, personal-events-radar, qnfo-twin-maintain, obsidian-writer. CHAINED to personal KB.
- META/ops plane (~30, NOT chained to any research output): fleet-advisor, fleet-calibrator,
  fleet-dashboard, fleet-deploy, lifecycle, cloud-ops, infra, analytics, auditor, blank-audit,
  error-selfheal, register-guard, backlog-exec, pipeline-ops, events, ai-calibration, chat-canary,
  qnfo-ops, kaizen, skill-sync, skills-discovery, agent-orchestrator, agent-ws, code-agent,
  code-orchestrator, containers-pilot, container-executor, memory-mcp, tools-mcp, observability,
  chameleon, wrangler-test. This layer watches the other two layers - the overbuilt layer.

## 5. Consolidation tiers (78 -> ~50)
- T1 deprecate/cleanup (now): git rm 9 orphan repo dirs; delete qnfo-wrangler-test; regenerate
  fleet-dashboard registry; review qnfo-chameleon.
- T2 merge chains (next): errata 4->1; jnl 4->1; idea miner+triage 2->1; code pair 2->1;
  containers pair 2->1; radar family 7->2 (research-radar + personal-radar); memory-maintain 3->1
  (partition PERSONAL vs QNFO). Net -13 workers.
- T3 merge meta layer: fleet-advisor+calibrator+dashboard+deploy+analytics+auditor+blank-audit+
  lifecycle+infra+events+error-selfheal+register-guard+backlog-exec+pipeline-ops+cloud-ops (16) ->
  ~4 (scheduler hub, fleet dashboard, auditor, selfheal). Net -12.
- T4 coverage: 27 probe-gap workers get /health+VERSION; 12 repo-gap workers re-homed (FLEET-SELF-DOC-1);
  FLEET-MANIFEST regenerate.

## CLAIM-SHEET
| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| 52/78 workers carry cron triggers | live CF schedules API census, all 78, 2026-09-10 | High | Verified |
| All 78 workers ran >=1 invocation in 7d | CF GraphQL workersInvocationsAdaptive 09-03..10 (80,527 req) | High | Verified |
| 5 deleted scripts still emit (~98 req/7d) | GraphQL "__unknown__" rows x5 | Medium | Verified (names unknowable via this dataset) |
| Chain consolidations listed | repo edge grep + README purposes + taxonomy 09-09 | Medium-High | Verified per-chain; executor-level proof pending |
| 9 orphan repo dirs | repo dir list vs live fleet diff | High | Verified |
