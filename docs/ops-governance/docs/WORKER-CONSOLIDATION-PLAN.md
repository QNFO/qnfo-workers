# WORKER CONSOLIDATION PLAN (2026-09-11)

> Audit basis: 81 Cloudflare Workers; all 81 probe ok (200) - consolidation is about REDUNDANCY, not dead workers.
> The registry purpose strings self-flag: 4 DEAD END + 3 MERGE candidate.

## PRUNE WAVE 1 (EXECUTED 2026-09-11) - 81 -> 77

| Worker | Reason (registry-flagged) |
|---|---|
| qnfo-code-agent | DEAD END: 8KB shell, zero in-fleet consumers |
| qnfo-code-orchestrator | DEAD END: superseded by workflow pattern |
| qnfo-container-executor | DEAD END: no consumers |
| qnfo-containers-pilot | DEAD END: no consumers |

Verified before delete: zero crons, zero external deps (only mutual), no service bindings pointing at them.
Deleted + service_registry.state = 'pruned-dead-end'.

## PRUNE WAVE 2 (candidates, need 1 verification each)

| Worker | Why | Blocker |
|---|---|---|
| qnfo-qwav | Legacy QWAV API, redundant with qnfo-memory-mcp (same tool surface + bindings) | DeepChat MCP config must drop qwav-platform first |
| qnfo-errata-orchestrator | Shell: 0 workflow instances, no own crons, stage workers (watch/respond/publish) do the work | Verify no HTTP callers |

## MERGE WAVES (safe sequence: build-new -> verify -> cutover -> delete-old)

| Wave | Workers | Merge into | Target |
|---|---|---|---|
| A fleet | fleet-advisor + fleet-calibrator + fleet-dashboard (all registry-flagged MERGE) | fleet-deploy (control plane) | 6 -> 2 (also scheduler -> executor) |
| B radars | events-radar, arxiv-radar, research-radar, personal-events-radar, job-market-watch, citation-watch | radar-hub (cron stages) | 6 -> 2 |
| C journal | jnl-watch + jnl-referee + jnl-reviser + jnl-zenodo (4-stage pipeline) | jnl (cron stages) | 4 -> 1 |
| D errata | errata-watch + errata-respond + errata-publish + orchestrator | errata (cron stages) | 4 -> 1 |
| E personal | personal-life-indexer + personal-life-maintain + personal-life-search | personal-life | 5 -> 2 (personal-api stays) |
| F idea | idea-factory + idea-miner + idea-triage | idea-intake | 3 -> 1 |
| G small | thread-ingest->idea-miner; impact+citation-watch; blank-audit+chat-canary; skills-discovery->skill-sync; register-guard+auditor; events+error-selfheal; scorecard->auditor; research-daily-brief->cloud-ops | various | 8 -> 0-2 |

## The constraint that makes merges candidates, not done (honest)

Deployed bundles are MINIFIED (esbuild, colliding short names like 'd'/'r'); naive concatenation breaks.
Merge mechanic: wrap each source in an IIFE namespace -> dispatch by route/cron in a combined export default ->
union bindings with name-collision check (AUDIT vs AUDIT_DB = same DB, keep both) -> deploy as NEW worker -> verify -> delete old.

## Projected

77 -> ~45-50 workers (35-40% reduction).
Synergy: fewer workers => the 28-worker service-binding self-rewrite coverage becomes a larger fraction of the fleet.
