# Ensemble policy for fleet writing (ENSEMBLE-POLICY-1)

Charter pillar: **reach** (quality of what the fleet publishes), constrained by **cost**. Owner directive 2026-10-03: all writing
across q08 and qnfo gets multiple uncorrelated models and writing / review / edit levels, as in a diversified portfolio.

## The premise needs one correction

Diversification works when the holdings fail independently. LLM errors mostly do not.

- Kim et al., *Correlated Errors in Large Language Models* (ICML 2025, arXiv 2506.07962): on one leaderboard, models agree 60% of the
  time when both are wrong; shared architecture and provider raise this, and **larger, more accurate models correlate more**, even
  across providers.
- *Nine Judges, Two Effective Votes* (arXiv 2605.29800, 2026): a 9-judge panel over 7 model families was worth **2.18 effective
  independent votes** (mean pairwise phi 0.39); the first five judges gave 90% of that, judges 6-9 added 0.22; better aggregation
  (Dawid-Skene, accuracy weighting) closed at most 11% of the gap; prompt and temperature changes did not move it. Human annotators
  reached 4.0-5.8.
- Verga et al., *Replacing Judges with Juries* (PoLL, arXiv 2404.18796): a panel of **small** models from **disjoint families**
  beat one large judge, at about 1/7 the cost, with less self-preference.
- Wataoka et al., *Self-Preference Bias in LLM-as-a-Judge* (arXiv 2410.21819): a model rates text it finds familiar (low perplexity)
  higher, which includes its own and its lineage's. A judge from the writer's family is not independent.

So the fleet does not get risk-free by stacking models. It gets lower risk by (1) a **few** judges, (2) from **disjoint families**,
(3) **small** ones, (4) **never the writer's family**, and above all (5) by keeping layers that are not models at all.

## Layers, by independence class

| Class | Layer | Why it is independent of the writer model |
|---|---|---|
| A. Not a model | deterministic gate (regex rules, banned-precedent list, Title Case, metadata leak) | fails on rules, not on taste |
| A. Not a model | real reader votes (`q08_feedback`) | human behaviour |
| A. Not a model | the owner's verdict and standing directions (`q08_owner_verdicts`, `q08_editor_notes`, written only from the emailed-code session) | the one calibrated human |
| B. Different family | reader panel: 2 judges, small, families other than the writer's | PoLL; partly correlated, measured |
| B. Different family | editor: the other writer family, editing against the panel's notes | removes the writer's own habits |
| C. Same family | anything the writer family also does (self-critique, self-retry) | **not counted as a layer** |

## Rules for any worker that writes prose someone outside the fleet will read

1. Writer, panel judges and editor come from **different families**. `MODEL_FAMILY` in q08-signal-engine/worker.js is the reference
   map; `model_ladder_models.family` in qnfo-audit is the fleet's.
2. At most **2 judges per round**, and a **fresh** panel (families not yet used on the piece) after an edit. More judges from the same
   lineage buy about 0.2 votes past five and cost real money.
3. Judges are **small-active-parameter** models. A 120B writer is not used as a judge.
4. Class A layers run first and are never removed to make room for a model layer.
5. A panel with no valid verdict **fails open** after the deterministic gate has passed, so an outage cannot stop publishing.
6. **Measure the correlation you assumed.** q08 records every judge's verdict in `q08_reader_tests` and publishes
   `q08_panel_effective_votes_30d` (n_eff = 2 / (1 + phi)); a trigger fires below 1.3 and its lever replaces the most correlated
   family. A worker that adopts a panel records its verdicts the same way.
7. **Budget (core prompt rule 8).** While any `fleet_budget` cap is breached (2026-10-03: ai_spend total 224.55 against 150), a
   ladder may not add net model calls. q08 offsets with `ops_config q08_max_per_day = 3` (was 10), a daily attempt cap of twice
   that, and small judges. Guard: `q08_neurons_per_published_piece_7d` was 643 on 2026-10-03; the change is judged by that figure
   not rising (its existing trigger fires at 6000, which is a ceiling, not the bar for this change).
8. Do not tune the panel to a pass rate. Raising or lowering the bar to hit publication volume turns the layer into a rubber stamp
   or a wall; change the bar only with the correlation and reader-vote evidence in hand.

## Adoption

- q08-signal-engine 0.8.5: writer -> gate -> panel -> editor (other family) -> fresh panel -> publish. Reference implementation.
- Other writers, filed as `agent_issues` with a `code-task` line: qnfo-paper-explainer (single model, llama), qnfo-errata-respond
  (single model, glm-5.3-flash), and the qnfo-ai ensemble pools (two deepseek and two zai entries; investigate pairwise agreement
  first). qnfo-social already separates composer (deepseek) from checker (llama) and is not reopened. qnfo-email-orchestrator
  (llama) was not reviewed in depth and is not filed.

## Counter-evidence and failure modes (kept here on purpose)

- Two judges may still agree for the wrong reason (shared blind spots). Mitigation: class A layers and the n_eff metric; not a cure.
- A strict panel can reject most drafts and cut output. The attempt cap bounds spend; `publications_30d` shows the cost.
- Small judges may be worse than large ones at taste. PoLL measured evaluation agreement, not literary quality; this fleet's own
  evidence is the reader-vote and owner-verdict rate on published pieces, which will take weeks at current traffic.
- Model availability: ids in `PANEL_POOL` were taken from `model_ladder_models`, not probed on the account from the build session.
  An unavailable id errors, is replaced from the spare pool and is visible as missing rows in `q08_reader_tests`.

## Findings log, 2026-10-03 (read from live D1 and the repository by the session that wrote this policy)

Kept here, in the repository, because the fleet must not depend on a session's memory (NO-CLAUDE-RUNTIME-DEPENDENCY-1).

| # | Finding | Evidence | Status |
|---|---|---|---|
| 1 | The q08 gate is not the quality bottleneck any more. The 7-day gate pass rate (0.427) is a lagging average: since 2026-10-01, 22 of 26 finished runs published. The 20 `no H1 title` failures were all on 2026-09-26..09-30 and stopped on their own. Drafts that now pass the gate are the ones a reader judged "AI slop". | q08-signal `engine_runs` by day and error | self-resolved; the panel (PR 562) is the next layer |
| 2 | q08 published 9 and 10 pieces on 2026-10-01 and 2026-10-02 (cap was 10). Volume, not just wording, diluted the site. | `engine_runs` published per day | cap set to 3 (`ops_config q08_max_per_day`) |
| 3 | The PERFORMANCE-LOOP-1 lever `q08-cadence` mirrors `ops_config` with compare-and-swap, so the manual cap of 3 is read back as the current value and is not fought. No experiment is running (`perf_experiments` empty). | `perf_levers`, qnfo-fleet-control perf block | no conflict |
| 4 | ASK-LOOP-1 (the closest existing loop for generated text) has never judged a row: `ask_evals` 0 rows, `ask_events` 25 rows, 4 flagged for judging, 0 judged; the 03:43Z tick logged `judged:0` because `judge()` swallowed every failure. Writer families (meta, zai, alibaba) and the judge (deepseek) are already disjoint, so the design follows this policy; the loop is not running. | qnfo-audit `ask_loop_runs`, `ask_events` | PR 566 (visibility + 3000-token budget); cause unverified |
| 5 | Even a working ask judge cannot drive its A/B: it needs 30 judged answers per arm and traffic is about 25 asks a week. | `MIN_ARM_JUDGED = 30` | open decision, not changed |
| 6 | `ai-health-prober` does not probe four models that text-writing loops depend on: nemotron-3-120b (q08's primary writer), gemma-4-26b-a4b, qwen3-30b-a3b and llama-3.3-70b (q08 panel judges and the ask writers). It probes `deepseek-v4-pro-0813` twice. | `ai_model_health`, `ai-health-prober/worker.js` MODELS | issue filed; net-neutral change (dedupe pays for the added probes) |
| 7 | Reader votes cannot calibrate q08: about 1 valid vote in 106 human reads. The owner's verdict (weight 3) and the panel are the only usable text-quality signals for weeks. | q08 `/api/metrics` | PR 559 (owner verdict), PR 562 (panel) |
| 8 | `calibration_register` is not a loop input (no worker reads it; its rows are research predictions due 2027-2028). Predictions for this work are recorded as metric triggers and issue probes instead. | repository grep, D1 | note |

### Predictions with disconfirmation (checked by the metric loop, not by a session)

| Prediction | Check | Disconfirmed if |
|---|---|---|
| Two judges from different families are worth at least 1.3 independent votes. | `q08_panel_effective_votes_30d` (trigger 797) once 20 paired reads exist | below 1.3: replace the most correlated family |
| The ladder does not raise cost per published piece. | `q08_neurons_per_published_piece_7d` stays at or below 643 (2026-10-03) over the 7 days after PR 562 deploys | above 643: revert PR 562 |
| The editor round raises scores. | `GET https://q08.org/api/ensemble` `by_round`: round 2 mean above round 1 | not above: remove the editor, keep the panel |
| The ask judge starts judging. | `ask_loop_runs kind='judge'` on 2026-10-04 03:41Z shows `judged` > 0 or a named `failed` cause | still bare `judged:0`: PR 566 did not deploy |
| Recurring judge phrases show which gate rules are missing. | `/api/ensemble` `top_tells` | empty after 30 reads: judges give no usable tells |

### Loop wiring (no new worker, cron or secret)

- Measure: q08 `writeOwnMetrics` -> `metric_registry` (existing 2-hourly path). Judge: `v_metric_trigger_state`. Act: trigger 797 -> one
  `agent_issues` row with a `code-task` on `PANEL_POOL`. Learn: `remedy_efficacy_30d`.
- Read-out for any session or loop: `GET https://q08.org/api/ensemble` (aggregate, no visitor data).
- The weekly list of recurring judge phrases is a candidate list for new gate rules. It is never turned into a rule
  automatically: a phrase from a model's output must not become code without a reviewer (injection and drift).
