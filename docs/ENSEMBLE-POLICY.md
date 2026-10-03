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
