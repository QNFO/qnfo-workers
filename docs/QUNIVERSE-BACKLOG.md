# Quniverse fleet backlog

Compiled 2026-09-30. Generated from `docs/backlog/quniverse-backlog-2026-09-30.json` by `scripts/render_backlog.py`; do not edit by hand.

**Mission.** Every recurring function runs in the cloud; the fleet operates, heals, audits, improves, publishes, and promotes itself; the human role is as narrow as possible. Progress is tracked with periodic autonomy scores under two frameworks (viable-system-model and observe-orient-decide-act).

**Where it lives.** Defects are open rows in `qnfo-audit.agent_issues` (source `backlog-mining-2026-09-30`, each with an owner, SLA and definition of done in `issue_triage`). Build-outs and the fleet-lessons gate audit are rows in `qnfo-audit.roadmap_implementation`. Pre-existing open issues were not re-filed; they are mapped in section 5.

## Summary

- New open issues filed: **20** (agent_issues 1676-1695).
- Roadmap build-outs: **63** (broken 1, gate-verify 5, not-built 25, owner-decision 11, partial 21).
- Fleet-lessons failure ledger audited: **49** entries (enforced-partial 5, enforced-unverified 15, enforced-verified 8, local-only 8, open 1, violated 9, violated-remediated 3).
- Pre-existing open issues mapped: **84**.

Roadmap coverage by VSM system: S1 16, S2 4, S3 20, S3* 4, S4 7, S5 12. By OODA stage: act 34, decide 12, observe 7, orient 10.

## 1. New open issues (not built, not working, or not autonomous)

| # | Issue | Priority | Owner | VSM | Definition of done |
|---|---|---|---|---|---|
| 1676 | **SEC-EXPOSED-CREDENTIALS-UNROTATED-1**: Three endpoint keys (ops, qnfo-router, personal) remain in the git HISTORY of the public QNFO/qnfo-ops repo (redacted in HEAD 2026-09-30) and the Cloudflare API token sits in a private snapshot plus local client configs (handoffs 29784-29792). Rotation was deferred to 2026-10-03 because it breaks 7 workflows on OPS_ROUTER_AUTH_KEY, 35 on CLOUDFLARE_API_TOKEN and the mobile/desktop clients, so it needs a coordinated window; the CF token rotation is identity-bound (account owner). | critical | deepchat-security | S3* | All 4 credentials rotated; GitHub secrets and clients updated in the same window; each old value returns 401; optional history rewrite after rotation. |
| 1677 | **SEC-CONTAINERS-PILOT-SHELL-STATIC-TOKEN-1**: qnfo-containers-pilot exposes a full Linux shell on the internet behind a single static PILOT_TOKEN with no Access policy and no rate limit (handoffs 29786/29787, due 2026-10-06). | high | qnfo-fleet-control | S3* | Access service-token or rate-limit rule in front of /exec; token rotation path documented; unauthenticated probe returns 403. |
| 1678 | **SEC-MEMORY-MCP-UNAUTHENTICATED-1**: qnfo-memory-mcp (7,279 requests/30d) serves without authentication (handoff 29784). | high | qnfo-memory-mcp | S3* | Bearer or OAuth required; unauthenticated probe returns 401; all clients updated and verified. |
| 1679 | **AUTONOMY-SCORES-NOT-PERIODIC-1**: Mission 2.1 requires periodic VSM and OODA autonomy scores. autonomy_scores rows were last written 2026-09-10 (s1_operations) to 2026-09-24 (composite 3.6); qnfo-autonomy-scorer was recreated 2026-09-30T18:09Z and has 0 invocations in 24h. No dimension has been rescored for 6+ days, so the fleet's self-tracking against its mission is stale. | high | qnfo-autonomy-scorer | S3 | Scorer writes every VSM S1-S5, OODA and composite row at least daily; dashboard flags any dimension older than 48h; survival_state.sai mirrors the composite. |
| 1680 | **OPS-AGENT-TOOL-BUDGET-INCOMPLETE-1**: ops_ai_log holds 30+ owner turns on 2026-09-29/30 that end 'INCOMPLETE: ... tool budget exhausted'; the 300s interactive loop cannot finish multi-step remediation and the durable path cancels 40 of 68 jobs (#1624). The owner asked repeatedly to 'fix tool budget exhausted systemwide'. | high | qnfo-ops | S1 | Tasks that exceed the interactive budget auto-promote to a durable Workflow with checkpointed continuation; fewer than 5% of owner turns end INCOMPLETE on budget over 7 days. |
| 1681 | **WORKERS-AI-SPEND-UNATTRIBUTED-RISING-1**: Workers AI used 5.57M neurons/30d (about $58 at list price vs the <= $7.50 gate) and 258k neurons in the last 24h (about $85/30d pace). aiInferenceAdaptiveGroups has no scriptName dimension and binding calls bypass AI Gateway logs, so spend cannot be attributed to a worker (fleet-telemetry-probe 2026-09-30). | high | qnfo-fleet-control | S3 | Every Workers AI call carries a per-worker attribution (AI Gateway cf-aig-metadata or an Analytics Engine meter); a per-worker neuron table refreshes daily; the top-3 spenders are reduced. |
| 1682 | **AI-HEALTH-PROBER-PING-COST-1**: ai-health-prober pings 10 large models every 20 min (720/day) including reasoning @cf/zai-org/glm-5.3 at about 300 neurons per ping, and probes @cf/deepseek-ai/deepseek-v4-pro-0813 twice per run under two internal names. The probe minute slots carried 16% of 24h Workers AI neurons (41.8k of 257.8k) on 2026-09-30. | medium | ai-health-prober | S3 | Health derived from catalog availability or a 1-token non-reasoning ping; duplicate ids removed; cadence hourly plus on-failure; probe-slot neurons below 2% of total. |
| 1683 | **AI-SPEND-OVER-CAP-ALL-PROVIDERS-1**: Gateway-metered 7d cost (GraphQL aiGatewayRequestsAdaptiveGroups): gpt-5.5 $82 (879 req), deepseek-v4-pro $46 (3,363 req), deepseek-flash $41 (21,614 req), about $173/7d. The $150/30d spend limit governs unified billing only; BYOK DeepSeek bypasses it. Objective 2.3 targets about $110/month. | high | qnfo-ops | S3 | Per-provider caps including BYOK; one unified monthly cost_usd across all providers; agent-session gpt-5.5 traffic routed per business plan Phase A; 30d spend <= $150. |
| 1684 | **DEEPSEEK-FLASH-CALLER-UNKNOWN-1**: 21,614 requests/7d to model id 'deepseek-flash' on gateway 'default'; no worker in QNFO/qnfo-workers references that id, so the caller is unidentified (external client or dynamic route). | medium | qnfo-ops | S3 | Caller identified from gateway log metadata; traffic attributed to an owner or blocked. |
| 1685 | **EMAIL-CALENDAR-INTAKE-UNPROVEN-1**: Paper 3.5 and Appendix A: the email-to-calendar intake is 'built rather than proven'. event_inbox still holds 0 rows ever (2026-09-30). | medium | calendar-api | S1 | A synthetic forwarded invite produces a calendar row and a reminder end to end; a weekly synthetic canary keeps it proven. |
| 1686 | **GUARDS-LOCAL-ONLY-1**: prompt-store-verify, adversarial-guard, scheduler-guard and model_guard run only on the local machine (handoffs 29769/29773; fleet_improvements 1569 in_progress). Sessions without a local shell skip them, contradicting 'every recurring function runs in the cloud'. | high | qnfo-ops | S3 | Server-side scheduled runner (container or CI) executes all four; results land in D1; a failing guard files an issue. |
| 1687 | **LOCAL-MAINTENANCE-RESIDUE-1**: Local-only scripts still carry recurring duties: local-config-selfheal.py re-asserts app/mcp settings each cycle, deepchat_boot_guard.py, backup_deepchat.py (handoffs 29752/29765; THIN-CLIENT-MIGRATION-SPEC-v2 residue). Paper 3.7 claims zero enabled local recurring jobs. | medium | deepchat-ops | S2 | Inventory of local recurring jobs is 0, or each remaining job is documented as identity-bound with a cloud fallback. |
| 1688 | **RETIREMENT-USAGE-SIGNAL-DEGENERATE-1**: worker_invocations holds about 1 row, so the fail-closed consolidation guard disables automatic retirement (handoff 29763). The fleet cannot move from 39 live workers toward target 36 or the <= 28 survival gate without a real per-worker usage source. | medium | qnfo-fleet-control | S3 | disposeRetired and consolidation read 30d per-script requests from GraphQL workersInvocationsAdaptive (already measured by fleet-telemetry-probe) plus live-consumer proof (lessons F1/F2). |
| 1689 | **IDEA-TRIAGE-CONSUMER-ABSENT-1**: 19 idea_proposals are status=new and the producer has been silent since 2026-09-24. qnfo-idea-triage is no longer deployed, and worker_consolidation still lists idea-hub vs qnfo-idea-triage as ASSESS. | medium | idea-hub | S2 | A live consumer drains new ideas to research_queue or rejects each with a reason; the chain probe shows consumer progress. |
| 1690 | **SURVIVAL-STATE-SAI-NULL-1**: survival_state.sai is NULL; the composite SAI in autonomy_scores is not mirrored (handoff 29764). | low | qnfo-fleet-dashboard | S3 | sai written on every evaluation from the latest composite, with its scored_at. |
| 1691 | **CRON-DECLARED-EXCEEDS-PLATFORM-1**: Declared schedules exceed what the platform registers (ops session 2026-09-30: '21 declared triggers cannot fit' the per-Worker trigger limit), fleet_budget cron_schedules sits at cap 50/50, and fleet-exec alone fires 1,440/day ('* * * * *', 52% of all fires; worker_consolidation CRON-REDUCE PLANNED). Paper C5: declared vs live divergence. | high | fleet-exec | S2 | One dispatcher cron plus the D1 fleet_crons table as the single schedule truth; every declared trigger registered or folded into the dispatcher; fleet-exec at */5. |
| 1692 | **DISTRIBUTION-VOLUME-COLLAPSE-1**: social_media_posts has 1 row in the last 30 days (last 2026-09-27) while 10 full reports were published; metric distribution_posts_30d = 1. Paper F1 and 6.5 require distribution to stay load-bearing and monitored end to end. | high | qnfo-social | S1 | Every publication emits at least one queued post; queue drain monitored; alert when posts_30d < publications_30d. |
| 1693 | **PATCH-ARTIFACTS-UNRECONCILED-1**: The repo carries PATCH diff artifacts with no recorded disposition: qnfo-ops PATCH-2026-09-22-attachment-empty-guard, PATCH-2026-09-26-attachment-guard-xml-form-and-telemetry-hours, PATCH-2026-09-27-registry-capability-preserve, PATCH-2026-09-30-output-cap-decoupling (#1531), aigw-routing.patch; qnfo-fleet-dashboard PATCH-2026-09-30-outreach-gate-derive. | medium | qnfo-ops | S2 | Each diff is either verified applied (marker present on main and live) and deleted, or rejected with a reason. |
| 1694 | **LEGACY-PM-TASKS-UNRECONCILED-1**: The legacy tasks table holds 178 non-done rows from the July PM bootstrap (152 Backlog, 24 To Do, 2 In Progress), including 24 templated 'Audit <project> state and execute next phase' P0 rows and duplicate WBS rows. Nothing consumes them and they are invisible to the dashboard inventory. | low | qnfo-fleet-control | S2 | Every row migrated to task_dod_register or roadmap_implementation, or closed with a reason; the table becomes read-only. |
| 1695 | **CAPABILITY-CATALOG-STATUS-WRONG-1**: cloudflare_capability_catalog marks D1, R2, KV, Durable Objects, Queues, Cron Triggers, Vectorize, Workflows and Workers as not_considered although all are in use; only Workers AI is in_use. Residual of the product loop tracked in #1675. | medium | qnfo-fleet-control | S4 | Catalog status synced from live bindings/resources daily; in-use products read in_use. |

## 2. Roadmap build-outs

### 2.1 Autonomy gaps (mission, VSM, OODA)

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-S2-EVENT-DRIVEN-1 | not-built | S2 / act | qnfo-fleet-control | Event-driven coordination: Queues-based producer->consumer chaining (research, version, outreach, errata, issues) replacing time-triggered polling, with per-chain controllers | paper 2.2/6.6; autonomy_scores s2_coordination gap |
| RM-OODA-DEPLOY-LATENCY-1 | partial | S1 / act | qnfo-ops | Deploy-class act latency days -> minutes: canonical deploy on merge is live; remaining: agent-authored fixes open PRs and auto-merge when every gate is green | paper 6.6; autonomy_scores ooda_closure gap |
| RM-PROBE-VERIFIED-COVERAGE-1 | partial | S3 / observe | qnfo-fleet-dashboard | Verified probe coverage: content assertions (not only HTTP 200) for all 39 workers; cron-only workers via heartbeat (fleet_heartbeat holds 3 rows) | paper 6.6; kaizen kc-20260908-fleet-probe-coverage |
| RM-MONITOR-THE-MONITORS-1 | not-built | S3 / observe | qnfo-fleet-control | Monitor the monitors: every monitor and cron writes a heartbeat; a meta-watchdog flags any monitor silent longer than 2x its cadence | paper 4.2.3 (open gap) |
| RM-S1-REDUNDANCY-1 | partial | S1 / act | qnfo-ops | S1 redundancy: failover host and read-only degraded mode for the single ops gateway; workers.dev fallback added 2026-09-30 | autonomy_scores s1_operations gap 'no redundancy / single ops gateway' |
| RM-S4-BENCHMARK-1 | not-built | S4 / orient | qnfo-ai-calibration | S4 intelligence battery from n=8 to a SWE-bench Pro / Terminal-Bench subset, scored weekly | autonomy_scores s4_intelligence gap |
| RM-S5-RATIFICATION-SURFACE-1 | owner-decision | S5 / decide | owner | Owner ratification surface (email verb and dashboard) for the 7 pending objective revisions, with expiry and recorded decision | goals: 7 proposed vrev-* objective revisions |
| RM-NOVEL-FAILURE-REPAIR-1 | partial | S3 / act | qnfo-fleet-control | Scripted repair for novel failure classes: failure-class -> remediation_modules library with automatic dispatch and verification | autonomy_scores self_healing gap; paper 2.2 |
| RM-WATCHMAKER-INDEX-1 | not-built | S5 / orient | qnfo-fleet-control | Publish a daily watchmaker index (count of recurring operations that still need a human), target 0 | paper 6.8 |
| RM-DURABLE-AGENT-EXECUTION-1 | not-built | S1 / act | qnfo-ops | Durable multi-step agent execution on Workflows with checkpointed continuation (removes tool-budget exhaustion as a failure class) | ops_ai_log INCOMPLETE turns; #1624 |
| RM-CODE-ORCHESTRATOR-1 | not-built | S1 / act | qnfo-ops | Autonomous self-verifying cloud code agent: plan -> branch edit -> container verify -> iterate -> PR | qnfo-ops/docs/CODE-AGENT-ORCHESTRATOR-SPEC.md (spec-only 2026-09-06) |

### 2.2 Cost and efficiency (paper 6.3)

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-COST-L5-DISTILLATION-1 | not-built | S3 / act | qnfo-ops | L5 distillation: exemplar bank / Workers AI LoRA for recurring task classes | routing_policy L5 ABSENT; paper 6.3 |
| RM-COST-L6-DRAFT-VERIFY-1 | partial | S3 / act | qnfo-ops | L6 formal draft-verify pipeline (free draft, paid verify/repair) beyond the code class | routing_policy L6 PARTIAL |
| RM-COST-PREFIX-CACHE-1 | partial | S3 / act | qnfo-ops | Realize provider prompt/prefix caching (cache_read_tokens is 0 today) | routing_policy CTX PARTIAL (cache_read_tokens=0) |
| RM-COST-PER-TASK-ALL-PATHS-1 | partial | S3 / orient | qnfo-fleet-control | Cost per successful task by class across every AI path (research ensemble, q08, kaizen, calibration), not only qnfo-ops | paper 6.3; goals cost-routing-stack-l0l7 |
| RM-COST-UNIFIED-SPEND-1 | partial | S3 / orient | qnfo-fleet-control | One unified monthly cost_usd: gateway unified billing + BYOK providers + Workers AI + Cloudflare plan | goals external-impact-per-dollar DoD (a) |
| RM-COST-FREE-FIRST-PARITY-1 | gate-verify | S3 / orient | qnfo-fleet-control | Audit every AI-calling worker for one cost policy per path (streaming vs non-streaming, cron vs manual, agent final round) | paper B5/5.5 |

### 2.3 Smaller verified core (paper 6.1)

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-CONSOLIDATION-WAVE-B-1 | partial | S3 / act | qnfo-fleet-control | Finish consolidation: 7 QUEUED merges due 2026-10-04 (observability, dashboard, kaizen, ai-calibration, backlog-exec -> fleet-control; lifecycle -> fleet-exec; skill-sync -> tools-mcp); resolve BLOCKED-PROOF (infra, agent-orchestrator, ai-search, containers-pilot) and DEFERRED (errata-hub, radar-hub) | worker_consolidation QUEUED/BLOCKED-PROOF/DEFERRED; task_dod 365 |
| RM-FLEET-BUDGET-WAVES-1 | not-built | S3 / act | deepchat-reorg | Fleet budget waves W1-W4: MCP 4->1 (qnfo-mcp), watchtower 5->2, verify-then-retire (containers-pilot, pdf), storage prune (vectorize qnfo-infra/ops-semcache) | reorg_work_queue 24-27 (due 2026-10-18) |
| RM-DEAD-PROBES-VERIFY-1 | gate-verify | S3 / act | qnfo-fleet-control | Close the dead-probe deletions (size-semantics-probe-a/b, qnfo-egress-probe, qnfo-ops-ledger-selftest: already absent from the live list) and dispose qnfo-email-orchestrator (still live) with live-consumer proof | reorg_work_queue 67-71 |
| RM-REPO-DEAD-SOURCES-1 | not-built | S3 / act | qnfo-fleet-control | Archive the 65 never-deployed or retired worker directories under archive/ with a manifest (smaller verified core) | worker_live_audit: 65 NOT_DEPLOYED + 9 NOT_A_WORKER repo dirs |

### 2.4 Funnel, distribution and external impact (paper 6.5, business plan)

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-FUNNEL-E2E-MONITOR-1 | not-built | S1 / observe | qnfo-fleet-control | End-to-end funnel monitor: publication -> deposit -> page -> social -> pageviews -> subscribe, per-stage counters and alerts | paper 6.5 and 4.2.3 |
| RM-SUBSCRIBE-CTA-1 | not-built | S1 / act | qnfo-subscribers | Subscribe CTA and landing on papers.qnfo.org and qnfo.org wired to double opt-in | docs/BUSINESS-PLAN.md Phase B.1 (1 subscriber) |
| RM-PREMIUM-DIGEST-1 | owner-decision | S5 / decide | owner | Premium research digest ($10/mo) product line (depends on NO-PAYMENT-RAIL-1 #1616) | docs/BUSINESS-PLAN.md Phase B.1 |
| RM-IPATENT-B2B-1 | owner-decision | S5 / decide | owner | ipatent.me patent analytics B2B pilot with 5 users | docs/BUSINESS-PLAN.md Phase B.2; #1648 |
| RM-BESPOKE-REPORTS-1 | owner-decision | S5 / decide | owner | Bespoke research reports offered through warm outreach replies (12 replied) | docs/BUSINESS-PLAN.md Phase B.3 |
| RM-BUFFER-MULTICHANNEL-1 | owner-decision | S5 / decide | owner | Decide multi-channel distribution (LinkedIn/X/Mastodon via Buffer, BUFFER_TOKEN unprovisioned) vs own-pages-only rule | docs/AUTONOMOUS-RESEARCH-PIPELINE.md s4 vs BUSINESS-PLAN standing rule 'no social media' |
| RM-SEO-INDEXNOW-JSONLD-1 | gate-verify | S1 / act | qnfo-research-exec | Verify IndexNow ping per publication and Schema.org ScholarlyArticle JSON-LD on every paper page | docs/AUTONOMOUS-RESEARCH-PIPELINE.md s4 (T6) |
| RM-CITATION-TRACKING-ALL-DOIS-1 | partial | S4 / observe | qnfo-paper-indexer | Daily Crossref/OpenAlex/Zenodo impact collection for all 217 DOIs feeding impact_scores | docs/AUTONOMOUS-RESEARCH-PIPELINE.md s5; citation_stats 3,604 rows, impact_scores 81 |

### 2.5 Research products and the original program visions

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-VISION-ASK-QWAV-1 | partial | S1 / act | qnfo-ai | Ask QWAV: public natural-language research oracle (RAG over the 34,657-vector research index) | tasks GH-P3-081, GH-HND-093 |
| RM-VISION-LIVING-PAPER-1 | not-built | S1 / act | qnfo-archive | Living Paper: interactive publications (clickable equations, AI chat, parameter playgrounds) | tasks GH-P3-082; #1643 paper-explain dead |
| RM-VISION-QWAV-SCAN-1 | broken | S4 / observe | radar-hub | QWAV-SCAN: arXiv scraper + classifier + daily digest (radar family dormant 20-27 days) | tasks GH-P3-083; #1642/#1653 radar family dormant |
| RM-VISION-CONSISTENCY-ENGINE-1 | not-built | S4 / orient | qnfo-paper-indexer | Cross-paper consistency engine: contradictions, redundancies, missing citations across 906 papers | tasks GH-P3-084/092; #1651 |
| RM-VISION-ULTRAMETRIC-PLAYGROUND-1 | not-built | S1 / act | qnfo-archive | Ultrametric playground web app (ultrametric geometry, p-adic valuations, fault-tolerance simulation) | tasks GH-P3-085 |
| RM-VISION-CONCEPT-GRAPH-1 | partial | S4 / orient | qnfo-memory-mcp | Concept graph navigator over the 8,349-node KG (Durable Objects + interactive visualization) | tasks GH-P3-086 |
| RM-VISION-REPRODUCE-BUTTON-1 | not-built | S3 / act | qnfo-containers-pilot | Reproducibility as code: a Reproduce button per computational claim via Sandbox/Containers | tasks GH-P3-087 |
| RM-VISION-AUTO-PEER-REVIEW-1 | partial | S3 / orient | qnfo-research-exec | Automated peer review as a pre-submission service (review stage exists internally only) | tasks GH-P3-088 |
| RM-VISION-COMPUTE-CLOUD-1 | not-built | S1 / act | qnfo-containers-pilot | QWAV compute cloud: browser-run ultrametric embeddings, p-adic valuations, LoF reductions | tasks GH-P3-089 |
| RM-VISION-AGENT-SWARM-1 | partial | S1 / act | qnfo-research-exec | Agent swarm: Explorer/Synthesizer/Verifier/Publisher/Curator role agents running 24/7 | tasks GH-P3-090; #1638 QACP unbuilt |
| RM-VISION-UNIFIED-PLATFORM-1 | partial | S5 / decide | owner | qnfo.org as the unified AI-native research platform integrating the 11 visions | tasks GH-P3-091 |
| RM-QUALITY-REVISION-WAVE-1 | partial | S1 / act | qnfo-paper-reviser | Revise/expand all research papers with ensembles, iterations and feedback loops (zenodo_versions_per_flagship 1 vs >= 2) | kaizen kc-20260908-quality-revision-wave (user directive); #1621 |
| RM-RESEARCH-BROWSER-QUEUES-1 | not-built | S2 / act | qnfo-research-exec | Research pipeline v0.1 on Queues + Browser Run (rendered-source grounding) | tasks GH-HND-096 |
| RM-RADAR-WORKFLOWS-PILOT-1 | not-built | S2 / act | radar-hub | Workflows pilot on conference-radar / research-daily-brief | handoff 28852 (OPS.008 Phase 2) |
| RM-ADAPTIVE-SUGGESTIONS-1 | owner-decision | S4 / orient | owner | Adaptive suggestion engine wave 1: suggestion-event logging + bandit (awaiting owner pick) | handoffs 28929/28930 |

### 2.6 Sites, archive and repositories

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-PAGES-SITES-MIGRATION-1 | gate-verify | S1 / act | qnfo-gateway | Migrate the 9 QWAV research sites to Cloudflare Pages (laws, paradigm, hierarchy, different, measure, unity, quantum, ai-poc; verify qlof-primer) | tasks GH-P2-064, GH-P2-067..075 |
| RM-DNS-REDIRECTS-HEADERS-1 | gate-verify | S1 / act | qnfo-gateway | Complete the DNS redirect chain to canonical destinations, security headers on every site, and fix Google Site broken links | tasks GH-P2-077/078/079 |
| RM-ARCHIVE-MIGRATION-1 | not-built | S1 / act | qnfo-archive | R2 archive migration of ARCHIVED projects and the Obsidian vault mapping, with discovery-index and KG ARCHIVE edges | tasks AM-T001..T007, GH-P2-046 |
| RM-REPO-HYGIENE-1 | not-built | S2 / act | qnfo-fleet-control | LICENSE files on the 8 artifact repos, repo topics/descriptions, releases/changelog, branch hygiene (16 diverged branches) | tasks GH-P0-034, GH-P1-036, GH-SPN-016/020; fleet_improvements 1575 |
| RM-UNBOUND-R2-DISPOSITION-1 | owner-decision | S5 / decide | owner | Decide purpose/ownership of the 8 unbound-but-populated resources (R2 deepchat, git-repos, obsidian-vault, palimpsest-research, play-the-ball, personal-media, d-drive, releases) | reorg_work_queue 56; R2 inventory (19 buckets) |
| RM-R2-PUBLIC-DATASETS-1 | owner-decision | S5 / decide | owner | R2 public custom domain for datasets (license-gated) and Cloudflare Stream adoption decision | handoff 28999 |

### 2.7 Security

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-SECRETS-STORE-1 | not-built | S3* / act | deepchat-security | Secrets Store for API keys with scripted rotation across workers, GitHub secrets and clients | tasks GH-HND-099; SEC-EXPOSED-CREDENTIALS-UNROTATED-1 |
| RM-WAF-RATE-LIMIT-1 | not-built | S3* / act | qnfo-fleet-control | WAF and rate-limit rules on public worker endpoints (ops, containers, idea form, email command routes) | cloudflare_capability_catalog waf/bot-mgmt not_considered |
| RM-MCP-OAUTH-1 | owner-decision | S3* / decide | owner | Cloudflare MCP OAuth (identity-bound) for agent clients | handoffs 29788/29791 |
| RM-DEEPCHAT-DB-ENCRYPTION-1 | not-built | S3* / act | deepchat-security | Encrypt the 1.3 GB local DeepChat database | handoff 29787 (due 2026-10-13) |

### 2.8 Observability and platform adoption

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-TAIL-WORKERS-1 | not-built | S3 / observe | qnfo-observability | Tail Worker for unsampled exception capture across the fleet | #1223 sampled worker_logs |
| RM-ANALYTICS-ENGINE-METERS-1 | not-built | S3 / observe | qnfo-fleet-control | Workers Analytics Engine meters per AI call and per task outcome (attribution and cost per task) | WORKERS-AI-SPEND-UNATTRIBUTED-RISING-1 |
| RM-CAPABILITY-PRODUCT-LOOP-1 | partial | S4 / orient | qnfo-fleet-control | Cloudflare product loop: discover -> score -> propose -> adopt (AI Search, Agents SDK, Browser Run, Queues, Workflows, Sandbox, Tail Workers, Access) | #1675; cloudflare_capability_catalog |
| RM-DO-AGENTS-DECISION-1 | owner-decision | S5 / decide | qnfo-fleet-control | Re-decide the adopted DO agents (FleetControlAgent, SignalLoopAgent, IntentOrchestratorAgent); qnfo-signal-loop is retired | goals deploy-fleet-control-agent / deploy-signal-loop-agent / deploy-intent-orchestrator-agent (adopted, not deployed); #1652 |

### 2.9 Owner surfaces

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-OWNER-EMAIL-VERBS-1 | partial | S5 / decide | qnfo-email | Owner email surface: ratify/kill/status verbs, DMARC-gated owner auth (live 2026-09-30), working alerts channel | paper 2.6; #1472/#1477/#1480 |

### 2.10 Governance and closure

| Item | Status | VSM / OODA | Owner | Build-out | Source |
|---|---|---|---|---|---|
| RM-GATE-DEFINITIONS-OWNER-1 | owner-decision | S5 / decide | owner | Owner decisions before 2026-10-25: impressions gate definition (frozen 5,610 baseline vs ratified prior-window MoM) and worker-count gate (cap re-baselined to 39 vs <= 28) | impact_thresholds vs metric_registry impressions definition; fleet_budget workers cap 39 vs survival gate <= 28 |
| RM-ADOPTED-GOALS-CLOSEOUT-1 | partial | S3 / act | qnfo-fleet-control | Verify and close or retire the adopted fleet goals: ops-model-toolcall-crisis, fleet-loop-actuation-gap, ops-exec-loop-parse-guard, self-heal-tool-list-correction, research-exec-newversion-draft-cleanup, skill-sync-public-route-404, skill-sync-esm-ai-deploy-path, skill-sync-r2-repo-sync-route, custom-prompts-template-parity, kaizen-anchor-parity-2-150, wrangler-deploy-fleet-control, repo-mirror-drift-closeout, cost-routing-stack-l0l7, external-impact-per-dollar, flap-guard goals | goals status=adopted (fleet-owned) |
| RM-KAIZEN-GATE-CANDIDATES-1 | partial | S3 / act | qnfo-kaizen | Codify the 12 proposed kaizen gates as machine-enforced checks (RED-INVENTORY, BUILD-GATE-NOT-RUNTIME, DEAD-SERVICE-BINDING, LIVE-AHEAD-OF-REPO, CURRENCY-UNIT-TRAP, FLEET-VS-EXTERNAL-ATTRIBUTION, GATEWAY-RUNWAY-BRAKE, CLAIM-SHEET-DB-ENFORCEMENT, REGISTRY-DRIFT-CONCURRENT-REMOVAL, STALE-TEMPLATE-MODELKEY, GOVERNANCE-CAP-DISPOSITION, TEMPLATE-RUNTIME-INJECTION-PARITY) | kaizen_candidates status=proposed (12); task_dod 331 |
| RM-KAIZEN-SCHEDULED-1 | partial | S3 / act | qnfo-kaizen | Execute the scheduled kaizen items: errata publish flip, outreach cap misclassification, unified per-record lifecycle scanner, risk-tiered kaizen auto-apply, weekly drift repair off the local cron, self-tuning router selection, errata-publish source in repo, probe coverage, recurring C4 finding, blank-audit alert cluster | kaizen_candidates status=scheduled (11) |

## 3. Fleet-lessons failure ledger: gate status

Each ledger entry in the paper names a remedy that became a standing gate. Status as audited on 2026-09-30: `enforced-verified` (observed holding), `enforced-partial`, `enforced-unverified` (exists, never proven), `violated` (currently breached), `violated-remediated` (breached and fixed this cycle), `local-only` (runs only on the local machine, so not yet a cloud gate), `open`.

| Entry | Remedy / gate | Status | Evidence |
|---|---|---|---|
| A1 | Transcript sweep before publish; fixes ship as new Zenodo versions | enforced-unverified | Needs a periodic sweep of published bodies to prove the gate holds. |
| A2 | Canonical link in public description and related identifiers | violated | fleet_improvements 1573: publishV2 triples the funnel link and drops keywords. |
| A3 | DB and deposit converge on one version string | violated | task_dod 385: 60 url-id != doi-id, 24 doi != zenodo_doi. |
| B1 | Units audit before any cost escalation | violated-remediated | 2026-09-30: dashboard burn used credit-netted amount_due ($0.00); workers_ai_cost_30d_usd was hand-set 15.6 vs ~58 measured. Fixed in #156/#161. |
| B2 | Gate metrics computed from sources at evaluation time | violated-remediated | impact_thresholds stored OPEN while measured MET (fixed #156); #1615 still open. |
| B3 | Per-day estimates re-derived before compliance breach | enforced-unverified |  |
| B4 | Budget-cap exhaustion degrades to the free tier | enforced-verified | routing_policy L7 LIVE. |
| B5 | One cost policy per path | violated-remediated | Agent final round took the chat free tier (#1271); fixed in qnfo-ops 2.38.13. |
| C1 | Client-state changes mirrored into the enforcing guard | local-only | Guards run locally (GUARDS-LOCAL-ONLY-1). |
| C2 | Retired identifiers swept across every enforcing surface | enforced-unverified |  |
| C3 | Client default model must resolve in the runtime registry | local-only |  |
| C4 | Guard parsers fixed; mirrors compared byte-for-byte | enforced-verified | mirror-guard runs fail-closed in CI. |
| C5 | Declared and live schedules converge to one truth | violated | CRON-DECLARED-EXCEEDS-PLATFORM-1. |
| C6 | Version and model list reconciled together from the live endpoint | violated | #1628 capability_audit_snapshot 11 days stale. |
| C7 | Parity guards wired fatal; absent anchor is a failure | violated | #1548 gates documented not enforced. |
| D1 | Lock timestamps are numeric epochs; immortal rows reaped | enforced-verified | deploy_locks typeof guard; 0 active locks. |
| D2 | Guard ledger resynchronised from live health on failure | enforced-verified | deploy-guard settle/autoResolve (1.3.17). |
| D3 | Distributed deploy lock; content-marker clobber detection | enforced-partial | Canonical deploy lock live; concurrent-agent contention still stalls the patch applier. |
| D4 | Platform-correct command form in wrappers | local-only |  |
| D5 | Symbol-closure check before deploy | enforced-unverified | deploy_gate build gate runs; symbol closure not proven. |
| D6 | Storage type read from the live namespace before deploy | enforced-unverified | container_restore_gate (2026-09-30) reads live state. |
| D7 | Build verification and conflict-marker sweep before push | enforced-verified | deploy-gate + workflow-lint in CI. |
| D8 | Re-probe after delay before declaring a broken index | enforced-unverified |  |
| E1 | Blockers must survive a credentialed falsification | enforced-unverified |  |
| E2 | Secrets read from their file stores | local-only |  |
| E3 | Auth-gated probes carry credentials | enforced-unverified |  |
| E4 | Counts cross-checked against a live call | enforced-partial | Dashboard now renders live; several registries still carry stored labels. |
| F1 | Prove no live consumer before retirement | enforced-verified | worker_consolidation BLOCKED-PROOF rows. |
| F2 | Traffic analytics before retirement | violated | RETIREMENT-USAGE-SIGNAL-DEGENERATE-1. |
| F3 | Consolidate toward a verified core | open | 39 live vs target 36 vs survival gate <= 28. |
| G1 | Closure carries a passing re-probe or owned deferral | enforced-partial | issue_close_evidence_required trigger enforces evidence text, not a probe. |
| G2 | Every register has an owned disposition actor | violated | #1634 metric triggers inert; #1635 dispatch handlers unverified. |
| G3 | Detection triggers a verified action; re-filing is open-dedup | enforced-verified | issue_refile_guard + unique open-title index. |
| G4 | A guard not wired into the gate that runs is not a gate | violated | #1548, #1629. |
| H1 | Independent purge sweeps for backup orphans | local-only |  |
| H2 | Skill registry membership verified before reliance | local-only |  |
| H3 | Junction/hardlink probe before any dedupe deletion | local-only |  |
| H4 | Parity audits read the last occurrence | enforced-unverified |  |
| H5 | Runtime state reconciled in-session | local-only |  |
| I1 | Model references provider-qualified and route-checked | enforced-unverified |  |
| I2 | Effective answer caps floored in chat and workflow paths | enforced-partial | #1271 fixed 2026-09-30; #1531 output-cap clamp open. |
| I3 | Get-then-put full-object config updates | enforced-unverified |  |
| I4 | Platform array shape on schedule re-register | enforced-verified | apply-schedules-body-1498. |
| I5 | Exact-value secret writes | enforced-unverified |  |
| I6 | Scoped routes above module-wide gates | enforced-unverified | fleet-control /state/summary ordered before auth (2026-09-30). |
| I7 | Case-insensitive MIME parsing; owner never suppressed | violated | #1480 raw MIME in owner command body. |
| I8 | Versions fill only missing values, live health first, semver gate | enforced-unverified |  |
| I9 | Idempotent patching with marker-count sweep | enforced-partial | apply-* LANDED_MARKERS (2026-09-30); #1673 applier rot. |
| I10 | Repository state verified through the uncached API | enforced-unverified |  |

## 4. Decisions only the owner can make

- **RM-S5-RATIFICATION-SURFACE-1**: Owner ratification surface (email verb and dashboard) for the 7 pending objective revisions, with expiry and recorded decision
- **RM-PREMIUM-DIGEST-1**: Premium research digest ($10/mo) product line (depends on NO-PAYMENT-RAIL-1 #1616)
- **RM-IPATENT-B2B-1**: ipatent.me patent analytics B2B pilot with 5 users
- **RM-BESPOKE-REPORTS-1**: Bespoke research reports offered through warm outreach replies (12 replied)
- **RM-BUFFER-MULTICHANNEL-1**: Decide multi-channel distribution (LinkedIn/X/Mastodon via Buffer, BUFFER_TOKEN unprovisioned) vs own-pages-only rule
- **RM-ADAPTIVE-SUGGESTIONS-1**: Adaptive suggestion engine wave 1: suggestion-event logging + bandit (awaiting owner pick)
- **RM-UNBOUND-R2-DISPOSITION-1**: Decide purpose/ownership of the 8 unbound-but-populated resources (R2 deepchat, git-repos, obsidian-vault, palimpsest-research, play-the-ball, personal-media, d-drive, releases)
- **RM-R2-PUBLIC-DATASETS-1**: R2 public custom domain for datasets (license-gated) and Cloudflare Stream adoption decision
- **RM-MCP-OAUTH-1**: Cloudflare MCP OAuth (identity-bound) for agent clients
- **RM-DO-AGENTS-DECISION-1**: Re-decide the adopted DO agents (FleetControlAgent, SignalLoopAgent, IntentOrchestratorAgent); qnfo-signal-loop is retired
- **RM-GATE-DEFINITIONS-OWNER-1**: Owner decisions before 2026-10-25: impressions gate definition (frozen 5,610 baseline vs ratified prior-window MoM) and worker-count gate (cap re-baselined to 39 vs <= 28)
- **SEC-EXPOSED-CREDENTIALS-UNROTATED-1** (#1676): coordinated credential rotation; the Cloudflare token rotation is identity-bound.
- Pre-existing owner-gated issues: #1277 (Cloudflare Access), #1279 (CASB), #1468 (qnfo-cloud-ops secrets), #1477 (alerts mailbox), #1517 (lifecycle.qnfo.org DNS), #1616 (payment rail).

## 5. Pre-existing open issues (not re-filed)

- **bug**: #1517 LIFECYCLE-CUSTOM-DOMAIN-530-1
- **compliance**: #1160 EMAIL-ULA-MISREPRESENTATION-835-1
- **content-integrity**: #1111 PUBLIC-COUNTS-COVERAGE-DRIFT-1; #1164 CONTENT-INTEGRITY-NO-INTERNAL-ERRATA-PATH-1; #1651 LIVING-CITATION-GRAPH-UNBUILT-1
- **correctness**: #970 EVENT-REC-NO-PROFILE-FILTER-JOIN-1
- **data-integrity**: #1290 OUTREACH-RESPONSE-TYPE-POSITIVE-MISCLASSIFIED-1; #1293 ROUTER-CALIB-AGENT-CLASS-ZERO-SUCCESS-1; #1474 EMAIL-CLASSIFICATION-PERSONAL-CATCHALL-1
- **dissemination**: #1194 DISSEMINATION-DISTINCTION-FAMILY-NEVER-POSTED-1; #1643 PAPER-EXPLAIN-DEAD-1; #1647 SOCIAL-ENGAGEMENT-COLLECTION-STOPPED-1
- **email**: #1049 EMAIL-HANDOFF-AFTER-1-2-AUTOREPLIES; #1158 EMAIL-REPLY-QUEUE-TERMINAL-PARENT-CASCADE-1; #1472 OWNER-CMD-QUEUE-522-ALL-FAIL-1; #1477 ALERTS-ADDRESS-NEVER-PROVISIONED-1; #1480 EMAIL-CMD-BODY-RAW-MIME-1
- **governance**: #1547 GITHUB-PUSH-AVAILABLE-1; #1548 GATES-DOCUMENTED-NOT-ENFORCED-1; #1615 SHUTDOWN-GATE-METRIC-STALE-REGRESSION-1; #1616 NO-PAYMENT-RAIL-1; #1619 SLA-BREACHES-18-OVERDUE-NONE-REMEDIATED-1; #1623 REGISTER-TAXONOMY-SWEEP-NEVER-EXECUTED-1; #1627 WORKER-CAP-NUMBER-DRIFT-1; #1629 GUARD-REGISTRY-36-UNVERIFIED-1; #1630 WORKER-CONSOLIDATION-COUNT-MISMATCH-1; #1633 ADR-012-FK-CONSTRAINTS-NEVER-IMPLEMENTED-1; #1636 CALIBRATION-REGISTER-NO-RECHECK-CONSUMER-1; #1656 PROMPT-PROVENANCE-UNBUILT-1; #1659 GOVERNANCE-KERNEL-SPARSE-1
- **integration**: #1279 CASB-GITHUB-NOT-CONFIGURED-1; #1638 QACP-PROTOCOL-UNBUILT-1
- **integrity**: #1181 ERRATA-ACTIONS-DEAD-1; #1182 CONTENT-ACCURACY-NOT-A-GATE-1; #1644 PROOF-SUBSYSTEM-DEAD-1
- **monitoring**: #1671 Q08-GATE-OUTAGE-UNMONITORED-1
- **observability**: #938 PERSONAL-TELEMETRY-PLANES-INERT; #1223 WORKER-LOGS-SAMPLED-ERROR-VISIBILITY-1; #1504 RESEARCH-REVISE-ABORT-1; #1543 TOOL-ERROR-RATE-web_fetch-1; #1618 WORKER-CENSUS-VERDICT-SATURATED-1; #1625 UNIFIED-OPEN-ISSUES-UNCONSUMED-1; #1626 METRIC-REGISTRY-UNDEFINED-DEFS-1; #1628 CAPABILITY-CONTRACT-CONFORMANCE-UNMEASURED-1; #1634 METRIC-TRIGGER-ACTION-LOOP-INERT-1; #1635 DISPATCH-HANDLER-CAPABILITY-UNVERIFIED-1; #1641 EXTERNAL-MENTION-MONITOR-EMPTY-1; #1642 VENUE-RADAR-DORMANT-1; #1645 EXPERIMENTS-FRAMEWORK-INERT-1; #1648 IPATENT-APP-ZERO-DATA-1; #1650 PORTFOLIO-PIPELINE-RUNS-INERT-1; #1652 FLEET-AGENTS-REGISTRY-STALE-1; #1653 RADAR-FAMILY-DORMANT-1; #1654 SIGNALS-TRIAGE-GAP-1; #1655 REPORT-CARD-INPUTS-STALE-1; #1657 CMS-CONTENT-TABLE-DEAD-1; #1658 WORKER-OUTPUT-CONTRACTS-STALE-1; #1660 FLEET-TASK-ENGINE-PARTIAL-COVERAGE-1; #1664 TOOL-ERROR-RATE-shell_exec-1; #1675 CAPABILITY-PRODUCT-LOOP-INCOMPLETE-1
- **optimization**: #1163 Q08-CURATED-ARTICLE-UNPUBLISHED-20260926
- **procedure**: #1118 OPS-PUBLICATION-PROCEDURE-GAP-20260926; #1152 DISSEMINATION-CHANNEL-CARRIES-Q08-NOT-PAPERS-1
- **publication**: #1091 DLF-ZENODO-PUBLISH-BLOCKED-1; #1621 ZENODO-VERSIONS-PER-FLAGSHIP-1
- **reliability**: #935 PERSONAL-MEMORY-MAINTAIN-NOOP-POST-909; #1189 RESEARCH-QUEUE-TRANSIENT-EXPRESS-ABORT-MISLEADING-OK-1; #1271 OPS-AGENT-TOOLS-EMPTY-500-1 (fix deployed 2026-09-30, qnfo-ops 2.38.13); #1468 CLOUD-OPS-BINDINGS-MISSING-1; #1512 PERSONAL-VAULT-INDEXER-ERROR-SURGE-1; #1531 OPS-OUTPUT-CAP-CLAMP-1; #1624 OPS-JOBS-CANCELLED-DOMINANT-1; #1637 DEVICE-PLANE-FROZEN-1; #1639 NOTES-INTAKE-STOPPED-1; #1640 SELF-EVOLUTION-LOOP-STOPPED-1; #1649 PERSONAL-PLANE-EMPTY-TABLES-1; #1670 Q08-STUCK-RUN-ROWS-1
- **remediation**: #1285 ACT-HALF-UNVERIFIED-PREDICATE-WEAK-1
- **research**: #1620 RESEARCH-QUEUE-PUBLISH-STALL-22D-1; #1622 RESEARCH-PLANS-TABLE-EMPTY-1
- **security**: #1277 CF-ONE-ACCESS-NOT-DEPLOYED-1
- **self-heal**: #1461 SELF-AUDIT-TOOLERR: exec_python; #1673 APPLIER-ROT-1; #1674 REMOVAL-LEDGER-WRITE-PATH-1

## 6. Sources mined

- qnfo.org/papers/quniverse-fleet-lessons (failure ledger A1-I10, roadmap 6.1-6.8)
- qnfo-audit: agent_issues, fleet_improvements, goals, objectives, autonomy_scores, kaizen_candidates, evolve_candidates, reorg_work_queue, worker_consolidation, task_dod_register, tasks (legacy PM), routing_policy, cloudflare_capability_catalog, fleet_budget, fleet_agents, handoffs (session records), ops_ai_log (owner/agent chat turns), metric_registry, impact_thresholds
- AI Gateway + Workers AI analytics (fleet-telemetry-probe runs 2026-09-30)
- R2 bucket inventory (19 buckets)
- QNFO/qnfo-workers docs/*.md, qnfo-ops/docs/CODE-AGENT-ORCHESTRATOR-SPEC.md, PATCH-*.diff artifacts
