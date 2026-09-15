# QNFO Quniverse — Autonomous Use Cases & Best Practices
**Version:** 2026-09-14 | **Gate:** AUTONOMY-PILLARS-1 | **Fleet:** 55 workers

## Architecture: Prompt → Autonomous Execution

User Prompt (any client: DeepChat/ChatBox/SannaBot/Android)
→ qnfo-ops (ops-exec v2.27.0) [server-side tool loop, no client handoff]
→ Fleet service bindings → D1/R2/KV/Vectorize/Zenodo/GitHub

## Implemented Use Cases (All Autonomous, All Server-Side, All Cloudflare)

### UC-1: Research Paper Generation
Trigger: User prompt or idea intake (idea-hub, signal-loop)
Chain: idea → research_queue → ground → ensemble (3 AI legs) → reconcile → review → verify → publish → Zenodo DOI
Workers: idea-hub, qnfo-research-exec, qnfo-containers-pilot, qnfo-paper-indexer
SLA: 4-6 hours end-to-end | Gate: QUALITY-GATE-1

### UC-2: Paper Revision (Adversarial Audit)
Trigger: Cron 37 */4 * * * or manual /run/scan
Chain: papers (published, 1 version) → adversarial audit → low-severity fixes → version_queue → drainV2 → Zenodo v2
Workers: qnfo-paper-reviser, qnfo-research-exec
Gate: REVISION-ALL-PUBLICATIONS-1 (>=2 Zenodo versions per paper)

### UC-3: Fleet Self-Healing
Trigger: fleet-control cron */20 * * * * or fleet-dashboard action board
Chain: scan → drift detect → self_heal_actions → execOne → service binding call → verify
FIX-5 (2026-09-14): Concrete chain remediation per issue category:
  - version-drain stuck → research-exec /run/drain-v2
  - revision-log stuck → paper-reviser /run/scan?mode=live
  - alerts-digest stuck → observability /run/ingest
  - research-queue stuck → research-exec /run

### UC-4: Idea Intake → Research Queue
Trigger: ideas.qnfo.org form, signal-loop L8 re-entry, radars
Chain: idea_proposals → idea-hub triage → research_queue (score-ranked) → research-exec
SLA: <10 min from intake to queued

### UC-5: Email Triage & Response
Trigger: Inbound SMTP → qnfo-email worker
Chain: emails → classification → processed/archived/spam → optional auto-reply

### UC-6: Outreach (ACTIVATION_AT 2026-09-15)
Trigger: Cron 0 11 * * 1-5 UTC — AUTONOMOUS, no per-instance approval
Chain: outreach_queue → qnfo-outreach → sends (cap 8/day global, 3/domain/day)
Kill switch: qnfo-outreach D1 pipeline_state.external_sends_enabled=0

### UC-7: Knowledge Graph Maintenance
Trigger: Paper publish events, signal-loop
Chain: paper publish → KG nodes/edges → qnfo-graph D1 → qnfo-memory-mcp
State: 8,346 nodes, 8,493 edges

### UC-8: Fleet Observability & Alerting
Trigger: Logpush (continuous) + cron 17 * * * *
Chain: workers_trace R2 → qnfo-observability ingest → worker_logs D1 → digest → alerts
Coverage: 55 workers, 30-day retention, anomaly detection (error ratio >50%)

### UC-9: Subscriber Digest
Trigger: Cron 0 16 * * 1 UTC (Mondays)
Chain: papers (new since last digest) → qnfo-subscribers → email to subscribed list
State: 1 subscriber, double opt-in enforced

### UC-10: AI Model Health Monitoring
Trigger: ai-health-prober cron (hourly)
Chain: probe all models → ai_model_health D1 → calibration guard → fallback routing
Current failing: llama-3.2-11b-vision, qwq-32b, glm-4.7-flash, deepseek-r1-qwen-32b (45s timeout)

## Best Practices Implemented (2026-09-14)

BP-1: Multi-Client Auth (FIX-6, ops-exec v2.27.0)
  - Three key slots: OPS_ROUTER_AUTH_KEY, OPS_ROUTER_AUTH_KEY_2, OPS_CLIENT_KEY
  - Timing-safe SHA-256 comparison for all slots
  - ChatBox/SannaBot: configure OPS_CLIENT_KEY as API key

BP-2: Ensemble Fallback (FIX-2, research-exec v0.9.0)
  - Primary: deepseek-v4-flash + glm-5.3 + kimi-k2.6
  - Fallback: deepseek-v4-flash + llama-3.3-70b-instruct-fp8-fast + gemma-3-27b-it
  - gwCall (gateway) as primary fallback leg

BP-3: Gate-Blocked Enrichment (FIX-3, research-exec v0.9.0)
  - enrichGateBlocked() runs before every drainV2 cycle
  - Fetches arXiv refs for slugs with empty bib
  - Root fix: version_queue.corrected_md = real body_md (not AI reasoning preamble)

BP-4: Auto-Rearm Failed Rows (FIX-4, research-exec v0.9.0)
  - markError() rearms research_queue rows up to 3 times
  - Terminal failure only after 3 rearms (recover_count >= 3)

BP-5: Concrete Self-Heal Actions (FIX-5, fleet-dashboard v1.6.4)
  - execTargetFor() maps each chain to its consumer endpoint
  - No more blanket "no-action; owner must inspect" for known chains

BP-6: Fleet Identity Integrity (FIX-7, fleet-control v0.4.18)
  - /health always reports actual deployed worker name + version
  - Ghost bindings removed from wrangler.toml

BP-7: Alerts Digest Correctness (FIX-8)
  - alerts.digested: NULL/empty/0 = undigested (TEXT vs INTEGER drift fixed)
  - observability v1.2.5: minute-unique digest ID (no hourly collision)

BP-8: RECURRENCE-ZERO-1 Enforcement
  - Every fix root-caused to mechanism, not symptom-patched
  - Permanent gates added, documented in commit messages + this file

## Failure Mode Registry

| Failure | Root Cause | Fix | Gate |
|---|---|---|---|
| version_queue gate-blocked (20 rows) | reviser writes AI reasoning preamble | enrichGateBlocked() + real body_md injection | drainV2 enrichment loop |
| research_queue failed 0/3 ensemble | glm-5.3 + kimi-k2.6 timeout (12 consecutive failures) | WRITER_FALLBACK_MODELS + gwCall | ai_model_health monitoring |
| self_heal no-action for chains | execTargetFor() had no mapping | FIX-5 concrete chain mapping | fleet-control execOne() |
| fleet-control wrong identity | qnfo-fleet-deploy code in fleet-control slot | FIX-7 WORKER constant | /health identity check |
| ops-exec 401 on ChatBox/SannaBot | authOk() only checked k1+k2 | FIX-6 OPS_CLIENT_KEY (k3) | authOk() 3-slot check |
| observability 89 errors/24h | digest() id collision (hour-granular) | INSERT OR REPLACE + minute-unique id | observability v1.2.5 |
| alerts 15 undigested | digested column TEXT/INTEGER drift | Direct D1 UPDATE + predicate fix | observability chain predicate |
