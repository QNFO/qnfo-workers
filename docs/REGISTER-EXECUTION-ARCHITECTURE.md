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
jnl-zenodo, jnl-reviser, qnfo-code-agent, qnfo-code-orchestrator, qnfo-containers-pilot,
qnfo-container-executor, qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-proof, qnfo-idea-factory,
qnfo-ipatent, qnfo-email, qnfo-ai-search, personal-life-search, obsidian-writer

## Taxonomy method (full sweep = next phase, owner=agent)
Classify every worker: **executor** (owns a queue/state, closes rows) | **detector** (cron ->
digest/alert/event) | **display/gateway** (serves data/UI) | **self-serving** (no downstream
consumer). Deprecate or probe-cover the self-serving/zero-probe set.
