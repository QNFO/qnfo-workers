# The content pipeline (CONTENT-PIPELINE-1)

Owner directive, 2026-10-14: "The system shall provide visibility onto the content creation process end-to-end on fleet
dashboard: what topics/ideas are in process, which are being researched, written, reviewed, edited/revised, rejected etc...
across all QNFO/Q08 properties. As the system you shall think in pipelines and end-to-end workflows as any live production
system." Pillars: research, reach.

Live page: https://fleet.qnfo.org/content (JSON: `/api/content`). Data: `qnfo-audit.v_content_pipeline`,
`v_content_stage_summary`, `content_stages`, `content_stage_events` (migrations/2026-10-14-03-content-pipeline.sql), plus
`living-paper.papers` and `q08-signal` read by qnfo-fleet-dashboard 1.37.0.

## 1. Method: the practices this pipeline follows

Each practice below comes from editorial production (newsroom and journal workflows), research integrity practice
(COPE, ICMJE, registered reports) or flow-based operations (Kanban, Little's law, SRE). Each one is written as a rule the fleet
can measure.

| # | Practice | What it means here | Where it is enforced or measured |
|---|---|---|---|
| 1 | **One stage vocabulary** | Every item, whatever table it lives in, sits in one of twelve stages: intake, triage, queued, research, draft, review, revise, publish, published, distribute, correct, rejected. Its condition is one of seven states: waiting, active, held, blocked, parked, done, rejected. | `content_stages`, `v_content_pipeline` |
| 2 | **Explicit exit gates (definition of done per stage)** | An item moves on only when a named, checkable condition holds, and one named worker enforces it. | `content_stages.exit_gate`, `enforced_by` |
| 3 | **Every transition is an event** | An append-only ledger records every status or stage change, so the time in a stage is measured from when the item entered it, not from when it was created. | `content_stage_events` (16 D1 triggers on 8 tables) |
| 4 | **Service levels per stage, in minutes** | Each live stage has an SLA. An item past it is counted, and the count is a metric with a trigger (QUEUE-SLA-1). | `content_stages.sla_min`, metric `content_items_over_stage_sla` (target 0) |
| 5 | **Limit work in progress; balance intake to throughput** | By Little's law, wait = WIP / throughput. If more ideas are accepted than papers published, the queue and the wait grow without bound. The cure is to accept less or publish more, never a longer queue. | research ready cap (RESEARCH-BACKPRESSURE-1), metric `research_deferred_pool`, the "Flow balance" panel |
| 6 | **Separation of duties in review** | The reviewer is never the author: review uses a model from another family, and layers come from disjoint families because LLM errors are correlated. | ENSEMBLE-POLICY-1, REVISER-REREAD-1 |
| 7 | **Ground on primary sources** | Every cited work is read in full text; a work that cannot be read is dropped, not summarised from its title. | CITE-FULLTEXT-1, SOURCE-VOICE-1, `narrative-prompt-guard.py` |
| 8 | **Fail-closed gates** | A gate that cannot decide holds the item; it never passes it by default. | SOCIAL-CHECK-FAIL-CLOSED-1, q08 grounding and fact-check gates, the citation gate |
| 9 | **Gate before publication, not after** | A paper goes live only after the release gate passes. A daily sweep that re-scores live papers is a second line of defence, not the first. | PUB-GATE-AT-PUBLISH-1, metric `papers_live_failing_release_gate` (target 0) |
| 10 | **Corrections and retractions are first-class stages** | Errata are queued, audited and published with the same visibility as new work; a retraction states its reason publicly (COPE). | `correct` stage, `q08_retractions.reason`, errata members of qnfo-research-exec |
| 11 | **Rejection is a disposition, not a drop** | Every stop records a reason, and nothing leaves the line without a state. A hold without an expiry is a defect (ANTIFRAGILE-1). | states `rejected` and `parked`; `held` counts against the stage SLA |
| 12 | **Measure flow, quality and outcome together** | Flow: throughput, lead time, WIP, age in stage. Quality: first-pass yield per gate, rejection rate per gate, retraction rate. Outcome: reads, citations, reader feedback. A flow metric that improves while a quality metric worsens is a regression (INTEGRITY-GUARDS-1). | /content (flow and gates), /kpi (reach), `q08_audits`, `publication_gate_audit` |

## 2. How it is visualised

The `/content` page reads the same views the metrics use, so the page and the triggers cannot disagree:

- **The line:** one card per stage, in order. Each card shows the number in flight, how many are past the SLA (amber), the oldest age, the state breakdown, and the worker that enforces the exit gate (hover to see the gate).
- **By property:** a matrix of ideas (idea-hub), papers.qnfo.org and social channels against stages. Cells past their SLA are shaded.
- **Flow balance:** ideas accepted into research against papers published, per day, plus the expected wait computed from Little's law.
- **Oldest items in flight:** the items past their SLA first, each with its raw status.
- **Gates and SLAs:** the stage catalogue, i.e. the definition of done.
- **Quality gates by property:**
  - papers.qnfo.org: release-gate verdicts (pass, thin, never scored).
  - q08.org: signal outcomes, review gates, pieces live and retracted.
  - reading.q08.org: keeps its pieces on the personal plane, so it is named here but not read.
- **Latest transitions:** the tail of the ledger.

## 3. How it is enforced without a person

The loop is the one METRIC-CLOSED-LOOP-1 already runs:

1. **Measure.** The fleet_tick trigger `content_items_over_stage_sla_tick` re-counts past-SLA items every tick. qnfo-fleet-dashboard writes `papers_live_failing_release_gate` hourly.
2. **Judge.** `v_metric_trigger_state`.
3. **Act.** qnfo-fleet-control files one deduped `agent_issues` row per breach. The trigger's action names the lever for each stage:
   - queued: lower the accept rate, or add executor capacity.
   - distribute: drain the queue, or dispose of rows that will never post.
   - review, revise, publish: read the failing stage's errors.
   - release gate: score every live paper, and route thin papers into revision.
4. **Learn.** `remedy_efficacy_30d`. A remedy that did not move its metric within 7 days is replaced.

A gate or SLA changes only by migration, with the measurement that justifies it (RULE-8-RETIRED-1).

## 4. Findings on the first read (2026-10-14 03:00Z)

- **Research:** 185 accepted ideas waited in the deferred pool, the oldest since 2026-10-09. 3 were ready, 2 were in review, and 10 were published on 2026-10-13. Intake outruns throughput (issue 2487, metric `research_deferred_pool`).
- **Distribution:** 142 Bluesky announcement rows sat queued in `dissemination_tracker` since 2026-10-01, and none have posted there since 2026-09-27. Social threads did post (latest 2026-10-11). `content_items_over_stage_sla` files this.
- **papers.qnfo.org:** 207 of 577 published papers had no passing release gate: 77 never scored, about 130 scored thin. Metric `papers_live_failing_release_gate` files this.
- **Ideas:** 448 ideas sit in `triaged_hold`, and nothing re-reads a HOLD. They are shown as parked: a decision with a reason, but no expiry.
- **Revision:** 107 papers sit at `needs-substantive-revision`, which QUALITY-GATE-1 marks as terminal. They are shown as parked so the backlog stays visible.
- **q08.org:** 132 pieces were published and 131 retracted, 124 of them in one accuracy audit between 2026-10-10 and 2026-10-12. The grounding and fact-check gates now run before publication (`q08_audits`).
