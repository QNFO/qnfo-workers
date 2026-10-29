# QNFO FLEET TAXONOMY — 2026-09-09 (code-evidence census of all 76 workers)

> Generated from same-turn code-evidence census (2026-09-09): local canonical sources under
> qnfo-workers/ + qnfo-ops/cloud/, per-worker signature extraction (VERSION, /health, scheduled
> handler, D1 bindings, tables written, fleet fetch edges). Purpose: classify every worker as
> EXECUTOR / DETECTOR / GATEWAY / DISPLAY / SUSPECT; decide common-framework integration
> (probe-coverage, repo re-homing, consolidation, deprecation). Feeds "all workers participate
> in a common framework or are deprecated" (standing directive).

## Category counts
EXECUTOR=30; GATEWAY=18; DETECTOR=16; INDEXER=3; ORCHESTRATOR=3; DISPLAY=2; SUPERVISOR=2; EXECUTOR(multi-job)=1; SERVICE=1 (n=76)

## Full classification (76)

| Worker | Category | /health+VERSION | Canonical repo | Shared store | Evidence note |
|---|---|---|---|---|---|
| calendar-api | EXECUTOR | + | + | CAL_DB | calendar->intents sync; called by personal-api + intent-orchestrator |
| events-radar | DETECTOR | + | + | RADAR_DB | venue/event radar; calls obsidian-writer |
| jnl-referee | EXECUTOR | + | + | AUDIT(jnl_*) | journal decision referee |
| jnl-reviser | EXECUTOR | - | + | AUDIT(partial) | journal revise loop; partial evidence (no VERSION) |
| jnl-watch | DETECTOR | + | + | AUDIT(jnl_polls) | journal polls |
| jnl-zenodo | EXECUTOR | - | + | none | journal Zenodo deposit; calls jnl-referee; partial |
| job-market-watch | DETECTOR | - | - | AUDIT(handoffs) | NO-HEALTH, no repo (manifest GAP); probe/re-home |
| obsidian-writer | EXECUTOR | - | - | none | no self-doc BUT consumed by events-radar + personal-events-radar; add /health+repo - do NOT deprecate |
| osf-integrity-check | DETECTOR | - | - | AUDIT(osf_check_log) | no /health, no repo |
| personal-api | GATEWAY | + | + | PERSONAL | personal twin API/RAG; core |
| personal-events-radar | DETECTOR | + | + | PERSONAL | personal venue radar -> obsidian-writer |
| personal-life-indexer | INDEXER | - | + | PERSONAL | files indexer (no VERSION) |
| personal-life-maintain | EXECUTOR | - | - | PERSONAL(agent_memories) | memory maintainer; OVERLAP twin-maintain/lifecycle |
| personal-life-search | GATEWAY | - | + | PERSONAL | personal semantic search |
| qnfo-agent-orchestrator | GATEWAY/EXECUTOR | + | + | AUDIT+papers | server-side agent exec (SERVER-SIDE-EXEC-GUARANTEE) |
| qnfo-agent-ws | GATEWAY | - | - | LIVING+GRAPH | agent WebSocket; probe gap |
| qnfo-ai | GATEWAY | + | + | AUDIT(ai_queries/chat) | AI chat gateway; CORE |
| qnfo-ai-calibration | DETECTOR/EXECUTOR | + | + | AUDIT(calib) | 30-min calibration sweeps of qnfo-ai/personal-api |
| qnfo-ai-search | GATEWAY | + | + | none | AI search (Vectorize) |
| qnfo-analytics | DISPLAY | + | - | AUDIT(analytics) | analytics; no repo (manifest GAP) |
| qnfo-archive | GATEWAY | - | + | LIVING | paper archive render |
| qnfo-arxiv-radar | DETECTOR | - | - | AUDIT(outreach_queue!) | arxiv -> outreach_queue; no /health/repo |
| qnfo-auditor | EXECUTOR/DETECTOR | + | + | AUDIT(issue_ledger) | auditor -> issues/errata_queue |
| qnfo-backlog-exec | EXECUTOR | + | + | AUDIT(agent_issues) | health backlog closer; register-aware |
| qnfo-blank-audit | DETECTOR | + | + | AUDIT(alerts) | blank gateway-response audit |
| qnfo-chat-canary | DETECTOR | + | + | AUDIT | chat endpoint behavioral verify; calls qnfo-ai |
| qnfo-citation-watch | DETECTOR | - | + | none(API) | citation sweep; no VERSION |
| qnfo-cloud-ops | EXECUTOR(multi-job) | + | + | AUDIT+5 D1 | 22-job ops engine incl gtd-guard/register; cron monolith |
| qnfo-code-agent | EXECUTOR | + | + | none | server-side code agent; called by code-orchestrator |
| qnfo-code-orchestrator | ORCHESTRATOR | + | + | AUDIT | code pipeline orchestrator -> qnfo-code-agent |
| qnfo-container-executor | EXECUTOR | + | + | none | on-demand container/python exec |
| qnfo-containers-pilot | ORCHESTRATOR | + | + | AUDIT | containers pilot; OVERLAP w/ executor |
| qnfo-ddocs-indexer | INDEXER | - | + | AUDIT | developer-docs indexer |
| qnfo-email | GATEWAY/EXECUTOR | - | + | AUDIT(emails) | email API AUTH-GATED; CORE; no /health |
| qnfo-email-orchestrator | EXECUTOR | + | + | OUTREACH | email/outreach cadence |
| qnfo-errata-orchestrator | ORCHESTRATOR | + | + | none | errata orchestration |
| qnfo-errata-publish | EXECUTOR | - | + | AUDIT(errata_actions) | errata -> new-version publish |
| qnfo-errata-respond | EXECUTOR | + | + | AUDIT | errata reply |
| qnfo-errata-watch | DETECTOR | + | + | errata_watch | inbound errata detector |
| qnfo-error-selfheal | EXECUTOR | + | + | AUDIT | CF GraphQL self-heal; closes agent_issues |
| qnfo-events | EXECUTOR | + | + | AUDIT(issue_*) | event/issue ledger ingest |
| qnfo-fleet-advisor | DETECTOR | + | + | AUDIT | fleet advisor findings |
| qnfo-fleet-calibrator | EXECUTOR | + | + | AUDIT(fleet_cal) | calibration across fleet endpoints |
| qnfo-fleet-dashboard | DISPLAY | + | + | AUDIT(fleet_dashboard_state) | dashboard; register display |
| qnfo-fleet-deploy | EXECUTOR | + | + | AUDIT(fleet_deploy*) | deploy reconciler; register-aware |
| qnfo-gateway | GATEWAY | - | - | LIVING+GRAPH | papers.qnfo.org DYNAMIC-D1 site; CORE; NO-HEALTH no repo |
| qnfo-idea-factory | GATEWAY | - | + | AUDIT(idea_proposals) | edge idea-intake web form |
| qnfo-idea-miner | EXECUTOR | - | - | AUDIT(idea_proposals) | chat-title miner; NO-HEALTH no repo |
| qnfo-idea-triage | EXECUTOR | + | + | AUDIT | idea -> research_queue triage |
| qnfo-impact | EXECUTOR | + | + | AUDIT(citation_stats) | impact scores |
| qnfo-infra | GATEWAY | + | + | AUDIT+5 D1 | infra MCP/status snapshot |
| qnfo-intent-orchestrator | EXECUTOR | + | + | AUDIT(intents) | intent queue engine |
| qnfo-ipatent | GATEWAY | - | + | IPATENT | ipatent app; partial evidence |
| qnfo-kaizen | DETECTOR/EXECUTOR | + | + | AUDIT(kaizen) | kaizen digest + weekly candidate disposition |
| qnfo-lifecycle | DETECTOR | - | + | AUDIT+3 D1 | lifecycle/memory maintain; OVERLAP personal-life-maintain/twin |
| qnfo-memory-mcp | GATEWAY | + | + | GRAPH+LIVING | MCP memory server |
| qnfo-ops | GATEWAY/EXECUTOR | + | + | AUDIT(ops_ai_log) | ops-exec gateway; DeepChat default; CORE |
| qnfo-outreach | EXECUTOR | + | + | OUTREACH+AUDIT | outreach engine |
| qnfo-paper-explainer | EXECUTOR | + | + | AUDIT(paper_explain) | paper explainer; writes agent_issues |
| qnfo-paper-indexer | INDEXER | - | + | LIVING | paper indexer; no VERSION |
| qnfo-paper-reviser | EXECUTOR | + | + | AUDIT(paper_revision) | adversarial revision loop |
| qnfo-pdf | SERVICE | + | + | LIVING(papers) | PDF render; called by research-exec |
| qnfo-pipeline-ops | SUPERVISOR | + | + | AUDIT | pipeline supervisor (15-min spv heartbeats) |
| qnfo-proof | GATEWAY | + | + | PROOF | proof ledger; calls qnfo-ops |
| qnfo-qwav | GATEWAY | - | + | LIVING | qwav web/API |
| qnfo-research-exec | EXECUTOR | + | + | AUDIT+LIVING+GRAPH | research publish drain; calls qnfo-pdf |
| qnfo-research-radar | DETECTOR | - | - | none | NO-HEALTH no repo (manifest GAP) |
| qnfo-research-supervisor | SUPERVISOR | + | + | AUDIT | research queue supervisor |
| qnfo-skill-sync | EXECUTOR | - | + | AUDIT | skills sync |
| qnfo-skills-discovery | GATEWAY | + | + | none | skills catalog browse |
| qnfo-social | EXECUTOR | + | + | AUDIT(social_threads) | Bluesky publisher; checker-heal |
| qnfo-thread-ingest | EXECUTOR | - | + | AUDIT(chat_sessions) | thread ingest |
| qnfo-tools-mcp | GATEWAY | + | + | AUDIT(mcp_log) | MCP tools server; calls qnfo-ai/infra/email |
| qnfo-twin-maintain | EXECUTOR | - | - | PERSONAL(agent_memories) | twin memory maintainer; NO-HEALTH no repo; OVERLAP |
| qnfo-venue-radar | DETECTOR | + | + | venue_radar | venue radar |
| research-daily-brief | EXECUTOR | - | - | OUTREACH(sent_log) | daily brief; NO-HEALTH no repo (GAP); CORE; calls qnfo-email.internal |

## Findings

### F1 — Register/common-framework aware (5)
qnfo-cloud-ops (gtd-reconcile + overdue-guard), qnfo-fleet-dashboard (display), qnfo-fleet-deploy (reconcile),
qnfo-backlog-exec (agent_issues drain), qnfo-register-guard (new honesty guard). All others are domain workers
that integrate via shared qnfo-audit D1 tables or fleet fetch edges, not via task_dod_register.

### F2 — True SELF-SERVING/isolated candidates (review for deprecation OR integration)
None of the 76 is fully isolated by evidence: every worker either writes a shared table (qnfo-audit family),
is fetched by a fleet peer, or serves a consumer-facing endpoint. The closest to isolated:
- obsidian-writer — no self-doc/version/repo BUT has 2 inbound consumers (events-radar, personal-events-radar): integrate (add /health + repo), do NOT deprecate.
- jnl-reviser / jnl-zenodo — new journal family, partial evidence (no VERSION, no local D1 usage): complete self-doc before relying on them.

### F3 — No /health+VERSION probe (27) — probe-coverage worklist
jnl-reviser, jnl-zenodo, job-market-watch, obsidian-writer, osf-integrity-check, personal-life-indexer, personal-life-maintain, personal-life-search, qnfo-agent-ws, qnfo-archive, qnfo-arxiv-radar, qnfo-citation-watch, qnfo-ddocs-indexer, qnfo-email, qnfo-errata-publish, qnfo-gateway, qnfo-idea-factory, qnfo-idea-miner, qnfo-ipatent, qnfo-lifecycle, qnfo-paper-indexer, qnfo-qwav, qnfo-research-radar, qnfo-skill-sync, qnfo-thread-ingest, qnfo-twin-maintain, research-daily-brief

### F4 — No canonical repo dir (12) — re-home per FLEET-SELF-DOC-1 or retire
job-market-watch, obsidian-writer, osf-integrity-check, personal-life-maintain, qnfo-agent-ws, qnfo-analytics, qnfo-arxiv-radar, qnfo-gateway, qnfo-idea-miner, qnfo-research-radar, qnfo-twin-maintain, research-daily-brief

### F5 — Consolidation candidates (overlap cluster: memory-maintain x3)
personal-life-maintain / qnfo-twin-maintain / qnfo-lifecycle ALL write agent_memories + memory_maintain_runs.
Recommend ONE owner (qnfo-twin-maintain is personal-twin; qnfo-lifecycle is the Ops maintainer; personal-life-maintain
is the earliest) — merge to a single memory-maintain worker or partition by plane (PERSONAL vs QNFO).

### F6 — CORE-but-unprobed (cannot deprecate; add probe+repo first)
qnfo-email (AUTH-GATED email API), qnfo-gateway (papers.qnfo.org site), research-daily-brief (daily brief),
qnfo-ai (core chat — probed OK), qnfo-agent-ws (agent WS).

### F7 — Radar family consolidation opportunity
qnfo-arxiv-radar, qnfo-research-radar, qnfo-venue-radar, qnfo-citation-watch, events-radar,
job-market-watch, personal-events-radar = 7 scanners with distinct sources/tables; a shared radar
framework would cut duplicate probe/reporting code — DESIGN candidate, not urgent.

## CLAIM-SHEET
| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| All 76 workers classified from code evidence | same-turn census over local sources (71) + dir-mapped (5) | High | Verified |
| No worker fully isolated; obsidian-writer has consumers | fetch-edge + table-write extraction | High | Verified |
| 3 memory-maintain workers overlap agent_memories/memory_maintain_runs | table-write extraction | High | Verified |
| 27 workers lack /health+VERSION probe | census probe flag | High | Verified |
