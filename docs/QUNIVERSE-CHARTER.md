# The Quniverse charter (QUNIVERSE-CHARTER-1)

Charter 1.0.7, written 2026-10-01 (1.0.1: portfolio loop; 1.0.2: Cloudflare mirror; 1.0.3: cloud-only verification; 1.0.4: every pillar graded and the portfolio repairs itself, same day; 1.0.5, 2026-10-02: the Autonomy composite is the owner-weighted SAI, section 3.1; 1.0.6, 2026-10-02: the three objective constraints are graded and enforced, section 3.1; 1.0.7, 2026-10-02: the objective-authority audit, those constraints and the 2026-10-01 weights were ratified under the owner's queue delegation, not by the owner in person, section 3.1). **This document is the heart of the system**: what the Quniverse is, what it should
be, why it exists, what it is weak and strong at, the smallest version of it that counts as working, the largest
version worth building, the order in which to build it, and the rules every development decision passes through.

It has two halves. The hand-written half (sections 1 to 8) changes only through a pull request, and the charter
version line above moves when it does. The generated half (section 9, between the `CHARTER-LIVE` markers) is
recomputed every day by `qnfo-fleet-control` from the live registers in D1 `qnfo-audit` and committed back to main, so
the charter can never be older than the fleet it describes. `scripts/charter-guard.py` fails CI when the two halves
disagree or when a new worker appears without naming the pillar it serves. `CLAUDE.md` makes reading this document
the first step of every session.

Where this charter and another document disagree: terminal objectives live in D1 `objectives` and win over everything;
`docs/STRATEGY.md` (STRATEGY-1) wins on identity, audiences, channels, outreach, signals, KPIs and portfolio; this
charter wins on the system itself (architecture, MVP, footprint, roadmap order, decision rules). `docs/BUSINESS-PLAN.md`
and `docs/QUNIVERSE-BACKLOG.md` are inputs to it, not peers.

---

## 1. What the Quniverse is (measured 2026-10-01)

The Quniverse is an **autonomous research-operations system that runs entirely on Cloudflare**: a fleet of Workers,
D1 databases, R2 buckets, Vectorize indexes, Durable Objects, Queues, Workflows, a Container and an AI Gateway, with
no server, no laptop and no human on the critical path. It researches, writes, reviews, publishes (Zenodo DOIs),
indexes, distributes and promotes research under the QNFO imprint, runs the owner's personal utility layer (email,
calendar, personal twin), and operates, audits, heals and improves itself. Its evidence of life is in D1, not in
anyone's memory.

| Plane | What it does today | Live components (2026-10-01) |
|---|---|---|
| Research pipeline | idea intake, grounding, 3-leg ensemble drafting, review, adversarial revision, Zenodo publish, PDF, knowledge graph, citation impact | qnfo-research-exec, qnfo-paper-indexer, qnfo-paper-reviser, qnfo-pdf, idea-hub, qnfo-archive, errata-hub, radar-hub, qnfo-venue-radar, qnfo-signal-loop, qnfo-agent-orchestrator |
| Reach and distribution | qnfo.org and papers.qnfo.org, subscriber capture and digest, Bluesky and Buffer posting, outreach, q08 essays, ipatent tool | qnfo-gateway, qnfo-subscribers, qnfo-social, qnfo-outreach, qnfo-email-orchestrator, q08-signal-engine, qnfo-ipatent, qnfo-cloud-ops |
| AI routing | cost-laddered model router, ensembles, RAG over the corpus, model health probes and calibration | qnfo-ai, ai-health-prober, qnfo-ai-calibration, qnfo-ai-search, qnfo-intent-orchestrator |
| Governance kernel | canonical deploy, locks and ledgers, drift scan, self-heal, measured autonomy scores, issue triage and remediation contracts, evolve loop, charter loop | qnfo-ops, qnfo-deploy-guard, qnfo-fleet-control, qnfo-autonomy-scorer, qnfo-fleet-dashboard, fleet-exec, qnfo-backlog-exec, qnfo-kaizen, qnfo-observability, qnfo-lifecycle |
| Agent substrate | tool surface for every client, persistent memory, infra RAG, skills, a shell container, a code-task loop | qnfo-tools-mcp, qnfo-memory-mcp, qnfo-infra, qnfo-skill-sync, qnfo-containers-pilot, qnfo-code-orchestrator |
| Personal utility | personal twin, calendar, companion, email intake and owner command verbs | personal-api, calendar-api, personal-companion, qnfo-email |

Footprint on 2026-10-01: 44 live Workers (cap 30, target 24), 69 cron schedules (cap 50), 10 D1 databases (`qnfo-audit`
alone has about 296 tables and 234 MB), 9 Vectorize indexes, 19 R2 buckets, 4 KV namespaces, 2 Queues, 5 Durable Object
classes, 7 Pages projects, 12 zones, 1 AI Gateway. The repository holds 105 worker directories, of which 60 are not
deployed, 6 are folded and 3 retired. Output: 451 full reports all-time, 219 Zenodo DOIs, 10 full reports in the last
30 days, 139 posts in 30 days. Audience: 1 confirmed subscriber, 2 external citations, 5,930 pageviews in 30 days.
Cost: about $725 a month in total, of which about $450 is AI spend across four providers, against a $150 unified-billing
cap that the direct-provider keys bypass. Revenue: $0.

What already works, and is worth protecting: the canonical deploy path (lock, source fetch, binding-preserving upload,
live verify, ledger, crons) with 1,506 deploys in the last 7 days; measured autonomy scores recomputed daily (unweighted
dimension mean 4.1 of 5; the owner-weighted Autonomy composite defined in 3.1 read 3.24 of 5 on 2026-10-02); an issue system with mandatory close evidence and 88.6% weekly closure; a self-heal ledger with 96% of acted
rows verified; 68 of 68 registered guards verified with a negative test; an evolve loop that has landed one self-authored
PR through its own gates.

What does not work yet, and the charter exists to fix: the system optimised volume (papers, posts, workers, crons,
tables) and is poor at attention and cost. Nothing read the charter because there was none: the mission, objective
function, business plan, backlog, strategy and autonomy policy were six documents written by six sessions, and the
fleet's own account of itself lived in no single place.

## 2. What it should be

**One sentence.** The Quniverse should be the smallest verified system that turns a research idea into read, cited,
honestly distributed work, and that runs, repairs, measures and explains itself, at a cost its results justify, with the
owner as an override and never a dependency.

**Five principles** (each one is a rule a session can check, not a slogan):

1. **Disposable compute, durable state.** Any worker, session or container may die at any moment. State lives in D1,
   R2, KV and git. A fix that is not committed to main does not exist (REPO-IS-DEPLOY-SOURCE-1). A session that ends
   without pushing has done nothing.
2. **Evidence, not claims.** A metric is computed from its source at evaluation time. An issue closes only with
   `close_evidence`. A guard that is not wired into the gate that runs is not a gate (lesson G4). "Deployed" is not
   "working"; "working" is a live probe.
3. **The smallest verified core.** Every node (worker, cron, binding, table, secret) is contract surface someone must
   verify. The target band is 20 to 24 workers; at or over cap, every new node names a same-class retirement
   (net-zero rule). Prefer folding a function into an existing worker to adding a worker. Prefer events to polling.
4. **The human is an override, never a dependency.** Every decision point has an automatic safe default
   (`docs/AUTONOMY-DECISION-POLICY.md`). Owner-only actions are listed, bounded and never on the critical path. The
   fleet proposes changes to its own objectives; it never adopts them.
5. **Reach follows credibility.** Fewer, stronger works under one identity; honest distribution inside cadence and
   consent caps; a closed measurement loop from publication to engaged human. Volume is never the headline.

**Non-goals.** The Quniverse is not a general cloud platform, a social-media growth engine, a product company, or a
multi-tenant service. It does not chase journals, buy attention, run paid promotion, or keep a worker alive because it
was fun to build. It does not delete research data automatically, ever.

## 3. Objectives and value-add

### 3.1 Terminal objectives (D1 `objectives`, ratified by the owner; immutable by the fleet)

| Key | Statement (abridged; the row is canonical) |
|---|---|
| `mission` v1 | Every recurring function runs in the cloud. The fleet operates, heals, audits, improves, publishes and promotes itself. The human role narrows to policy-setting and exception handling. |
| `objective-function` v3 | Maximise SAI = 0.15 autonomy + 0.15 thinking + 0.15 decision + 0.20 self-improvement + 0.10 reliability + 0.10 integration + 0.10 external impact + 0.05 governance, subject to the autonomy-ladder cap, the cost ceiling and the residual-consent boundary. (v3: revision goal 58, ratified by the owner on fleet.qnfo.org and applied 2026-10-01, moved 0.05 from autonomy to self-improvement.) |
| `cost-ceiling` v2 | Throttle, do not hard-cap, AI spend; one unified monthly cost figure per source; the unmanaged direct-provider spend becomes visible and bounded. |
| `return-on-spend` v3 | Tie total spend to the reach scorecard (search impressions, engaged human sessions, social engagement rate, confirmed subscribers, warm conversations, credibility events, cost per engaged human). Review gate 2026-12-31: continue the research layer if credibility events >= 2 or confirmed subscribers >= 50 or funding secured, and AI spend is inside the cap; else shrink to the selected-works core. Never delete research data automatically. |

Seven objective-function revisions proposed by the fleet await the owner (`goals` where `goal_type='objective-revision'`).
They are proposals; this charter does not adopt them.

**Which number is the "Autonomy composite" (SAI-COMPOSITE-WEIGHTS-1, 1.0.5).** The scoreboard's Autonomy composite is
the objective-function SAI above: its eight terms weighted by the ratified weights in D1 `sai_config` (`w_*`, the
rows OBJECTIVE-REVISION-APPLY-1 rewrites when a weight revision is ratified; the 2026-10-01 revision, goal 58, was
ratified under the owner's queue delegation, not by the owner in person), on a 0-5 scale (SAI out of 100,
divided by 20). `qnfo-autonomy-scorer` computes it on its daily cron with the same formula and inputs as the dashboard's
SAI (`computeSai` in `qnfo-fleet-dashboard`; an offline parity test keeps the two identical) and publishes it as
`autonomy_scores.sai_weighted` (dated, with the weights and terms in its evidence) and `survival_state.sai`. A ratified
weight revision therefore moves it on the next scorer run. The unweighted mean of the measured VSM, OODA and fleet
dimensions is a different number, `autonomy_scores.overall`, shown as the "Autonomy dimension mean": a health read of the
dimensions, not the objective, and no weight revision moves it. When the SAI cannot be measured (dashboard state older
than six hours, a missing weight), `survival_state.sai` is NULL and the composite shows its last scoring date.

**Delegated constraints (OBJECTIVE-CONSTRAINTS-1, 1.0.6; corrected 1.0.7).** Three revisions that are constraints, not
weight changes (goals 41, 43, 57), were ratified on 2026-10-01 through the dashboard route by a session acting under the
owner's queue delegation (OWNER-QUEUE-DELEGATION-1), not by the owner in person (objective-authority audit 2026-10-02,
issues 1765 and 1766). Whether delegated ratification stays allowed is the owner's decision (fleet.qnfo.org card
`objective-authority:delegated-ratification`); until then it is allowed and recorded as delegated. `qnfo-fleet-control` measures each one every hour, writes it to `metric_registry`
(graded in 3.2), files `OBJECTIVE-CONSTRAINT-BREACH-1: <metric>` when it is out of bounds and closes that issue with
evidence when it is back. A constraint whose inputs cannot be read is reported as unmeasured, never as zero.
`GET https://qnfo-fleet-control.q08.workers.dev/constraints` serves the live verdict.

| Goal | Constraint | Definition (the `metric_registry` row is canonical) |
|---|---|---|
| 41 | `capability_contract_conformance >= 1.0` | share of live workers whose `/health` advertises non-empty `capabilities[]` and `limitations[]`, snapshot under 26h (gate C6). OBJECTIVE-LIMITS-REVIEW-1 re-evaluates the terminal objectives once a day: a graded term with no decidable target (formal limit) or no observed value (knowledge limit) becomes a proposed revision on fleet.qnfo.org, deduplicated, never re-proposed after the owner decides it. |
| 43 | `energy_efficiency >= 0.8` | a compute proxy, not an energy meter (the fleet has no energy telemetry): the share of metered Workers AI neurons over 7 days that went to calls which returned, a failed call being charged its row's mean compute (energy per correct answer, JPCUB; "returned" is an upper bound on "correct"). External providers expose no compute unit and are not covered. |
| 57 | `unmanaged_direct_spend_share <= 0.5` | (gateway BYOK list cost + qnfo-ai direct DeepSeek) / (all-provider AI list cost + that direct key + the Cloudflare plan baseline), 30 days. The owner's own client keys (`cost_daily` scope `external`) are declared, not metered, and sit outside fleet cost; the share they would add is shown, not graded. |

### 3.2 Pillars

The charter grades the system on seven pillars. Each maps to a terminal objective, a set of `metric_registry` metrics
(graded daily in section 9) and the `roadmap_implementation` artifact types that serve it. Every worker, PR, issue and
roadmap item names one. The keys are the contract: `scripts/charter-guard.py` fails CI if this table and
`CHARTER_PILLARS` in `qnfo-fleet-control/worker.js` diverge.

<!-- CHARTER-PILLARS:BEGIN -->
| Pillar | Name | Objective | Graded by | Serves (roadmap artifact types) |
|---|---|---|---|---|
| `core` | Smallest verified core | mission | worker_count, drift_total, probe_coverage_pct, deploy_freshness_h, cron_compliance, guard_rcs | core, gate |
| `autonomy` | Human as override, never dependency | objective-function | open_agent_issues, fleet_context_tokens, portfolio_hygiene (synthetic: last portfolio sync, target >= 0.9), capability_contract_conformance (goal 41, target >= 1.0), autonomy composite | autonomy, governance, observability |
| `research` | Research that is read and cited | return-on-spend | publications_30d, full_reports_live_30d, zenodo_versions_per_flagship, indexed_surface | research-product |
| `reach` | Credible reach | return-on-spend | distribution_posts_30d, subscribers_growth_monthly, pageviews_30d, referral_30d, external_impact_per_dollar, zenodo_views_total | impact, web |
| `cost` | Cost that returns | cost-ceiling | cost_usd_30d, workers_ai_cost_30d_usd, gateway_cap_30d_usd, cost_per_successful_task_by_class, workers_ai_attribution_coverage_pct, energy_efficiency (goal 43, compute proxy, target >= 0.8), unmanaged_direct_spend_share (goal 57, target <= 0.5) | cost |
| `security` | A trust boundary that holds | mission | security_open_issues (synthetic: open SEC-* or category `security` issues, target 0) | security |
| `personal` | Personal utility layer | mission | personal_mvp_serving (synthetic: qnfo-email, personal-api, calendar-api serving, target 3 of 3; outside the research P&L) | personal |
<!-- CHARTER-PILLARS:END -->

### 3.3 Value-add, by whom it is for

- **For the owner:** a research practice that keeps producing, publishing and promoting without daily attention; a
  personal utility layer at near-zero marginal cost; one place (fleet.qnfo.org, this charter, `GET /charter`) that says
  truthfully what the system is doing and costing; a bounded list of owner-only actions.
- **For readers and researchers:** open, DOI-registered, versioned work under one author identity, with a public failure
  ledger, reproducible claims (blue sky), and a research oracle over the corpus.
- **For the field:** a working, measured example of an autonomous research system on commodity edge infrastructure,
  including what it costs, what it delivers and where it fails (the fleet-lessons paper, DOI 10.5281/zenodo.23079905).
- **For funders and clients:** the JPCUB energy-honesty standard and the ignorance-audit method as things others can use;
  paid assessments as the first revenue line that matches the lead pillar (STRATEGY-1 s7, s8).

## 4. SWOT

The measured SWOT in section 9 is recomputed daily from the registers. This section is the standing analysis behind it:
the structural facts that do not change from one tick to the next.

### Strengths
- **A real autonomy substrate.** Canonical deploy with lock, ledger and crons; drift scan and self-heal; measured
  autonomy scores; issue triage with SLAs and close evidence; remediation contracts that auto-close issues on a passing
  probe; an evolve loop that lands single-anchor fixes through CI gates. Few systems of this size run themselves this far.
- **Durable, inspectable state.** Everything the system knows about itself is a D1 row or a git commit. A new session
  can reconstruct the whole picture from `qnfo-audit` and this repository.
- **Output capacity.** 451 full reports, 219 DOIs, versioned flagships, a 34,657-vector research index and an
  8,349-node knowledge graph. The pipeline can produce; the constraint is not production.
- **Platform leverage.** Workers AI, AI Gateway, D1, Vectorize, R2, Durable Objects, Queues, Workflows and Containers are
  all in use; cost per task at the edge is cents, and the fixed cost is a plan, not a server.
- **Candour.** The system records its own failures (49-entry fleet-lessons ledger, `FINDING-*` documents, this SWOT).
  That is rare and is itself a publishable asset.

### Weaknesses
- **Volume over attention.** 1 confirmed subscriber, 2 citations and about 200 pageviews a day against 139 posts a month
  and 10 reports a month. Reach is the weakest pillar and the one the review gate is graded on.
- **Cost that does not return.** About $450 a month of AI spend across four providers, over cap on every provider class,
  with Workers AI unattributed to workers and direct-provider keys outside the unified cap. $0 revenue.
- **Footprint creep.** 44 live workers against a cap of 30 and a target of 24; 69 crons against 50; 60 undeployed
  directories in the repository; five parallel issue ledgers. Every extra node is verification debt (FLEET-NODE-MAP).
- **The code-change loop is narrow.** Only single-anchor edits on non-core workers land autonomously; the code
  orchestrator and code agent are built but not proven live; main has no branch protection, so gates are enforced by
  policy in code rather than by GitHub.
- **Single points of dependence.** One personal GitHub token, one ops gateway host, one AI Gateway, one owner mailbox.
- **Measurement gaps.** GA4 collected and never read; Search Console not connected; posts not joinable to visits;
  `impressions_growth_30d` reported a false +394%.

### Opportunities
- **Cost is the biggest lever.** Total spend dwarfs any near-term income. Unified spend visibility, per-provider
  throttles, prefix caching and the draft-verify ladder can halve AI spend without touching output quality.
- **Credibility events are cheap relative to volume.** One arXiv listing, one invited talk, one third party using
  JPCUB counts more at the review gate than a hundred posts. The selected-works strategy (STRATEGY-1 s2.4) is the path.
- **Consolidation is already planned.** Seven queued merges, four fleet-budget waves and a dead-sources archive would
  bring the fleet inside its cap with no loss of function.
- **Event-driven coordination.** Queues and Workflows replace time-triggered polling, cut cron count and make
  multi-step agent work durable (removes the tool-budget-exhausted failure class).
- **The practice story.** Operating an autonomous research fleet, with its ledger of failures and measured autonomy,
  is a research product in its own right and the one most likely to be read by the AI-for-science audience.
- **Grants fit the open-research framing** (NLnet 2026-11-03, Emergent Ventures, Foresight, LTFF).

### Threats
- **The review gate.** On 2026-12-31 the research layer shrinks to the selected-works core unless credibility events,
  subscribers or funding arrive. The gate is armed in `shutdown_manifest`.
- **Spend without a brake.** BYOK provider keys bypass the gateway cap; an unattributed caller (`deepseek-flash`,
  21,614 requests a week) could be a leaked key.
- **Credential exposure.** Keys in a public repository's history and a Cloudflare token in local client configs; the
  rotation is identity-bound and deferred (`SEC-EXPOSED-CREDENTIALS-UNROTATED-1`).
- **Concurrent-session drift.** Several agent sessions change the fleet at once with shared credentials; the locks and
  guards exist because each class of collision has happened at least once.
- **Platform and policy change.** LinkedIn forbids automated posting; arXiv requires endorsement; Zenodo is not in
  Google Scholar. Distribution assumptions must be re-verified, not remembered.
- **Reputation spent by automation.** Mis-encoded posts, fake `Re:` follow-ups and off-topic essays on the owner's
  accounts already cost credibility once; owner-voice gates (STRATEGY-1 s5) must hold.

## 5. MVP: the minimum verified core

The MVP is the smallest set of components that, if everything else were deleted, would still be the Quniverse. It is
the set the charter loop probes daily (section 9, "MVP" table); a component not serving files `CHARTER-MVP-DOWN-1` and
the loop closes it with evidence when it serves again. The list is `CHARTER_MVP` in `qnfo-fleet-control/worker.js`.

| Pillar | Components | Acceptance (each is a live probe, not a claim) |
|---|---|---|
| core | qnfo-ops, qnfo-deploy-guard, qnfo-ai, qnfo-tools-mcp, qnfo-memory-mcp | a merge to main deploys through `/ops/deploy` with a ledger row; a model call routes through the ladder; an MCP client lists tools and memories |
| autonomy | qnfo-fleet-control, qnfo-autonomy-scorer, qnfo-fleet-dashboard, fleet-exec | drift is detected and healed within one hourly cycle; every autonomy dimension is rescored daily; fleet.qnfo.org renders live counts; D1-defined tasks run on schedule |
| research | qnfo-research-exec, qnfo-paper-indexer, qnfo-paper-reviser | a queued idea becomes a Zenodo DOI with a PDF and a KG entry; every flagship has >= 2 versions; the index and citation stats refresh daily |
| reach | qnfo-gateway, qnfo-subscribers, qnfo-social | qnfo.org and papers.qnfo.org serve; a subscription completes double opt-in; every publication emits at least one post inside the cadence caps |
| personal | qnfo-email, personal-api, calendar-api | an owner command by email is executed and acknowledged; the morning brief and calendar publish on schedule |

Eighteen workers. Everything not in this table is optional surface: it must prove a live consumer (lesson F1), carry
traffic (lesson F2) and name a pillar, or it folds into one of these.

**MVP status today (2026-10-01):** all 18 serving (section 9). The MVP is live; what is not yet true is that the
system is only the MVP plus what has earned its place.

## 6. Blue-sky: the ideal architecture and footprint

The target state is not more capability; it is the same capability on fewer, better-connected nodes, with the human
loop closed at every stage. Each item below is a direction with a measurable end state, not a promise of a date.

**Architecture**
- **One governance kernel** (`qnfo-fleet-control`) owning drift, heal, scores, metrics, remediation, evolve and charter;
  the watchtower family (kaizen, observability, dashboard, calibration, backlog-exec) folded into it or into fleet-exec.
- **Event-driven pipelines on Queues and Workflows.** Research, versioning, outreach, errata and issue remediation chain
  producer to consumer; crons remain only as heartbeats and dispatchers. Target: <= 48 schedules, one dispatcher cron.
- **Durable agents.** Multi-step agent work runs on Workflows with checkpointed continuation; a session or tool budget
  ending mid-task is a resume, not a failure.
- **A real code loop.** issue -> code task -> branch edit -> container-verified tests -> PR -> gated self-merge ->
  canonical deploy -> live verification -> issue closed with evidence, for multi-file changes and core workers, with
  main protected by GitHub-enforced required checks.
- **One MCP** (tools, memory, skills, search) and one AI router with unified billing; every Workers AI call attributed
  to a worker; per-provider throttles; prefix caching; the draft-verify ladder on every paid path.
- **A closed reach loop.** `reach_signals` fed by RUM, GA4, Search Console, Buffer, Bluesky, Threads, Zenodo, OpenAlex
  and email; UTM on every link; a bandit over topic, format and slot; a weekly search loop; owner-voice gates on
  every outgoing item.
- **A trust boundary.** Secrets Store with scripted rotation, Cloudflare Access on admin routes, WAF and rate limits on
  public endpoints, a Tail Worker for unsampled exceptions, Analytics Engine meters for cost per task.
- **Research products that are used, not only published.** Ask QWAV (the public research oracle), the living paper,
  a reproduce button per computational claim, the cross-paper consistency engine, the concept-graph navigator.

**Footprint (end state)**

| Class | Today | Cap | Target | End state |
|---|---|---|---|---|
| Workers | 44 | 30 | 24 | 20 to 24: the MVP 18 plus at most 6 earned extras |
| Cron schedules | 69 | 50 | 50 | <= 48, one dispatcher |
| D1 databases | 10 | 10 | 8 | 8, with a retention policy on `qnfo-audit` |
| Vectorize indexes | 9 | 10 | 8 | 8 |
| R2 buckets | 19 | 20 | 16 | 16, unbound buckets dispositioned |
| Repository worker dirs | 105 (60 undeployed) | n/a | n/a | live dirs only; the rest under `archive/` with a manifest |
| AI spend, 30 days | about $450 | $150 unified | $110 | <= $60 gateway, every provider inside its class cap, 100% attributed |
| Open agent issues | 20 | n/a | <= 10 | <= 10, all with a machine-executable remediation contract |
| Watchmaker index (recurring ops needing a human) | not published | n/a | 0 | published daily, 0 |

## 7. Roadmap

Horizons are tied to the review gate, not to the calendar. The order within a horizon is the priority score the loop
computes daily (pillar weight x status weight; section 9 lists the head of the queue). Items are
`roadmap_implementation` rows and `agent_issues`; this section names the themes, not every row.

**H0, now to 2026-10-31: stop the bleeding, prove the measurements.**
- Cost: unified spend across every provider (RM-COST-UNIFIED-SPEND-1), Workers AI attribution to >= 80% of calls,
  per-provider throttles, gateway spend toward $60 a month (STRATEGY-1 s8). Owner-held: raising or lowering any cap.
- Reach measurement: `reach_signals`, post IDs and UTM on every link, the impressions metric fixed to complete windows,
  `citation_pdf_url` on paper pages (issues 1711, 1712, 1714, 1715). Owner-held: GA4 and Search Console access.
- Identity and consent: identity lexicon on every public page, outreach consent rules live, q08 off owner channels,
  LinkedIn drafts via Buffer (STRATEGY-1 s10 week 1).
- Core hygiene: close the gate-verify items (free-first parity, dead probes, SEO JSON-LD, DNS and headers), finish the
  seven queued merges (RM-CONSOLIDATION-WAVE-B-1), fix the violated gates C5 (declared vs live schedules) and G2
  (every register has a disposition actor).
- Security: the coordinated credential rotation (SEC-EXPOSED-CREDENTIALS-UNROTATED-1; identity-bound, owner-held),
  `qnfo-memory-mcp` authentication, rate limits on `qnfo-containers-pilot`.

**H1, to the 2026-12-31 review gate: earn credibility, shrink to the verified core.**
- Selected works to arXiv (works 1, 2, 4), NLnet submission, the assessment offer to warm contacts, the monthly
  research note, the LinkedIn document-post series. Target: 3 credibility events, 50 confirmed subscribers,
  10 citations (STRATEGY-1 s9).
- Fleet budget waves W1 to W4 (MCP 4 -> 1, watchtower 5 -> 2, verify-then-retire, storage prune); the dead-sources
  archive; D1 retention. Target: <= 30 live workers, <= 50 schedules.
- The code loop: deploy the code orchestrator through wrangler, run one real task end to end, add a test-running
  verifier and a webhook wake-up; branch protection on main with the gate, guard, mirror-guard, comparator and
  charter-guard checks required.
- Durable agent execution on Workflows; the watchmaker index published daily; the monitor-the-monitors watchdog.
- A `security` registry metric (open SEC-* issues, probe exposure) so the pillar is graded, not asserted.

**H2, after the gate: build what readers use.**
- Event-driven coordination on Queues; the research pipeline on Queues plus Browser Rendering.
- Ask QWAV public; the living paper; the reproduce button; the consistency engine; the concept-graph navigator.
- L5 distillation and the full draft-verify ladder; Analytics Engine meters; Tail Worker.
- Secrets Store, Access, WAF; the QOKI open mirror if the owner chooses it.

**Parked, with the default in effect** (`docs/AUTONOMY-DECISION-POLICY.md`): premium digest and ipatent B2B (no
payment rail, no audience yet), multi-channel beyond Buffer, Cloudflare One email and DLP, MCP OAuth, unbound R2
disposition, the DO agents decision, qnfo-agent-ws. None of these blocks anything above.

**Owner-only actions, the complete list:** connect LinkedIn (and optionally Mastodon, Threads, X) in Buffer once;
approve each LinkedIn draft with one tap; grant GA4 Viewer and Search Console access to the service account; ask one
established arXiv author for an endorsement; add the selected works to ORCID; paste the bio into LinkedIn; rotate the
identity-bound Cloudflare token; ratify or reject the seven proposed objective revisions; change any spend cap; confirm
any data deletion by email. Everything else is the fleet's.

## 8. Decision rules: how the charter is baked into development

These rules bind every session, worker, workflow and PR. They are enforced where a machine can enforce them
(`charter-guard`, `version-bump-guard`, `mirror-guard`, `dup-worker-name-gate`, the net-zero budget gate, the issue
close-evidence trigger) and stated here for the rest.

1. **Name the pillar.** Every PR, commit of substance, issue and roadmap item names the pillar it serves. A new worker
   directory declares `# charter-pillar: <key>` in `wrangler.toml` or CI fails. Work that serves no pillar is parked.
2. **Net-zero nodes.** At or over cap, a new worker, cron, table family or binding names the same-class retirement it
   funds. Folding beats adding. A directory that is not deployed carries a `RETIRED` or `FOLDED` marker or moves to
   `archive/`.
3. **Measure before you claim.** A change that affects a graded metric is reported with the metric's value before and
   after. "Deployed" is never evidence; a live probe is. An issue closes only with `close_evidence`.
4. **Automatic safe default.** No critical-path step waits for a human. Tier 1 decisions (reversible, bounded, inside
   limits) are taken and recorded; tier 2 (credentials, spend, external publication as the owner, data deletion) park
   with the default stated; the "never" list (raise a cap, mint or rotate a live credential, delete data, disable a
   guard, bypass the canonical deploy, post or mail as the owner outside the STRATEGY-1 gates) is refused.
5. **Prefer the cheapest correct path.** Deterministic before cached before cheap model before cascade before ensemble;
   paid paths only with a verifier; one cost policy per path.
6. **Reach inside the gates.** Every outgoing item passes the owner-voice gates (fact check, identity lexicon, encoding,
   live UTM link, cadence cap, kill switch, daily digest). Volume is never a target.
7. **The charter is read, not remembered.** Sessions read this document and `GET /charter` first. Roadmap order comes
   from the computed queue, not from whichever issue was filed last. Hand-written sections change by PR with a version
   bump; the generated section is never hand-edited.
8. **Record the decision where the next session will look.** PR text, `agent_issues` description, `issue_triage`,
   `roadmap_implementation.evidence`, or this document. A decision that lives only in a chat transcript was not made.

## 9. How this charter maintains itself (CHARTER-LOOP-1)

- **Writer.** `qnfo-fleet-control` runs `charterTick` on its daily `0 3 * * *` cron (and on `POST /charter/tick` with
  the admin token). It reads the registers (`objectives`, `metric_registry`, `impact_thresholds`, `fleet_budget`,
  `survival_state`, `shutdown_manifest`, `autonomy_scores`, `roadmap_implementation`, `agent_issues`,
  `worker_live_audit`, `guard_registry`, `subscribers`, `goals`, `fleet_deploys`, `service_registry`), grades the
  pillars, probes the MVP, computes the SWOT, horizons, review gate and breaches, renders the block below, writes one
  `charter_snapshots` row, files or closes `CHARTER-MVP-DOWN-1` issues, and commits the block to main through the
  GitHub Contents API when it changed (at most once per UTC day). A document without both markers is never written.
- **Readers.** `GET https://qnfo-fleet-control.q08.workers.dev/charter` returns the latest snapshot (`?live=1`
  recomputes; `&facts=1` includes the raw registers), `GET /charter.md` returns the block, and `GET /charter/full.md`
  returns this whole document from Cloudflare R2 (`qnfo-canonical/docs/QUNIVERSE-CHARTER.md`, rewritten on every tick, so
  the charter is readable when GitHub or an agent session is not). The dashboard and any session
  read the same JSON.
- **Gates.** `charter-guard.yml` runs `qnfo-fleet-control/charter.test.mjs` (the pure half of the loop, replayed on the
  fixture `charter.fixture.json`) and `scripts/charter-guard.py` (document shape, pillar parity, new-worker pillar
  declarations) on every PR and push that touches the charter, the kernel or a `wrangler.toml`.
- **Changing the charter.** Hand-written sections: a PR that bumps the version line. Pillars: change `CHARTER_PILLARS`
  and the table in 3.2 together (the guard enforces parity). MVP: change `CHARTER_MVP` and the table in section 5
  together. Generated section: never by hand.
- **Portfolio.** The sibling loop PORTFOLIO-LOOP-1 (`docs/PORTFOLIO.md`) keeps every QNFO GitHub repository in the
  same register: tier, charter pillar, WBS codes, hygiene. It runs from the kernel's hourly cron when its last sync is
  older than 20 hours, writes `portfolio_repos`, and regenerates `docs/PORTFOLIO.md`, `QNFO/.github/PORTFOLIO.md` and
  the index on the organisation profile README. The charter's live block carries its summary line.
- **The portfolio repairs itself (PORTFOLIO-HYGIENE-1, 1.0.4).** Each sync fixes, on at most 12 repositories, what is
  deterministic and reversible: a missing LICENSE file (the QNFO Unified License Agreement from `QNFO/license`), an
  empty description (the README's first paragraph), missing topics (the tier baseline plus the slugs of the programs
  served) and an empty `program_registry.github_repo` whose slug or code the repository names. Every action is a
  `portfolio_actions` row, `GET /portfolio` lists the last forty, and `portfolio_hygiene` is graded under the autonomy
  pillar. Nothing is archived or deleted. Pillars without a registry metric (security, personal) are graded from the
  same facts the tick reads (CHARTER-GRADE-ALL-PILLARS-1), so no pillar reads "n/a".
- **No Claude on the path (CLOUD-ONLY-VERIFICATION-1).** Every datum this charter and the portfolio rest on is in D1,
  R2 or GitHub, and every recurring check is a Cloudflare cron. The kernel's hourly LOOP-WATCH-1 reads the two loops'
  own ledgers (`charter_snapshots`, `portfolio_sync_runs`) and files `CHARTER-TICK-STALE-1`, `CHARTER-COMMIT-FAILED-1`,
  `PORTFOLIO-SYNC-STALE-1` or `PORTFOLIO-WRITE-FAILED-1` as deduped issues, closing them with evidence when the loop
  recovers; `GET /loops` serves the verdict. Agent sessions may read these surfaces; nothing waits for one.
- **Ratified constraints are enforced, not quoted (OBJECTIVE-CONSTRAINTS-1, 1.0.5).** The same hourly cron measures the
  delegated constraints in 3.1, writes one `objective_constraint_runs` row per tick (listed in the dashboard's
  watchmaker index), files and closes `OBJECTIVE-CONSTRAINT-BREACH-1` issues, and once a day proposes objective
  revisions for terms the fleet cannot decide or observe. `GET /constraints` serves the verdict and the review preview.
- **Failure modes it accepts.** If GitHub is unreachable the snapshot still lands in D1 and the next day retries. If a
  register is missing the loop reports the fact as unmeasured rather than failing. If the kernel itself is down, the
  staleness of the timestamp below is the alarm (`RM-MONITOR-THE-MONITORS-1` is the roadmap item that makes it one).

<!-- CHARTER-LIVE:BEGIN -->
_Generated by qnfo-fleet-control CHARTER-LOOP-1 at 2026-10-05T03:00:35.473Z (charter 1.0.7). Do not edit by hand: the next daily tick overwrites this section. Live JSON: `GET https://qnfo-fleet-control.q08.workers.dev/charter`._

### Scoreboard

| Signal | Value |
|---|---|
| Charter health (mean pillar health, metrics meeting target) | 0.63 |
| Autonomy composite (owner-weighted SAI / 20, sai_config weights; qnfo-autonomy-scorer sai_weighted = survival_state.sai) | 3.06 / 5 (scored 2026-10-04) |
| Autonomy dimension mean (unweighted, autonomy_scores.overall) | 3.9 / 5 |
| MVP components serving | 18 / 18 |
| Live workers (service_registry) | 44 |
| Open agent issues (high) | 123 (70) |
| Canonical deploys last 7d (ok) | 2822 (2776) |
| Confirmed subscribers | 1 |
| Objective revisions awaiting ratification | 1 |
| Survival state (sai / survival_score) | 3.06 / 0.24241379310344824 at 2026-10-04 22:30:55 |

### Pillars

| Pillar | Objective | Metrics met | Health | Missing target |
|---|---|---|---|---|
| core: Smallest verified core | mission | 3/5 | 0.6 | worker_count, guard_rcs |
| autonomy: Human as override, never dependency | objective-function | 3/4 | 0.75 | open_agent_issues |
| research: Research that is read and cited | return-on-spend | 3/3 | 1 | none |
| reach: Credible reach | return-on-spend | 1/2 | 0.5 | subscribers_growth_monthly |
| cost: Cost that returns | cost-ceiling | 4/7 | 0.57 | cost_usd_30d, workers_ai_cost_30d_usd, workers_ai_attribution_coverage_pct |
| security: A trust boundary that holds | mission | 0/1 | 0 | security_open_issues |
| personal: Personal utility layer | mission | 1/1 | 1 | none |

### MVP (the minimum verified core)

| Component | Pillar | Role | Live | Version |
|---|---|---|---|---|
| qnfo-ops | core | canonical deploy path (/ops/deploy), service registry, ops agent | yes (SYNC) | 2.38.40-error-detail-capture |
| qnfo-deploy-guard | core | deploy lock, deploy ledger, secret-lock leases, mutation detector | yes (SYNC) | 1.3.22-work-claim-unify |
| qnfo-ai | core | model router and research gateway (cost ladder, ensembles, RAG) | yes (SYNC) | 5.31.1-aig-metadata |
| qnfo-tools-mcp | core | the machine tool surface every client uses | yes (SYNC) | 1.2.0-owner-queue |
| qnfo-memory-mcp | core | persistent agent memory (D1 + Vectorize + KG) | yes (SYNC) | 2.0.5-capability-contract |
| qnfo-fleet-control | autonomy | governance kernel: drift scan, self-heal, evolve, metrics, charter loop | yes (SYNC) | 0.4.115-cycle-time-1 |
| qnfo-autonomy-scorer | autonomy | measured VSM/OODA autonomy scores and survival state | yes (SYNC) | 1.2.1-priority-queue |
| qnfo-fleet-dashboard | autonomy | the owner surface (fleet.qnfo.org) and probe coverage | yes (SYNC) | 1.21.4-owner-keys-view |
| fleet-exec | autonomy | D1-defined task engine and cron dispatcher | yes (SYNC) | 1.0.3-capability-contract |
| qnfo-research-exec | research | research queue -> publish (Zenodo DOI, PDF, KG) | yes (SYNC) | 0.9.57-codeagent |
| qnfo-paper-indexer | research | corpus index, versions, citation impact | yes (SYNC) | 3.0.11-render-health |
| qnfo-paper-reviser | research | adversarial revision loop | yes (SYNC) | 1.2.7-flagged-errata |
| qnfo-gateway | reach | qnfo.org and papers.qnfo.org, the home of record | yes (SYNC) | 3.9.3-allowlist |
| qnfo-subscribers | reach | the owned audience (double opt-in, digest) | yes (SYNC) | 1.1.6-client-ip |
| qnfo-social | reach | distribution of published work inside the cadence caps | yes (SYNC) | 0.7.35-link-facet-utm |
| qnfo-email | personal | owner channel: alerts, command verbs, intake | yes (SYNC) | 2.3.1-itinerary-ingest |
| personal-api | personal | personal twin (calendar, tasks, memory, brief) | yes (SYNC) | 4.7.0-gcal-ics |
| calendar-api | personal | calendar plane and ICS publish | yes (SYNC) | 0.7.0-host |

### SWOT, measured today

**Strengths**

- full_reports_live_30d = 26 (target >=2 by 2026-10-25, then >=1/month)
- zenodo_versions_per_flagship = 3 (target >=2 per flagship)
- gateway_cap_30d_usd = 150 (target <=150)
- publications_30d = 26 (target >=2/30d)
- distribution_posts_30d = 137 (target >=1/day via qnfo-social)
- drift_total = 0 (target 0)
- deploy_freshness_h = 12.68 (target < 24h behind repo main)
- fleet_context_tokens = 209109 (target <=1000000)
- cost_per_successful_task_by_class = 0.0022 (target <0.05 USD/task)
- probe_coverage_pct = 97.7 (target >=95)
- ops_owner_turn_incomplete_pct_7d = 0 (target < 5)
- ops_agent_empty_answers_7d = 0 (target 0)
- human_wait_oldest_days = 2.8 (target <= 3)
- capability_contract_conformance = 1 (target >= 1.0)
- and 46 more

**Weaknesses**

- subscribers_growth_monthly = 0 vs target +10 new/month
- workers_ai_cost_30d_usd = 60.01 vs target <= 7.50
- worker_count = 44 vs target <= 24
- cost_usd_30d = 454.03 vs target <= 200
- open_agent_issues = 123 vs target <=10
- guard_rcs = 1 vs target all 0
- workers_ai_attribution_coverage_pct = 0.5 vs target >= 80
- invest_decision_level = 2 vs target 0 continue, 1 continue-at-risk, 2 scale back, 3 stop, -1 unknown
- human_actions_open = 14 vs target 0
- watchmaker_index = 3 vs target 0
- session_execution_ratio_30d = 0.75 vs target >= 0.8
- metrics_in_breach = 21 vs target 0
- code_task_success_rate_30d = 0.3 vs target >= 0.6
- breach_code_task_pct = 0.0 vs target >= 30
- and 24 more

**Opportunities (highest-leverage open roadmap items)**

- RM-CITATION-TRACKING-ALL-DOIS-1 [reach, partial]: Daily Crossref/OpenAlex/Zenodo impact collection for all 217 DOIs feeding impact_scores
- RM-COST-FREE-FIRST-PARITY-1 [cost, partial]: Audit every AI-calling worker for one cost policy per path (streaming vs non-streaming, cron vs manual, agent 
- RM-COST-L6-DRAFT-VERIFY-1 [cost, partial]: L6 formal draft-verify pipeline (free draft, paid verify/repair) beyond the code class
- RM-COST-PER-TASK-ALL-PATHS-1 [cost, partial]: Cost per successful task by class across every AI path (research ensemble, q08, kaizen, calibration), not only
- RM-COST-PREFIX-CACHE-1 [cost, partial]: Realize provider prompt/prefix caching (cache_read_tokens is 0 today)
- RM-COST-UNIFIED-SPEND-1 [cost, partial]: One unified monthly cost_usd: gateway unified billing + BYOK providers + Workers AI + Cloudflare plan
- RM-CODE-ORCHESTRATOR-1 [autonomy, partial]: Autonomous self-verifying cloud code agent: plan -> branch edit -> container verify -> iterate -> PR
- RM-NO-CLAUDE-RUNTIME-1 [autonomy, partial]: No Claude dependency at runtime: every recurring operation, owner document, decision and dashboard runs on Clo
- RM-NOVEL-FAILURE-REPAIR-1 [autonomy, partial]: Scripted repair for novel failure classes: failure-class -> remediation_modules library with automatic dispatc
- RM-OODA-DEPLOY-LATENCY-1 [autonomy, partial]: Deploy-class act latency days -> minutes: canonical deploy on merge is live; remaining: agent-authored fixes o
- RM-PROBE-VERIFIED-COVERAGE-1 [autonomy, partial]: Verified probe coverage: content assertions (not only HTTP 200) for all 39 workers; cron-only workers via hear
- RM-S1-REDUNDANCY-1 [autonomy, partial]: S1 redundancy: failover host and read-only degraded mode for the single ops gateway; workers.dev fallback adde

**Threats**

- shutdown_manifest phase 0 OWNER-KILL ARMED (due continuous)
- shutdown_manifest phase 1 ALL-RESEARCH ARMED (due 2026-12-31)
- review gate 2026-12-31 OPEN: credibility_events 0; confirmed_subscribers 1; funding 0 (2026-10-01)
- AI spend ai_spend:total $224.55 over cap $150
- AI spend ai_spend:openai $197.78 over cap $60
- AI spend ai_spend:deepseek $169.47 over cap $50
- AI spend ai_spend:workers-ai $60.01 over cap $25
- AI spend ai_spend:anthropic $25.96 over cap $15
- open security issue #1969 SECRET-CHANGE-OBSERVED: qnfo-ops 2026-10-04
- open security issue #1968 SECRET-CHANGE-OBSERVED: qnfo-ai 2026-10-04
- open security issue #1967 SECRET-CHANGE-OBSERVED: personal-api 2026-10-04
- open security issue #1966 SECRET-CHANGE-OBSERVED: idea-hub 2026-10-04
- open security issue #1783 RUN-INTERNAL-1: qnfo-research-exec inline run and drain-v2 answer internal calle
- 70 open high-priority issues (reliability 22, owner-request 15, governance 5, dissemination 4)

### Roadmap by horizon (roadmap_implementation)

| Horizon | Meaning | Items |
|---|---|---|
| H0 | now: broken, violated or awaiting gate verification | 3 |
| H1 | to the 2026-12-31 review gate: partial builds to finish | 27 |
| H2 | after the gate: not yet built | 32 |
| watch | gates enforced but partial or unverified | 25 |
| parked | owner decision, deferred or local-only (a default is in effect) | 18 |
| done | gates enforced and verified, or remediated | 20 |

Top of the queue (priority = pillar weight x status weight):

- H1 RM-CITATION-TRACKING-ALL-DOIS-1 [reach, partial] Daily Crossref/OpenAlex/Zenodo impact collection for all 217 DOIs feeding impact_scores
- H1 RM-COST-FREE-FIRST-PARITY-1 [cost, partial] Audit every AI-calling worker for one cost policy per path (streaming vs non-streaming, cron vs manual, agent 
- H1 RM-COST-L6-DRAFT-VERIFY-1 [cost, partial] L6 formal draft-verify pipeline (free draft, paid verify/repair) beyond the code class
- H1 RM-COST-PER-TASK-ALL-PATHS-1 [cost, partial] Cost per successful task by class across every AI path (research ensemble, q08, kaizen, calibration), not only
- H1 RM-COST-PREFIX-CACHE-1 [cost, partial] Realize provider prompt/prefix caching (cache_read_tokens is 0 today)
- H1 RM-COST-UNIFIED-SPEND-1 [cost, partial] One unified monthly cost_usd: gateway unified billing + BYOK providers + Workers AI + Cloudflare plan
- H1 RM-CODE-ORCHESTRATOR-1 [autonomy, partial] Autonomous self-verifying cloud code agent: plan -> branch edit -> container verify -> iterate -> PR
- H0 RM-DEAD-PROBES-VERIFY-1 [core, gate-verify] Close the dead-probe deletions (size-semantics-probe-a/b, qnfo-egress-probe, qnfo-ops-ledger-selftest: already
- H1 RM-NO-CLAUDE-RUNTIME-1 [autonomy, partial] No Claude dependency at runtime: every recurring operation, owner document, decision and dashboard runs on Clo
- H1 RM-NOVEL-FAILURE-REPAIR-1 [autonomy, partial] Scripted repair for novel failure classes: failure-class -> remediation_modules library with automatic dispatc
- H1 RM-OODA-DEPLOY-LATENCY-1 [autonomy, partial] Deploy-class act latency days -> minutes: canonical deploy on merge is live; remaining: agent-authored fixes o
- H1 RM-PROBE-VERIFIED-COVERAGE-1 [autonomy, partial] Verified probe coverage: content assertions (not only HTTP 200) for all 39 workers; cron-only workers via hear
- H1 RM-S1-REDUNDANCY-1 [autonomy, partial] S1 redundancy: failover host and read-only degraded mode for the single ops gateway; workers.dev fallback adde
- H2 RM-BESPOKE-REPORTS-1 [reach, not-built] Bespoke research reports offered through warm outreach replies (12 replied)
- H2 RM-BUFFER-MULTICHANNEL-1 [reach, not-built] Decide multi-channel distribution (LinkedIn/X/Mastodon via Buffer, BUFFER_TOKEN unprovisioned) vs own-pages-on

### Review gate 2026-12-31

State **OPEN**. credibility_events >= 2 OR confirmed_subscribers >= 50 OR funding_secured, AND ai_spend_30d within the $150 cap (docs/STRATEGY.md s9) Baseline: credibility_events 0; confirmed_subscribers 1; funding 0 (2026-10-01).

### Charter breaches

None. Every MVP component is serving.

### Portfolio (GitHub organisation QNFO)

127 repositories (10 private): platform 14, research 14, demo 8, archived 75; synced 2026-10-05T02:00:34.649Z. Full register: docs/PORTFOLIO.md and `GET /portfolio`.

### Terminal objectives (qnfo-audit.objectives, immutable by the fleet)

- **mission** v1 (ACTIVE, ratified 2026-09-14): Every recurring function runs in the cloud. The fleet operates, heals, audits, improves, publishes, and promotes itself. The human role narrows to policy-setting and exception handling.
- **objective-function** v3 (ACTIVE, ratified 2026-10-01): Maximize SAI = 0.15*autonomy + 0.15*thinking + 0.15*decision + 0.20*self_improv + 0.10*reliability + 0.10*integration + 0.10*external_impact + 0.05*governance, subject to the autonomy-ladder cap, cost ceilings (A9), and the residual-consent...
- **cost-ceiling** v2 (ACTIVE, ratified n/a): CORRECTED 2026-09-26 (units error fixed): AI Gateway billing is in CENTS. Actual AI Gateway spend ~$110/mo (20×$10.50 top-ups + $21 manual = $231 over 62.5d) with real gateway usage ~$5.51/24h (~$165/mo), right at/under the declared $150/mo...
- **return-on-spend** v3 (ACTIVE, ratified 2026-10-01): REVISED 2026-10-01 (docs/STRATEGY.md s6.3, s8, s9): tie total spend (~$725/mo on 2026-09-26: Cloudflare plan ~$200, direct providers ~$400-500 unmanaged, AI Gateway ~$110-170) to return measured by the reach scorecard: search impressions (G...
<!-- CHARTER-LIVE:END -->
