# Cloudflare Quniverse product requirements

Planning baseline: 2026-10-25. Charter pillars: `core`, `autonomy`, `research`,
`reach`, `cost`, `security`, `personal`.

## 1. Purpose and authority

Quniverse is QNFO's autonomous research-operations system on Cloudflare, not a
general cloud platform, commercial SaaS product or multi-tenant service. This PRD
translates existing commitments into user outcomes, acceptance criteria and an
execution-ready roadmap. It does not change objectives, permissions, budgets,
deployment controls or the charter's MVP membership.

Authority remains with the canonical terminal objectives in D1; the
[charter](QUNIVERSE-CHARTER.md) controls architecture, MVP and roadmap order;
[strategy](STRATEGY.md) controls identity, audiences, channels and KPIs.
[Session rules](../CLAUDE.md) and their later standing directives govern execution.
This document is subordinate to those sources. In particular, historical
owner-decision labels are not new approval requirements for reversible fleet work,
and historical daily/weekly schedules do not override current cron/SLA rules.

The [generated backlog](QUNIVERSE-BACKLOG.md) and its
[2026-09-30 JSON source](backlog/quniverse-backlog-2026-09-30.json) describe 73
roadmap build-outs, not 73 implemented capabilities. Current implementation
evidence belongs in `qnfo-audit.roadmap_implementation`, `agent_issues`,
`issue_triage.close_evidence` and live probes. Do not edit generated backlog or
charter sections to maintain this plan.

## 2. Problem statement

Research production is not the same as research impact. The charter's dated
2026-10-01 baseline describes substantial publication capacity but only one
confirmed subscriber, two external citations, approximately $725 monthly total
cost and 44 live Workers. These are historical observations, not today's counts.
Fragmented telemetry, incomplete attribution, operational dependencies and
verification debt make it difficult to tell whether additional output is useful
or whether an apparently healthy fleet can actually complete its work.

The product must turn an idea into credible, discoverable, read and cited work;
operate and repair that pipeline without a person or local session as a recurring
dependency; and explain its results and full cost from durable evidence.
Success means stronger research and relationships on a smaller verified core,
not more papers, posts, Workers or AI calls.

## 3. Target user personas

| Persona | Job and need | Product outcome |
|---|---|---|
| Primary: research owner/operator | Set policy, inspect outcomes and override exceptions without daily dispatch or infrastructure maintenance | One truthful fleet dashboard, evidence-backed progress and a bounded identity-bound exception queue |
| Research reader/contributor | Quantum-computing or AI-for-science researcher evaluating a claim or method | Open, versioned papers, accessible PDFs, citations and provenance; a path to reproduce or contribute measurements |
| Engineering practitioner | Evaluate JPCUB, the ignorance audit or the fleet's operating lessons for practical use | Selected works, useful examples, an opt-in subscription and a warm assessment/contact path |
| Funder/collaborator | Judge credibility, reproducibility, external uptake and cost effectiveness | Auditable outcomes and evidence, not publication volume or unsupported autonomy claims |

Automated fleet executors are operational actors, not additional customer tenants.
Personal utility is retained owner infrastructure and accounted for separately
from research return on spend. The audiences and lead content above follow
strategy sections 2-3; this PRD does not reposition the QNFO identity.

## 4. User stories and acceptance criteria

Criteria below are requirements to verify, not assertions that they currently pass.
Each delivery must retain timestamped evidence and a recurring Cloudflare-owned
probe where the behavior is recurring. Missing telemetry is unmeasured, not zero.

| ID / priority / pillar | User story | Verifiable acceptance criteria |
|---|---|---|
| US-01 / P0 / autonomy | As the owner, I can understand the fleet without asking a session to reconstruct it. | `fleet.qnfo.org` renders counts, source timestamps, measured autonomy and cost; missing/stale inputs are identified rather than shown as healthy; dashboard totals reconcile with their D1 sources; a synthetic read detects an absent required section. |
| US-02 / P0 / core | As the operator, I can trust that a repair reached production and fixed the defect. | A representative defect follows issue -> task -> verified change -> gated PR -> canonical deploy -> live behavioral probe; deploy and verification ledgers link to the change; a failing probe leaves the issue open; closure records `close_evidence`, not merely "deployed". |
| US-03 / P0 / research | As a reader, I can inspect credible research from idea through publication. | A synthetic queued idea reaches a reviewed, versioned paper, readable page, PDF and knowledge-graph entry; required review verdicts and full-text source provenance are retained; an unavailable source is not used as if read; the published page and PDF pass content assertions, not just HTTP 200. |
| US-04 / P0 / reach | As a reader, I can find a paper and explicitly opt in or out of updates. | A published paper has scholarly metadata including an absolute `citation_pdf_url`; publication emits a distribution item with a retained platform ID; double opt-in confirms a subscriber only after confirmation; unsubscribe suppresses subsequent delivery; QNFO and q08 counts remain separate. |
| US-05 / P0 / cost | As the owner, I can see what useful work costs without spend thresholds stopping it. | A dated 30-day cost total separates gateway billing, BYOK, direct-provider, Workers AI and plan costs without double-counting; attribution coverage and missing sources are shown; a simulated spend breach routes to a cheaper capable path and still completes a task; failed and successful task costs remain distinguishable. |
| US-06 / P0 / autonomy | As the operator, I can rely on unattended execution and recovery. | A task interrupted after a checkpoint resumes without duplicating its externally visible effect; a deliberately missed heartbeat creates actionable remediation; issue counts and oldest-item age are visible at 10-minute resolution, with action at the first tick beyond 120 minutes; a passing closing probe is required for resolution. |
| US-07 / P0 / security | As the owner and a public reader, I get open research without exposing private state or mutation authority. | Anonymous reads of public research and fleet information work; unauthenticated protected writes are refused and do not mutate state; a negative test cannot retrieve personal documents through research/public routes; credential operations retain secret-lock controls; external messages honor suppression, consent and channel terms. |
| US-08 / P0 / personal | As the owner, I retain useful personal services without mixing them into public research. | A synthetic email command is executed and acknowledged; a synthetic invite produces its calendar entry and reminder; scheduled brief/calendar delivery has timestamped evidence; private document history remains in the private identity plane, never copied into shared research state. |
| US-09 / P1 / reach | As a collaborator or funder, I can distinguish real uptake from automated traffic. | The scorecard links each credibility event to external evidence; citation collection covers selected works; human/bot/unknown quality is explicit; a publication can be followed through deposit, page, distribution and subscription stages, with unavailable attribution labeled rather than inferred. |
| US-10 / P2 / research | As a researcher, I can interrogate and reproduce the corpus rather than only read it. | Before each future feature is accepted, a public Ask answer links supporting corpus sources; a living-paper revision preserves prior versions; a reproduce action returns a recorded result tied to a versioned claim; consistency findings link the conflicting claims. Deliver separately under the mapped roadmap items below. |

## 5. Success metrics

Targets are requirements, not observed results. Preserve canonical metric
definitions and windows; do not silently substitute page hits for sessions or
missing values for passing measurements. Measurement cadence below is the PRD's
verification requirement unless an existing source already specifies it.
Cron implementation follows current session rules: 5-minute-aligned scheduling,
at least hourly invocation, with less-frequent work dispatched exactly once.

| Outcome / source | Definition and measurement | Target / evaluation |
|---|---|---|
| Credibility and citations; strategy sections 6, 9 | Deduplicated external citations, invited talks/reviews, accepted work, press, arXiv listings or third-party JPCUB use with evidence; OpenAlex external citations reported separately. Refresh daily from hourly-dispatched collectors. | 3 credibility events and 10 external citations by the existing 2026-12-31 review; no claim that either target is met. |
| Owned audience; strategy sections 6, 9 | Confirmed subscribers, net additions over 30 days and unsubscribes, separately per QNFO/q08 list. Refresh daily. | 50 confirmed subscribers by the existing review gate; never count unconfirmed addresses. |
| Relationships; strategy section 9 | Positive replies plus inbound contacts, excluding bots and duplicate correspondence; daily refresh. | 10 new warm conversations by the existing review, not total historical replies. |
| Attention and efficiency; strategy section 6 | Report bot-filtered RUM pageviews as the documented attention proxy, not true engaged sessions; 30-day AI spend divided by the compatible measured attention denominator, clearly labeled. Refresh daily. | Baseline from the first complete ingestion week, then the strategy's 2x attention target; efficiency improves against that baseline. Neither a numeric baseline nor an ROI threshold is invented here. |
| Unified spend; strategy section 8 and charter section 3 | Reconciled all-provider 30-day AI cost plus separately identified plan/total fleet cost; per-source coverage and attribution refreshed at least hourly. | Existing gateway goal <= $60/30 days and existing $150/30-day gateway cap are distinct from all-provider total. Spend breaches steer routing, never stop work. Use live budget rows for current class limits; historical $40 build-outs are not a replacement cap. |
| Operational autonomy; session rules and charter section 6 | `watchmaker_index`: recurring operations needing a person/session or stalled runner; `owner_queue_fleet_cards_open`: fleet-capable items waiting in owner queue. Refresh hourly. | 0 each; SAI remains the canonical weighted score, not the unweighted dimension mean. No new SAI threshold. |
| Remediation; current session rules | `open_agent_issues`, `issues_open_over_120m`, `issue_drain_ratio_24h`; evidence-backed closes versus opens, with family-level inflow and oldest age. Evaluate every 10 minutes. | 0 open defects and 0 older than 120 minutes; drain ratio >= 1.5 when arrivals exist. With no arrivals, report the ratio's canonical empty-window behavior, not a fabricated success. |
| Verified core; charter sections 5-6 | All 18 charter MVP components serving with functional evidence; daily charter evaluation plus cadence-aware behavioral/heartbeat probes. Live inventory measured daily. | 18/18 serving; H1 footprint <= 30 Workers and <= 50 schedules; end-state 20-24 Workers and <= 48 schedules. No retirement without dependency and preservation checks. |
| Safety and measurement integrity; session rules | `security_open_issues`, `silent_drops`, `issues_unaccounted`, `metrics_in_breach`; refresh hourly, with issue-age evaluation every 10 minutes. | 0 each; improved targets cannot be obtained through unsupported closure, relaxed privacy/consent or discarded failures. |

Strategy retires GA4 and Search Console as fleet sources despite older charter
roadmap text requesting access. Do not introduce either as a dependency.
RUM does not supply reliable query-string campaign attribution, so UTM tagging
alone is not proof of post-to-subscription conversion. Report that gap explicitly.

The existing **2026-12-31 review gate** remains: continue the research layer when
credibility events >= 2 OR confirmed subscribers >= 50 OR funding is secured,
AND AI spend is inside its applicable cap. Three credibility events is the
stretch target, two is the gate threshold. Otherwise follow the selected-works
core fallback with verified, restorable preservation of research data. This PRD
does not create a new funding commitment or authorize submission/signing acts.

## 6. Prioritized scope

| Priority | Scope | Boundary |
|---|---|---|
| P0: MVP, protect and verify | The charter's exact 18-component set across core, autonomy, research, reach and personal utility; US-01 through US-08; cost visibility and security as cross-cutting requirements | Existing serving status is not proof of every end-to-end criterion. Repair and verify before adding surface; do not add a new Worker just to satisfy this PRD. |
| P1: strengthen before the review | H0 measurement/hygiene and H1 credibility, verified consolidation, durable execution and code-loop closure; US-09 | Follow charter horizon order and computed priority, with live critical/security defects taking precedence. Reuse existing roadmap rows rather than create duplicate work. |
| P2: future, conditional | H2 event-driven coordination, research oracle, living papers, reproduction, consistency/navigation, distillation and deeper observability; US-10 | Sequence after review disposition and prerequisites; each feature earns its place through user evidence and net-zero footprint discipline. |
| Deferred or excluded | Premium digest before 200+ confirmed subscribers, a new paid multi-tenant product, general cloud tooling, paid promotion, unrelated backlog execution | iPatent remains the strategy's invested flagship; its historical B2B pilot is not an MVP commitment. Personal accounts, legal/financial acts and prohibited automation gain no authority from this plan. |

MVP membership is defined by charter section 5: core (`qnfo-ops`,
`qnfo-deploy-guard`, `qnfo-ai`, `qnfo-tools-mcp`, `qnfo-memory-mcp`); autonomy
(`qnfo-fleet-control`, `qnfo-autonomy-scorer`, `qnfo-fleet-dashboard`, `fleet-exec`);
research (`qnfo-research-exec`, `qnfo-paper-indexer`, `qnfo-paper-reviser`);
reach (`qnfo-gateway`, `qnfo-subscribers`, `qnfo-social`); personal
(`qnfo-email`, `personal-api`, `calendar-api`).

## 7. Phased implementation roadmap

This is the implementation plan, not an assertion of runtime implementation.
H0/H1/H2 retain charter section 7's ordering. Its existing dates are context, not
new delivery estimates. Within a horizon, use the charter's computed roadmap
priority; execute defects from `v_issue_queue` by severity then age.

**Status convention:** every owner and status in the table is copied from the
2026-09-30 JSON snapshot, not today's assignment or completion verdict.
For example, its `not-built` label for the code orchestrator/watchmaker work
predates later session rules describing those capabilities. Before execution,
reconcile each row with live `roadmap_implementation`, open issues, current code,
live claims and passing probes; record the remaining delta or verification-only
work. A historic `owner` or retired Worker label must be resolved to the current
accountable executor, not used to create a new owner dependency.

| Phase / priority / pillar | Existing initiative and historical owner: status | Deliverable and exit evidence | Dependency |
|---|---|---|---|
| H0 / P0 / cost | RM-COST-UNIFIED-SPEND-1, RM-COST-PER-TASK-ALL-PATHS-1 (`qnfo-fleet-control`: partial); RM-COST-FREE-FIRST-PARITY-1 (`qnfo-fleet-control`: gate-verify) | Reconciled all-provider cost, attribution gaps and comparable successful-task costs; US-05 breach-path test and source reconciliation pass. | Inventory existing billing paths and live budget rows before tuning. |
| H0 / P0 / reach | RM-FUNNEL-E2E-MONITOR-1 (`qnfo-fleet-control`: not-built); RM-SEO-INDEXNOW-JSONLD-1 (`qnfo-research-exec`: gate-verify); RM-DNS-REDIRECTS-HEADERS-1 (`qnfo-gateway`: gate-verify) | Trace a representative publication through accessible PDF/page, metadata and distribution; stage counts expose missing transitions and attribution limitations (US-04, US-09). | Existing publication and telemetry sources; no Google-credential dependency. |
| H0 / P0 / core | RM-CONSOLIDATION-WAVE-B-1 (`qnfo-fleet-control`: partial); RM-DEAD-PROBES-VERIFY-1 (`qnfo-fleet-control`: gate-verify) | Verify remaining folds/deletions against live consumers, preserve state and reconcile declared/live schedules; demonstrate all MVP behaviors survive. | Dependency graph freshness, live claims and verified backups where applicable. |
| H0 / P0 / security | RM-WAF-RATE-LIMIT-1 (`qnfo-fleet-control`: not-built), plus charter H0 credential/exposure defects | Verify protected mutations and shell/admin surfaces reject unauthorized calls while public reads remain open; coordinate credential work only through existing authority and secret locks (US-07). | Live exposure evidence and current controls; no secret changes in this documentation task. |
| H1 / P1 / reach | RM-SUBSCRIBE-CTA-1 (`qnfo-subscribers`: not-built); RM-CITATION-TRACKING-ALL-DOIS-1 (`qnfo-paper-indexer`: partial); RM-BESPOKE-REPORTS-1 (`owner`: owner-decision) | Prove opt-in/out and citation coverage; apply strategy's warm JPCUB assessment offer rather than the older generic reports proposal; retain evidence for subscribers, conversations and credibility events. | H0 measurement; selected works, consent and existing outreach/channel rules. |
| H1 / P1 / autonomy | RM-CODE-ORCHESTRATOR-1, RM-DURABLE-AGENT-EXECUTION-1 (`qnfo-ops`: not-built); RM-OODA-DEPLOY-LATENCY-1 (`qnfo-ops`: partial) | Reconcile already-shipped loop work; close only remaining gaps. One real task completes the canonical tested/deployed/probed chain, and an interrupted task resumes without duplicate effects (US-02, US-06). | H0 verification and current code-loop permission/canary boundaries. |
| H1 / P1 / autonomy | RM-MONITOR-THE-MONITORS-1, RM-WATCHMAKER-INDEX-1 (`qnfo-fleet-control`: not-built); RM-NOVEL-FAILURE-REPAIR-1 (`qnfo-fleet-control`: partial) | Demonstrate stale-monitor detection, a verified repair and watchmaker counts backed by recurring runner evidence; no local-session dependency (US-01, US-06). | Inventory monitors, current SLA policy and existing remediation contracts. |
| H1 / P1 / core | RM-FLEET-BUDGET-WAVES-1 (`deepchat-reorg`: not-built); RM-REPO-DEAD-SOURCES-1, RM-D1-RETENTION-1 (`qnfo-fleet-control`: not-built) | Reconcile remaining consolidation and retention work; inventory meets H1 footprint targets with restorable retained research and no broken live consumer. | H0 fold verification, reassigned historical owners and tested restore paths. |
| H2 / P2 / autonomy | RM-S2-EVENT-DRIVEN-1 (`qnfo-fleet-control`: not-built); RM-RESEARCH-BROWSER-QUEUES-1 (`qnfo-research-exec`: not-built) | Replace selected polling chains with durable producer/consumer handoffs; retry/redelivery tests preserve one logical outcome and failed deliveries remain actionable. | Review disposition, durable execution and verified per-chain contracts. |
| H2 / P2 / research | RM-VISION-ASK-QWAV-1 (`qnfo-ai`: partial); RM-VISION-LIVING-PAPER-1 (`qnfo-archive`: not-built); RM-VISION-REPRODUCE-BUTTON-1 (`qnfo-containers-pilot`: not-built); RM-VISION-CONSISTENCY-ENGINE-1 (`qnfo-paper-indexer`: not-built); RM-VISION-CONCEPT-GRAPH-1 (`qnfo-memory-mcp`: partial) | Deliver US-10 as separate tested capabilities: grounded answers, version history, reproducible claim results and navigable contradiction/provenance links; measure actual reader use. | Review disposition, reliable corpus/version IDs, scoped execution and public/private separation. |
| H2 / P2 / cost | RM-COST-L5-DISTILLATION-1 (`qnfo-ops`: not-built); RM-COST-L6-DRAFT-VERIFY-1 (`qnfo-ops`: partial); RM-ANALYTICS-ENGINE-METERS-1 (`qnfo-fleet-control`: not-built); RM-TAIL-WORKERS-1 (`qnfo-observability`: not-built) | Compare measured successful-task cost and quality before/after routing changes; cost meters and exception evidence cover the selected paths without hiding failed work. | Unified spend baseline, verifiers and reconciliation of historical owners. |

This is a prioritized slice of the existing 73 build-outs, not a replacement
inventory. Unlisted initiatives retain their canonical disposition. In
particular, RM-PREMIUM-DIGEST-1 remains deferred by strategy; historical
RM-IPATENT-B2B-1 is not permission to launch a paid pilot; and
RM-BUFFER-MULTICHANNEL-1 is reconciled against strategy/current channel rules,
not treated as a fresh account-connection task.

### Delivery and acceptance protocol

For each selected initiative, the accountable fleet executor records the RM ID,
pillar, linked US IDs, remaining delta, dependencies, tests, behavioral closing
probe and rollback/preservation path in the existing roadmap/issue records.
Feature plans stay in roadmap/goals; defects get actionable issues with a doer.
Take work claims before editing and use the live dependency graph before changing
shared contracts. Do not duplicate an active task or another session's claim.

Completion requires the relevant acceptance criteria, applicable repository
checks, canonical deployment and passing live evidence attached to the existing
record. A partial implementation remains partial; a passing health version alone
does not prove the user outcome. Recurring verification runs on Cloudflare, not
through follow-up sessions or GitHub scheduled jobs. New metric instrumentation
includes its trigger, remediation owner and evidence-based closure contract.

At each horizon review, compare verified user outcomes with the scorecard,
retain failures and missing measurements, and update the canonical roadmap
disposition before maintaining this hand-written plan. No new calendar promises,
runtime changes, issues or completion claims are created by writing this PRD.

## 8. Implementation evidence and remaining scope

The first implementation slice is
[`2026-10-25-prd-funnel-monitor.sql`](../migrations/2026-10-25-prd-funnel-monitor.sql),
covering the measurement portion of RM-FUNNEL-E2E-MONITOR-1 (US-04/US-09).
It adds stage evidence views, a ten-minute task on the existing fleet executor,
missing-transition and observer-freshness metrics with remediation triggers,
and a failure-mode detector. It neither publishes content nor changes access.
Its [offline suite](../migrations/prd-funnel-monitor.test.mjs) exercises missing
and stale inputs, DOI joins, confirmation state, task SQL and idempotence.

The observer records DOI/page mappings rather than proving external deposit,
page or PDF availability; human-labeled pageviews are not engaged sessions;
confirmed subscriber stock is not a conversion rate. Full runtime funnel probes,
per-publication attribution and separately verified brand audiences remain open.
Deployment acceptance requires an `ok` migration_runs row followed by an `ok`
`fleet_runs` row for `prd-funnel-monitor`, stage evidence in `cloud_ops_events`,
and the independently queried `v_prd_funnel_health` verdict. Installing the
migration alone does not satisfy all US-04/US-09 criteria.

Production evidence: the canonical migration completed at 18:26:40Z on
2026-10-25; `fleet_runs` 31133 and 31150 completed `ok`. The second tick refreshed
`prd_funnel_monitor_stale` to `0`; the independent health view agrees. The
missing-transition count is `448`: these are missing bookkeeping associations,
not proof that all publications failed distribution. The first event's stage
prose was scrubbed by an existing secret guard. The additive
[`2026-10-25-prd-funnel-evidence.sql`](../migrations/2026-10-25-prd-funnel-evidence.sql)
keeps those guards unchanged and records typed counts/timestamps instead of
prose. Its independent probe requires a recent, intact six-stage event; task
installation alone is not evidence that this repair has executed successfully.

Live reconciliation on 2026-10-25 found RM-SUBSCRIBE-CTA-1 recorded as built
with existing double-opt-in evidence; it must not be rebuilt from the old
snapshot's `not-built` label. All other roadmap rows retain their canonical
status until their remaining requirements are implemented and independently
verified. This slice does not mark the product roadmap complete.

### Acceptance coverage at reconciliation (2026-10-25)

This is a dated evidence inventory, not a blanket product acceptance. An existing
health response or passing offline fixture does not prove the entire user story.
The canonical roadmap remains the execution queue for the open portions.

| Story | Verified existing evidence / implemented slice | Acceptance still open |
|---|---|---|
| US-01 | Public dashboard `/api/reach` returns 200 and explicitly reports partial ingestion, missing OpenAlex dates and 28/30 RUM days; fleet `/loops` reports healthy with no findings. | Reconcile every displayed count and stale/missing-source behavior, not just route availability. Dashboard source is under another session's live claim at reconciliation. |
| US-02 | The canonical PR gate and migration workflow are wired; existing code-orchestrator status is `partial`. | A complete representative defect-to-live-behavior-to-evidence-backed-closure trace. Code-loop/control-plane changes are actively claimed by other sessions; no parallel rewrite. |
| US-03 | The live research queue records 448 publications in the preceding 30 days; existing grounding/review suites cover portions of the pipeline. A public sample page exposes ScholarlyArticle JSON-LD, author, version, date and an absolute citation PDF URL. | Independently exercise the complete idea/review/page/PDF/KG path and verify full-text grounding for its resulting artifact. Metadata presence alone does not prove PDF availability or source fidelity. The publication Worker has an active code-loop claim. |
| US-04 | Subscription health returns 200 (`1.5.0-no-registrar`); canonical RM-SUBSCRIBE-CTA-1 is built with existing double-opt-in evidence. New funnel views account for page and distribution associations. | A fresh opt-in/out delivery canary and publication metadata/content probes; counts and historical evidence alone do not prove current delivery. |
| US-05 | Live `workers_ai_attribution_coverage_pct` reads 100; `cost_usd_30d` is measured at 417.46 at 18:01Z, not equated to gateway-only spend. Existing `qnfo-ai/spend-soft.test.mjs` covers soft-budget routing. | Reconcile provider totals/double-counting and verify every paid path's successful/failed-task costs and breach continuation. RM-COST-UNIFIED-SPEND-1 remains partial; reconciliation is assigned to coordinated session `90ad5c48-82ae-40e5-9ae6-c2276df3242f`. |
| US-06 | `/loops` is healthy; RM-WATCHMAKER-INDEX-1 is built and `owner_queue_fleet_cards_open` reads 0. | `watchmaker_index` still reads 2; the durable-execution and monitor-monitor registry entries need live reconciliation, assigned to coordinated session `582f671e-91e1-4905-84ba-7546f6fe2986`. At 18:10Z, `issues_open_over_120m` reads 420 and the drain ratio 0.714, so the SLA/throughput requirements are not satisfied. |
| US-07 | Synthetic acceptance now exercises protected-write refusal without row changes, private document/history exclusion from public responses and model context, research-route/private-binding isolation, subscriber suppression and opt-out, and existing secret-lock exclusion. See the bounded evidence below. | Offline evidence covers the selected handlers/configurations, not all deployed routes or channels. Live binding parity, outreach/channel-consent enforcement and real delivery remain unverified. No access, credentials, personal state or production protected records were changed. |
| US-08 | Existing personal utility remains the charter baseline and is outside the research P&L. | Fresh email-to-calendar/reminder/brief evidence and private-history isolation verification; this change neither reads personal documents nor sends a synthetic owner command. |
| US-09 | The funnel observer implements stage accounting, missing-transition alerts, freshness checks and explicit unmeasured attention. | External credibility evidence, complete citation coverage, brand-separated subscription attribution and actual per-publication conversion remain independently verifiable work. |
| US-10 | Research oracle health returns 200 (`2.9.0`); Ask and concept navigation are canonically partial. The public `/reading` page advertises living-paper Ask, versions and KG capabilities. | Verify actual version preservation, reproduction, consistency and answer grounding. Historical registry `not-built` labels are not proof of current absence; advertised UI capabilities are not proof of completed acceptance. The charter's H2/review prerequisites remain in force. |

### US-07 bounded acceptance evidence (2026-10-25)

The following offline tests drive the existing handlers with synthetic
nonpersonal records and mock bindings. They do not call protected production
routes, retrieve personal documents, rotate secrets or send external messages.
No runtime change was needed for the cases exercised.

| Acceptance surface | Reproducible evidence | Boundary |
|---|---|---|
| Protected mutations and private fleet context | [`open-access.test.mjs`](../qnfo-fleet-dashboard/open-access.test.mjs): anonymous, wrong-token and spoofed caller-header requests cannot edit documents, resolve queue items, ratify objectives or sync the loop; selected refused writes leave SQLite `total_changes()` unchanged. Private document/history fixtures and loop credentials appear in neither public responses nor captured public-model requests, and the private-store sentinel is never entered. Existing positive controls retain authorized mutations and anonymous reads. | Offline dashboard handlers only; no production writes or real documents. |
| Public research/private-plane separation | [`private-isolation-acceptance.test.mjs`](../qnfo-gateway/private-isolation-acceptance.test.mjs): a public paper fixture remains readable; guessed owner-document/history routes return 404 without private-store reads. Research gateway, oracle, executor and subscriber declarations exclude the private identity binding. | Declared configuration is not proof of live binding parity; selected routes are not an exhaustive route audit. |
| Suppression and opt-out | [`suppression-acceptance.test.mjs`](../qnfo-subscribers/suppression-acceptance.test.mjs): real SQLite recipient selection excludes case-insensitively suppressed, pending and unsubscribed fixtures; suppressed signup sends no confirmation; one-click opt-out prevents a subsequent mock digest; an unavailable suppression table prevents digest delivery. Missing/wrong digest authority reaches neither queries nor the mock sender. An allowed positive-control recipient proves the fixture is not vacuously empty. | All deliveries are captured by an in-process mock; no external network calls. This does not certify outreach workers, channel terms or real mail delivery. |
| Secret lock and private history | Existing [`secret-lock.test.mjs`](../qnfo-deploy-guard/secret-lock.test.mjs) proves concurrent exclusion and expired-lease recovery in SQLite; [`owner-edit.test.mjs`](../qnfo-fleet-dashboard/owner-edit.test.mjs) exercises separate private/shared stores and version-preserving edits with synthetic documents. | No secret operation or owner edit is performed in production. |

Run the three new/extended acceptance cases and the existing supporting suites
with Node using the linked paths. These observations advance US-07 evidence but
are not a blanket security, privacy, consent or deployment guarantee.
