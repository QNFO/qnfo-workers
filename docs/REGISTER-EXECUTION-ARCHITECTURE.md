# Register Execution Architecture (remediated 2026-09-09)

## Audit verdict (corrected)
**FAIL** on the literal claim "dated rows execute [via a scheduled worker]". The register
(`task_dod_register`, qnfo-audit D1) has detectors but no generic executor.

**Correction to the initial audit:** the claim of "5 open past-due rows" was a false positive
from a predicate bug — `due < datetime('now')` counts a date-only `due='2026-09-09'` (today) as
"overdue" via string-prefix comparison. The true count is **0 open rows past-due**
(`due < date('now')`). All 88 open rows are due today (5) or in the future (83).

## What actually executes register rows
- **Native-queue rows** (source_table = outreach_queue / version_queue / errata_actions /
  kaizen_candidates / agent_issues / social_threads / idea_proposals / research_queue / ...)
  are drained by their **owning domain worker's cron**, independently of the register
  (qnfo-outreach, qnfo-research-exec, qnfo-errata-*, qnfo-kaizen, qnfo-backlog-exec,
  qnfo-social, qnfo-idea-triage, ...). The register row mirrors the native row; it is closed
  lockstep by the agent or the domain worker.
- **Heterogeneous rows** (adr / decisions / quality-sweep / fleet-plan / codeparse-scope /
  handoffs / audit-note / governance / ...) have no domain worker and are executed by the
  **interactive DeepChat agent**, surfaced via cloud_ops_events -> daily brief.
- There is **no generic register executor, and there should not be one**: open-ended work
  (e.g. "Design COMMAND-REGISTRY") is not auto-executable by a worker.

## Remediation shipped
**qnfo-register-guard v1.0.0** (deployed 2026-09-09, cron `30 4 * * *`, D1 binding AUDIT->qnfo-audit):
- Relabels phantom `owner='scheduled-runner'|'fleet'` rows whose evidence cites NEITHER an
  executor (`executor=/worker=`) NOR a run trigger (`job=/cron=/schedule=/task=`) -> `owner='agent'`
  (the ledger stops claiming a scheduled executor that does not exist).
- Surfaces the overdue-open count via `cloud_ops_events` (kind=register-guard).
- Verified end-to-end: throwaway phantom row id=178 relabeled (relabeledIds=[178]), event
  written, test row deleted.

## Honest guarantee (replaces the false claim)
"Dated rows execute" -> **"Native-queue register rows are drained by their owning worker's
cron; heterogeneous rows are surfaced (overdue-guard + register-guard -> cloud_ops_events ->
daily brief) and executed by the interactive agent. The 'scheduled-runner' owner is kept
honest by qnfo-register-guard (relabeled to 'agent' when no executor is cited)."**

## Deprecation candidates (no /health probe -> cannot self-monitor; FLEET-PROBE-COVERAGE-1)
jnl-reviser, qnfo-code-agent, qnfo-code-orchestrator, qnfo-containers-pilot,
qnfo-container-executor, qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-proof, qnfo-idea-factory,
qnfo-ipatent, qnfo-email, qnfo-ai-search, personal-life-search, obsidian-writer

## Taxonomy method (full sweep = next phase, owner=agent)
Classify every worker: **executor** (owns a queue/state, closes rows) | **detector** (cron ->
digest/alert/event) | **display/gateway** (serves data/UI) | **self-serving** (no downstream
consumer). Deprecate or probe-cover the self-serving/zero-probe set.

## Taxonomy sweep result (REGISTER-TAXONOMY-SWEEP-1, #1623, 2026-10-01)
Executed against the 41 live scripts (Cloudflare workers list). The result is recorded in
`worker_output_contracts.worker_class` and `class_disposition` (migration
`2026-10-01-worker-taxonomy-sweep.sql`). The consumer evidence for each worker came from four sources:
- live workers that bind it as a service;
- live workers that call its URL;
- a public route or MCP client;
- live workers that read the tables it writes.

| Class | n | Workers |
|---|---|---|
| executor | 18 | errata-hub, qnfo-email-orchestrator, qnfo-agent-orchestrator, qnfo-social, q08-signal-engine, qnfo-deploy-guard, personal-companion, idea-hub, fleet-exec, qnfo-fleet-control, qnfo-paper-reviser, qnfo-research-exec, qnfo-backlog-exec, qnfo-intent-orchestrator, qnfo-ops, qnfo-paper-indexer, qnfo-email, qnfo-lifecycle |
| detector | 5 | qnfo-autonomy-scorer, ai-health-prober, qnfo-ai-calibration, qnfo-observability, qnfo-cloud-ops |
| display/gateway | 14 | qnfo-subscribers, qnfo-fleet-dashboard, calendar-api, qnfo-infra, qnfo-tools-mcp, personal-api, qnfo-ai-search, qnfo-memory-mcp, qnfo-archive, qnfo-gateway, qnfo-ai, qnfo-ipatent, qnfo-pdf, qnfo-containers-pilot |
| self-serving | 0 | none: every live worker has at least one consumer |
| retired | 7 | qnfo-fleet-feed, qnfo-proof (contracts kept, scripts not deployed); qnfo-venue-radar, qnfo-signal-loop (2026-10-05, #1756, scripts deleted, tables kept); qnfo-kaizen, qnfo-skill-sync, qnfo-outreach (2026-10-06, #1756, scripts deleted, tables kept) |

Two workers have no in-fleet consumer. Both are kept on external-consumer evidence:
- **qnfo-tools-mcp:** external MCP clients. It took 904 requests in 24h against a health-probe baseline of about 480.
- **qnfo-ipatent:** the public route ipatent.qnfo.org. Its 24h traffic is at the probe baseline, so it is re-evaluated
  if 30-day external traffic stays there.

Of the 15 zero-probe deprecation candidates above, all 5 that are still live now answer `/health` with 200 (probe-covered):
qnfo-containers-pilot, qnfo-agent-orchestrator, qnfo-ipatent, qnfo-email and qnfo-ai-search. The other 10 are no longer
deployed: 9 return 404, and qnfo-container-executor is absent from the account. The daily census (WORKER-CENSUS-DISCRIMINATING-1, qnfo-fleet-control) turns each contract's
`output_sql` into a productivity verdict.
