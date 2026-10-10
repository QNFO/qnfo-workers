# QNFO QUNIVERSE — MASTER BUILD-OUT BACKLOG v2
**Compiled:** 2026-10-01 · **Author:** DeepChat (QNFO-OPS/ops) · **Method:** live D1/CF-API/repo/R2 reads only
**Supersedes:** 2026-09-30 master-build-out-backlog (+ADDENDUM) + SWEEP2 — merged, de-duplicated, re-probed, extended.

Sources mined this pass: qnfo-audit D1 (agent_issues, task_dod_register, reorg_work_queue,
worker_consolidation, fleet_improvements, goals/objectives, decisions, adr, metric_registry, sla_registry,
integration_scope, capability_audit_snapshot, shutdown_manifest, survival_model, idea_proposals,
research_queue/candidates, kaizen_candidates, evolve_candidates, self_rewrite_state, gtd_register,
fleet_budget, worker_invocations) · portfolio-state D1 (program_registry 79) ·
living-paper/graph · R2 qnfo-audit (audits/, closeouts/, triage/, adr/) · repo docs/ funding/ · CF API
(workers, d1, r2, kv, kv qnfo-fleet-config) · DeepChat long-term memory.

---

## 0. BASELINE (live 2026-10-01 ~00:0xZ)
| surface | value |
|---|---|
| workers live / registry | 39 / 39 (state=live) |
| open agent_issues | 84 |
| open issue_ledger | 9 |
| open task_dod_register | 14 |
| worker_consolidation unresolved | 22 (of 44) |
| reorg_work_queue OPEN | 11 |
| fleet_improvements open | 8 queued + 17 in_progress (0 approved — drained 2026-10-01) |
| ideas | 19 new + 124 hold + 29 accepted (669 total) |
| research_queue | 29 queued, 1 researching, last published 2026-09-08 (**22 d zero-publish**) |
| drift_total | 0 · erdr24 ~0.2% · cron_compliance 100 |
| AI spend 30d | ~$191 vs $150 cap (managed); direct-provider spend unmanaged |
| shutdown_manifest | 3 of 4 ARMED; phase-1 due **2026-10-25** (24 days) |

Headline: **green at the HTTP layer, rotting at the data layer, and failing its own survival gate.**
39/39 workers healthy and drift 0 are TRUE and say nothing about ~30 subsystems whose tables stopped
advancing days-to-79-days ago, and nothing about the fact that the binding constraint is
**audience growth + revenue**, not remediation.

---

## 1. SURVIVAL-CRITICAL (Tier 0 — everything else is downstream)

1. **Impression-metric two-source contradiction** (#1615) — `metric_registry.impressions_growth_30d`
   reads "+427%" while `BUSINESS-PLAN` measured "+0.89%"; units/definition unresolved; the shutdown gate
   reads the metric store. Re-measure from the authoritative RUM source; fix the DEFINITION, never the threshold.
2. **Decide or re-baseline the shutdown gates** (#1616) — phase-1 fires 2026-10-25 unless
   `full_reports_live_30d>=2 AND impressions_growth>=30%`. Today reports pass, growth fails.
3. **NO PAYMENT RAIL** (#1616 / docs/BUSINESS-PLAN.md §3B) — revenue $0, no rail, no pricing page.
   Proposed lines, in recommended order: (a) premium research digest $10/mo; (b) ipatent.me B2B analytics
   (5 pilot users); (c) bespoke per-report work via the 10 warm outreach replies. Acceptance:
   revenue >= burn by 2026-12-31.
4. **Subscriber conversion is broken** — 5,660 pageviews/30d -> 3 subscriber rows (metric says 1).
   Landing CTA exists; conversion path unmeasured.
5. **Cost floor (Phase A)** — the gpt-5.5 agent line is ~92% of the gateway invoice. Hold <=$40/mo by
   model routing (ops-exec already free-first; verify client sessions). Direct DeepSeek/Anthropic keys
   ($4-500/mo) have NO spend limit and no visibility (objectives.id=329 GAP).

---

## 2. NEVER BUILT (designed/discussed, zero execution)

### 2.1 Cloudflare self-knowledge loop (docs/CLOUDFLARE-CAPABILITY-INTEGRATION.md) — #1614
- `cloudflare_capability_catalog` table DOES NOT EXIST (migration 2026-09-07 never applied).
- sync-watcher cron (Mon 04:00) reading `cloudflare/skills` + changelog → catalog deltas.
- registry enrichment (capabilities/routes from /manifest + .well-known/agent-skills).
- **CF advisor decision gate** (need → product → policy ALLOW/PROPOSED → outcome metric).
- kaizen outcome re-evaluation (adopt → in_use vs reviewing → rejected+revert).
- skills mirror into skills-discovery R2.
- Applied recommendations from the doc still open: Workers Cache for 504s on papers.qnfo.org,
  AI Gateway fallback for router 400s, orphan-probe/DNS hygiene (#497), Observability/Tail for
  exceptions, Containers eval for the executor.

### 2.2 Register/taxonomy sweep — #1623
Doc declares "next phase, owner=agent"; no execution artifact. 15 workers have no /health probe.

### 2.3 Fleet-budget consolidation W1–W4 (docs/FLEET-BUDGET.md) — #362/#363/#365
- W1 MCP merge 4→1 (tools-mcp + memory-mcp + ai-search → qnfo-mcp).
- W2 Watchtower merge 5→2 (kaizen + cloud-ops + observability → qnfo-watchtower).
- W3 verify-then-retire (containers-pilot lessons→docs; pdf→research-exec; ipatent = product, owner decision).
- W4 storage prune (vectorize qnfo-infra 3 + semcache 9; R2 personal-media/play-the-ball/palimpsest).
- Target band 20-24 workers; 39 today. **Cap is 36 but 3 merges are dated 2026-10-04 and unexecuted.**

### 2.4 Research-pipeline L2 stage machine (docs/AUTONOMOUS-RESEARCH-PIPELINE.md) — #1622
`research_plans` 0 rows — the staged note→draft→review→revise→publish machine persists no plans.
IndexNow ping on publish + Schema.org ScholarlyArticle JSON-LD on paper pages = unbuilt/documented.

### 2.5 Fleet-agent DOs (goals, QNFO.INFRA)
- **IntentOrchestratorAgent** DO (goal #12, P1) — not deployed.
- **SignalLoopAgent** DO (goal #13, P2) — not deployed.
- **FleetControlAgent** DO (goal #14, P3) — not deployed.
- `qnfo-agent-ws` (agent websocket) exists in repo, not in the live 39.

### 2.6 Public read-only "idea stream" UI (owner request, long-term memory 2026-08-28)
Real-time public web UI showing QNFO chat/idea development, linked from qnfo.org. Requested, never built.

### 2.7 IPFS / decentralized corpus mirror (funding/NLNET_PROPOSAL.md, "QOKI-Mirror")
Open-source the pipeline (QOKI-Pipeline), publish audit tooling (QOKI-Audit), IPFS/Filecoin mirror of
~1,000 papers with DOI→slug→CID provenance + drift verifier (QOKI-Mirror), reference architecture.
Also: open-source the closed publication pipeline. Prior IPFS deployment 2026-07-18, not reinstated.

### 2.8 Cloudflare One / Zero Trust (integration_scope — GAP rows, owner ops) — #1277, #1279
- **Cloudflare Access** in front of admin/dashboard surfaces ("highest-value CF One capability to adopt").
- **CASB** SaaS scan (GitHub) — needs org-admin consent.
- **Email security retro** (PhishNet/BCC) — AVAILABLE / NOT DEPLOYED.
- **DLP** — AVAILABLE / NOT DEPLOYED.
- GitHub Enterprise Cloud: IN-USE / NOT CONFIGURED.

### 2.9 Legal immutability + authorship mandate (R2 adr/ADR-013-LEGAL-IMMUTABILITY.md,
   adr/ADR-014-AUTHORSHIP-MANDATE.md) — accepted, no enforcing build found.
Immutability of published artifacts + authorship attribution are declared ADRs; enforcement
(signed ledger / append-only R2 + verification) is not built.

### 2.10 Email command plane completion — #1472, #1480, #1477
- OWNER-CMD-QUEUE-522-ALL-FAIL-1: every owner email command failed HTTP 522; email_commands 7 rows all error.
- EMAIL-CMD-BODY-RAW-MIME-1 partial.
- **alerts@qnfo.org human alert channel never provisioned** (1477) — the fleet has no working human-facing alert.

### 2.11 Pages deploy path
`archive.qnfo.org` served by Pages project `qnfo-publications`; repo has 36 workflows, **none deploys
Pages** → repo fixes are inert. Deploy workflow shipped but manual + gated; inventory row still absent.

### 2.12 Capability backfill + deploy gate, client-probe relocation, impact→optimization loop
tasks #341 (impact loop), #342 (capability backfill + deploy gate), #345 (client-probe → cloud cron).

---

## 3. BUILT BUT INERT / SILENTLY STOPPED (stop-age census, sweep 2)

| Subsystem | Newest row | Age | Ticket |
|---|---|---|---|
| notes_intake + publish leg | 2026-09-25T10:31Z | 5.4 d | #1639 |
| self_rewrite_state / evolve_candidates | 2026-09-25T05:07Z | 5.6 d (0/116 successes ever) | #1640 |
| personal radar | 2026-09-25T06:01Z | 5 d | #1649 |
| events_radar | 2026-09-20 | 10.6 d | #1653 |
| social_engagements | 2026-09-20T05:15Z | 10.7 d | #1647 |
| signals status=new | 2026-09-14 | 16 d (128 stuck new, only 2 ever applied) | #1654 |
| fleet_agents | 2026-09-14 | 16 d | #1652 |
| paper_explain_log | 2026-09-11 | 19.3 d | #1643 |
| venue_radar_runs | 2026-09-10 | 20.6 d | #1642 |
| report_card_inputs | 2026-09-10 | 20 d | #1655 |
| integration_state | 2026-09-10 (id5) | 20.3 d | #1617 |
| proofs / proof_challenges | 2026-09-04 | 26.4 d | #1644 |
| conference_radar | 2026-09-02 | 28 d | #1653 |
| experiments | 2026-09-02 | 28 d (4 lifetime rows) | #1645 |
| external_records | 2026-07-13 | 79 d | #1641 |
| prompt_provenance | 2026-07-13 | 79 d | #1656 |
| external_mentions / cf_dos / ipatent_submissions / ipatent_analytics | never | — | #1641/#1631/#1648 |
| research_queue publish | 2026-09-08 | 22.3 d | #1620 |
| portfolio pipeline_runs | 1 row | inert | #1650 |
| living citations / paper_versions | 0 / 1 | inert | #1651 |
| device_tasks | 2026-09-12 | 18 d | #1637 |
| qacp_* (agent protocol) | 1 agent, 5 schemas, 1 trust | unbuilt | #1638 |
| calibration_register | no re-check consumer | unbuilt | #1636 |
| analytics_metric_triggers | 3 fires ever | inert | #1634 |
| cms.content | 0 rows; publish_queue 8 all-stale | dead | #1657 |
| dispatch_handler_registry | 7/7 INFERRED, never probed | unverified | #1635 |
| fleet_tasks coverage | 17 defs / 39 workers | partial | #1660 |
| governance_kernel | 2 versions | sparse | #1659 |
| worker_output_contracts | 32/39, 5.5 d stale | stale | #1658 |
| SIGNS / outreach_queue | 17 pending | stalled | (open) |

**Root-cause candidate #1661**: a 2026-09-25 stop-cluster — six unrelated loops stop in one window
(heartbeat/idle never fire again after 10:40:29Z). Hypothesis: deliberate consolidation retirement,
not an incident — but "the tool surface does not record WHY a cron stopped", which is itself the defect.

---

## 4. BROKEN INSTRUMENTS (compute the number wrong / cannot discriminate)

1. #1618 fleet_worker_census verdict collapsed to a single value "live" n=36; worker_dod uniform → the
   PRODUCTIVE/DEGRADED/FIRING-NO-OUTPUT/DAILY-ONLY/LOW-YIELD taxonomy is unmeasurable.
2. #1625 three open-work counts: unified_open_issues 42 / v_fleet_open_work 12 / backlog_status 39 → one surface needed.
3. #1411 three metrics past cadence (impressions_growth_30d, pageviews_30d, fleet_context_tokens).
4. #1626 two metrics UNDEFINED (referral_30d, guard_rcs) — excluded from the report card.
5. #1619 v_sla_breaches 18 rows, all overdue, all triaged, none remediated.
6. #1624 ops_jobs cancelled 40 vs succeeded 28 — the durable async path cancels more than it completes.
7. #1627 worker cap not single-valued: fleet_budget 36 vs FLEET-NODE-MAP 30 vs band 20-24.
8. #1629 36 of 68 guards never verified (verified_at NULL) — indistinguishable from a guard that never fires.
9. #1628 capability contract conformance UNMEASURED (capability_audit_snapshot 11 d stale; every sampled
   row has capabilities [] — the exact violation CAPABILITY-ADVERTISING-CONTRACT-1 §2.1 forbids).
10. 4 declared self-knowledge views empty (v_waiting_on_human, v_triage_gap, v_open_tasks_no_dod, v_reopen_rate).
11. #1630 worker_consolidation tracking says 13 pending, register holds 22.
12. #1669 WORKFLOW-DEFINITION-DRIFT-1: live fleet_tasks definitions have NO repo source → D1 is the only truth.
13. #1668 NO-REMOVAL-LEDGER-1: a worker can stop existing and NO registry records it.
14. #1601-class degraded-detection-source: repair guards must prove their detection source is non-degenerate first.

---

## 5. PRE-EXISTING OPEN ISSUES (not re-filed by the sweeps)

High: 970 (event-rec profile-filter join), 1049 (email handoff after 1-2 autoreplies), 1091 (DLF external
publish blocked), 1111 (public counts coverage drift), 1118 (publication preflight gap), 1152 (social
channel carries q08 not papers), 1158 (email reply-queue terminal-parent cascade), 1160 (email ULA
misrepresentation), 1163 (q08 curated article unpublished), 1164 (no internal errata path), 1182
(content accuracy not a gate), 1223 (worker_logs sampled error visibility), 1277 (CF Access not deployed),
1350 (workers over cap — **reconciled 2026-10-01**), 1411, 1468 (cloud-ops bindings missing
EMAIL_API_KEY/GH_TOKEN/GMAIL), 1472, 1477, 1480, 1504 (research-revise abort), 1512 (personal vault
indexer error surge 56,096/6,626), 1530 (credential inflation in formal verification), 1531 (ops output
cap clamp GW_MAX_OUT=32768), 1543 (web_fetch error rate), 1548 (gates documented not enforced).

Medium/low: 935, 938, 1181 (errata actions dead), 1189, 1194 (dissemination distinction family never
posted), 1271, 1279, 1285, 1290, 1293 (router-calib agent-class zero success), 1461 (self-audit toolerr),
1474 (email personal catch-all), 1517 (lifecycle custom-domain 530).

New from 2026-09-30 deep sweep (my recon): 1664 TOOL-ERROR-RATE-shell_exec-1; 1669 WORKFLOW-DEFINITION-DRIFT-1;
1668 NO-REMOVAL-LEDGER-1; 1661 2026-09-25-STOP-CLUSTER-1; 1660 TASK-ENGINE-PARTIAL-COVERAGE-1;
1659 GOVERNANCE-KERNEL-SPARSE-1; 1658 WORKER-OUTPUT-CONTRACTS-STALE-1; 1657 CMS-CONTENT-DEAD-1;
1656 PROMPT-PROVENANCE-UNBUILT-1; 1655 REPORT-CARD-INPUTS-STALE-1; 1654 SIGNALS-TRIAGE-GAP-1;
1653 RADAR-FAMILY-DORMANT-1; 1652 FLEET-AGENTS-REGISTRY-STALE-1; 1651 LIVING-CITATION-GRAPH-UNBUILT-1;
1650 PORTFOLIO-PIPELINE-RUNS-INERT-1; 1649 PERSONAL-PLANE-EMPTY-TABLES-1; 1648 IPATENT-APP-ZERO-DATA-1;
1647 SOCIAL-ENGAGEMENT-COLLECTION-STOPPED-1; 1645 EXPERIMENTS-FRAMEWORK-INERT-1; 1644 PROOF-SUBSYSTEM-DEAD-1;
1643 PAPER-EXPLAIN-DEAD-1; 1642 VENUE-RADAR-DORMANT-1; 1641 EXTERNAL-MENTION-MONITOR-EMPTY-1;
1640 SELF-EVOLUTION-LOOP-STOPPED-1; 1639 NOTES-INTAKE-STOPPED-1; 1638 QACP-PROTOCOL-UNBUILT-1;
1637 DEVICE-PLANE-FROZEN-1; 1636 CALIBRATION-REGISTER-NO-RECHECK-CONSUMER-1;
1635 DISPATCH-HANDLER-CAPABILITY-UNVERIFIED-1; 1634 METRIC-TRIGGER-ACTION-LOOP-INERT-1;
1633 ADR-012-FK-CONSTRAINTS-NEVER-IMPLEMENTED-1; 1630 WORKER-CONSOLIDATION-COUNT-MISMATCH-1;
1629 GUARD-REGISTRY-36-UNVERIFIED-1; 1628 CAPABILITY-CONTRACT-CONFORMANCE-UNMEASURED-1;
1627 WORKER-CAP-NUMBER-DRIFT-1; 1626 METRIC-REGISTRY-UNDEFINED-DEFS-1; 1625 UNIFIED-OPEN-ISSUES-UNCONSUMED-1;
1624 OPS-JOBS-CANCELLED-DOMINANT-1; 1623 REGISTER-TAXONOMY-SWEEP-NEVER-EXECUTED-1;
1622 RESEARCH-PLANS-TABLE-EMPTY-1; 1621 FLAGSHIP-VERSIONS-1; 1620 RESEARCH-QUEUE-PUBLISH-STALL-22D-1;
1619 SLA-BREACHES-18-OVERDUE-NONE-REMEDIATED-1; 1618 WORKER-CENSUS-VERDICT-SATURATED-1;
1617 INTEGRATION-STATE-FROZEN-REGRESSION-1; 1616 NO-PAYMENT-RAIL-1; 1615 SHUTDOWN-GATE-METRIC-STALE-REGRESSION-1;
1614 CF-CAPABILITY-CATALOG-NEVER-BUILT-1; 1671 Q08-GATE-OUTAGE-UNMONITORED-1; 1670 Q08-STUCK-RUN-ROWS-1;
1673 APPLIER-ROT-1 (28/103 repo appliers permanently dead).

**Genuine defects added 2026-10-01 (this session, not yet ticket-sourced):**
- CRONDRIFT-QNFO-CLOUD-OPS-UNRESOLVED-1: hourly `cronDrift=1` for qnfo-cloud-ops persists through
  three deploys (0.4.42/0.4.43/0.4.44) that read declared crons from the uncached GitHub API; the
  worker's declaredCrons returns a pre-CF-DOW 24-cron list that no reachable source (raw CDN, API, origin/main)
  returns. Root cause UNATTRIBUTED → fi #1021 stays OPEN.

---

## 6. RESEARCH / PROGRAM BACKLOG (goals register — adopted)

QNFO.RSCH (17 adopted) + QNFO.OPS (14) + QNFO.INFRA (3). Selected unreached deliverables above baseline:
adopted goals #1,2,3,5,6,9,10,11,18,24,25,26,27,40,47,49,55 (quantum-inspired thermodynamics, exchange-statistics
taxonomy, Majorana/braid, holographic QEC on Bruhat-Tits trees, GKP self-correction, hybrid QC, CMB n-point).
Operational goals not met: #15 close local mirror drift; #29 backpressure flap self-heal (-90% re-file);
#32 real qnfo-skill-sync repo→R2 route; #37 restore tool-calling; #38 self-improvement DETECTS-not-REMEDIATES;
#46 autonomy gap -50%; #49 GKP; #50 external-impact surface; #53 keep the L0-L7 cost stack live.
**Standing So-What gate** (triage 2026-08-16): every new thread must pass So-What + depth-of-premises +
falsification IN WRITING before Phase 0; max 2 active threads.

---

## 7. CONSOLIDATION + HYGIENE BACKLOG

- 7 QUEUED merges (→ qnfo-fleet-control, due 2026-10-04): observability, fleet-dashboard, kaizen,
  ai-calibration; lifecycle→fleet-exec; skill-sync→tools-mcp. Durable path = repo-side merge then CF delete.
- 4 BLOCKED-PROOF (must NOT retire): qnfo-infra (qnfo-ai calls /retrieve+/context), qnfo-agent-orchestrator
  (idea-hub binds it), qnfo-ai-search (ops deps), qnfo-containers-pilot (ops + research-exec deps).
- 3 DEFERRED: companion-hub (DDRIVE binding), errata-hub (21,588 lines, 3 minified sub-bundles), radar-hub.
- PLANNED: fleet-exec CRON-REDUCE `* * * * *` (1440/day = 52% of fleet cron) → `*/5`.
- 4 SAFE-RETIRE pending disposeRetired: notes-intake, qnfo-autopilot, qnfo-egress-probe,
  size-semantics-probe-a/b, qnfo-ops-ledger-selftest, qnfo-signal-loop, qnfo-email-orchestrator.
- REPO-BRANCH-HYGIENE-1 (#1575): 16 diverged non-main branches; `fix/q08-route-and-archive-numbers` +13.
- D1 296 tables incl. duplicate families; retention policy not enforced (decision #36).
- Bloat/token policy (decisions #36-38): cap+dedupe Vectorize, no date-stamped snapshot tables, context re-upload is the #1 cost.

---

## 8. MASTER TASK LIST (dependency order)

**Tier 0 (24 d, survival):** 1 reconcile impressions metric (#1615) · 2 decide/re-baseline gates (#1616)
· 3 payment rail + one monetization line (#1616) · 4 cost floor ≤$40/mo + direct-key visibility.

**Tier 1 (instruments):** 5 un-saturate census (#1618) · 6 one open-work surface (#1625) · 7 revive
integration_state (#1617) · 8 define/drop UNDEFINED metrics (#1626) · 9 refresh 3 stale metrics (#1411)
· 10 SLA alert+autofix (#1619) · 11 single cap (#1627) · 12 verify 36 guards (#1629) · 13 measure
capability conformance (#1628) · 14 merge consolidation counts (#1630) · 15 repo-source fleet_tasks (#1669)
· 16 removal ledger (#1668).

**Tier 2 (drain live pipelines):** 17 unblock research_queue (#1620) · 18 persist L2 plans (#1622)
· 19 versions 1→2 (#1621) · 20 drain outreach + lift send gate · 21 drain reply-queue + cascade
(#1158) · 22 restart paper distribution (#1152/#1194) · 23 publish q08 article (#1163) · 24 notes-intake +
publish leg (#1639) · 25 self-evolution loop (#1640) · 26 signals triage (#1654) · 27 Q08 gate outage
(#1671/#1670) · 28 applier rot (#1673) · 29 stop-cluster root cause (#1661).

**Tier 3 (never built):** 30 CF capability catalog 6 components (#1614) · 31 impact→optimization loop (#341)
· 32 capability backfill + deploy gate (#342) · 33 probe relocation (#345) · 34 register taxonomy sweep (#1623)
· 35 fleet-agent DOs (#12/13/14) · 36 public idea-stream UI · 37 Pages deploy path + inventory.

**Tier 4 (consolidation):** 38 W1 MCP 4→1 · 39 W2 watchtower 5→2 · 40 W3 verify-then-retire · 41 W4 storage
prune · 42 ≤30 workers / ≤48 crons.

**Tier 5 (surface + trust):** 43 internal errata (#1164/#1181) · 44 accuracy gate (#1182) · 45 email command
plane (#1472/#1480) · 46 alerts@ channel (#1477) · 47 Cloudflare Access (#1277) · 48 cloud-ops bindings
(#1468) · 49 enforce documented gates (#1548) · 50 public count drift (#1111) · 51 publication preflight (#1118)
· 52 ADR-012 FK constraints (#1633) · 53 ADR-013/014 immutability+authorship enforcement · 54 CF One CASB/DLP/email-security.

---

## 9. FALSIFIED / RETRACTED THIS PASS
1. "logpush stalled" FALSE (live, 5,178 rows). 2. "fleet mostly down" FALSE (39/39, err 0.19%, drift 0).
3. "fleet_improvements has no consumer" — genuinely fixed (83 done). 4. "90 open issues is the whole backlog"
FALSE (unified_open_issues > agent_issues; plus 14 dod + 9 ledger + 22 consolidation).
5. The 2026-09-30 "workers over cap +3" FALSE-RED was reconciled 2026-10-01 (cap now = live 39).
6. `qnfo-research-supervisor` absence is BY DESIGN (retired stub), not a broken drain.

## 10. FAILURE MODES OF THIS COMPILATION
1. **Snapshot not stream** — agent_issues/impr moved by my own writes mid-compile.
2. **Absence of rows ≠ dead subsystem** — heartbeat/idle "no work" is a success signal.
3. **Staleness thresholds are mine**, not declared (only 3 metrics carry a declared cadence).
4. **Doc-derived items may be stale** (repo doc commit dates not individually re-verified).
5. **STRONGEST COUNTER-ARGUMENT:** an operator reading fleet.qnfo.org sees 39/39 healthy, drift 0,
   cron_compliance 100 and is RIGHT that nothing is broken *right now*. Every Tier-2/3 item is a claim
   about *visibility of stopped or never-built subsystems*, not a claim the fleet is failing. The one
   item that is unambiguously existential is **Tier 0** — the survival gate + zero revenue.

## 11. ARTIFACTS
- This file (repo `audits/2026-10-01-master-build-out-backlog-v2.md`) + R2 `qnfo-audit`.
- Superseded: 2026-09-30 master-build-out-backlog (+ADDENDUM/SWEEP2).
- Live tickets: agent_issues #1614–#1673 + pre-existing set in §5.
