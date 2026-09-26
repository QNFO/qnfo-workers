# FLEET-BUDGET (canonical, 2026-09-26) -- the consolidation wave plan

State machine: qnfo-audit.fleet_budget (cap/target/current per class) + fleet_drift_report BUDGET rows
+ self_heal_actions kind='node-budget' dispositions. Gate: qnfo-fleet-control 0.4.28-budgetgate.

## Wave plan (net-zero, evidence-gated; target 24 workers)
W1 MCP merge (4 -> 1): qnfo-tools-mcp + qnfo-skills-mcp + qnfo-memory-mcp + qnfo-ai-search -> qnfo-mcp
  multi-route worker. DRAIN: keep legacy workers 48h after client re-point; update DeepChat mcp-settings.json
  + DB enabled set. Evidence gate: legacy invocations ~0 for 24h, then disposeRetired.
W2 Watchtower merge (5 -> 2): qnfo-kaizen + qnfo-cloud-ops + qnfo-observability -> qnfo-watchtower;
  job-market-watch + qnfo-goal-author -> qnfo-intent-orchestrator (it already owns intent queueing).
  Evidence gate: per-route /health parity + cron consolidation (<=2 crons per hub).
W3 Verify-then-retire: qnfo-containers-pilot (migrate ShellContainer lessons -> docs, keep DO class until
  dependent code paths removed), qnfo-pdf (fold PDF build into qnfo-research-exec which already binds it),
  qnfo-ipatent (PRODUCT -- owner decision required before any retirement; ipatent.me zone has 0 DNS records).
W4 Storage pruning: vectorize qnfo-infra (3 vectors) + qnfo-ops-semcache (9 vectors) drop after consumer
  sweep; r2 buckets: archive/merge personal-media|play-the-ball|palimpsest-research (storage, not deploy
  surface -- mark, don't delete).

## Rules every wave must satisfy
- Never retire on invocation counts alone: check repo bindings (wrangler.toml + worker.js consumers) FIRST.
- CONSOLIDATION-VS-LIVE-FUNCTION-1: a cron-mediated worker's value is INDIRECT (distribution/digest/sync).
- Drain-then-dispose: re-point consumers, verify 24h of ~0 traffic, then disposeRetired (it re-checks).
- After each wave: service_registry == live scripts, drift_total 0, fleet_budget.current re-measured.
