# qnfo-model-eval

CF-MODEL-EVAL-1 — the loop that answers one question without the owner asking it:
*Cloudflare shipped a model; should the fleet run it?*

Owner directive (2026-10-18): *"THE SYSTEM SHALL CONSISTENTLY, REGULARLY, AND
AUTOMATICALLY EVALUATE NEW CLOUDFLARE MODELS FOR IMPLEMENTATION IN FLEET
PRODUCTION USE."*

## What it does every 6 hours

1. **Discover** — parses `developers.cloudflare.com/workers-ai/models/index.md`,
   resolves each model's id, context window, price and vision flag from its docs
   page, and upserts `cf_model_catalog`. Models absent from the live index are
   marked `vanished`.
2. **Benchmark** — runs the `cf_model_eval_battery` probes (battery version
   `cfmb-2`) against each candidate, with the production incumbents
   (`@cf/openai/gpt-oss-120b`, `@cf/zai-org/glm-5.3-flash`) re-measured daily as
   the control. Results land in `cf_model_evals` (score, latency, cost, per-probe
   detail).
3. **Decide** — `decideVerdict()` is pure and unit-tested; see `eval-logic.test.mjs`.
4. **Carry the winner** — a promotion writes the ladder row (`active=0`) and a
   `roadmap_implementation` item at once; the deduped `agent_issue` naming the
   switch is filed at the end of the pass (PROMOTE-TICKET-AFTER-RECONCILE-1, 1.8.2),
   after step 5 and the one-winner reconcile, and only for a model whose promotion
   still stands (catalog `recommended` or `in_production`, or a ladder row). A
   promotion the same pass withdraws files no ticket.
5. **Canary** (decision models) — runs the winner over real open `agent_issues`
   rows that already carry `category`/`priority`, and records agreement with the
   fleet's own labels in `cf_model_canary`. A battery score is not an adoption.

## The two defects 1.0.0 had, and why they mattered

**Promotion was unreachable.** `decide()` required `score - controlScore >= +0.1`
while both controls score a saturated **1.0** on `cfmb-1` — the maximum. Nothing is
0.1 above the maximum, so `promote` never fired: `cf_model_catalog` had zero
`recommended` rows and `model_ladder_models` had no auto-eval rows at all. The
loop measured and stopped. Promotion now has two reachable triggers:

| Trigger | Condition |
|---|---|
| quality gain | control not saturated and `score >= controlScore` |
| cost win | `score >= controlScore` and `price_in <= 70%` of control |

On a saturated battery, quality cannot exceed the control, so **cost is the only
honest discriminator** and it is the one used. A model at parity with no cost
advantage is `keep`, never `promote`.

**Throughput was a hardcoded 3/day.** `cf_model_eval_config.max_models_per_run`
existed but the code ignored it, and the scheduled sweep was daily. Measured
2026-10-18: 20 chat candidates with `last_eval_ts IS NULL` — a ~7-day backlog. The
cap is now read from config (clamped 1–12), the sweep is 6-hourly, and `runLoop`
carries a wall-clock deadline so a slow model cannot kill the run.

**A third, quieter one:** models that reject the `system` role (`5006`) or have no
account config (`4003`) were scored 0 and **rejected as bad models**. Those are
harness gaps. They now record `verdict='harness_error'`, stay `candidate`, and
file the integration fix instead of a quality verdict.

## Routes

| Route | Purpose |
|---|---|
| `GET /health` `/manifest` | liveness; capabilities, crons, config, backlog |
| `GET /catalog` | the discovered model catalog with status and scores |
| `GET /evals` | evaluation history |
| `GET /runs` | sweep history with verdicts and errors |
| `GET /leaderboard` | best score per model on the current battery |
| `GET /promotions` | ladder rows and roadmap items this loop created |
| `POST /canary` | run the decision canary (`x-eval-key`) |
| `POST /run` | force a sweep (`x-eval-key`) |
| `GET /ab/runs` | the last 50 paired A/B runs (`model_ab_runs`) |
| `GET /ab/fixtures` | the A/B task sets, prompts and gold answers (not the baseline replies), the judge pool and the threshold |
| `POST /ab/run` | one paired run for `{worker, pre_model, post_model, task_set?, threshold?, limit?, live_pre?}` (`x-eval-key`) |

`x-eval-key` is `cf_model_eval_config.manual_key`.

## Paired A/B quality harness (AB-HARNESS-1, agent_issues 2828)

The battery above scores a *candidate* model. This answers a different question: after a worker's model changed,
are its answers worse? Nothing else measures that (a model that answers fluently and worse raises no error).

For one worker and one task set (`grounded-qa`, `summarize`, `reasoning-short`; all passage-grounded, 8 fixtures in
`AB_FIXTURES` in `worker.js`, so a run is repeatable offline and `ab-harness.test.mjs` replays it) a run puts the
pre-change answer and the post-change answer to the same prompt in front of two judges and writes the paired win
rate to `qnfo-audit.model_ab_runs`:

| step | what happens |
|---|---|
| pre-change answer | the fixture's recorded baseline reply; with `live_pre` the pre-change model is called instead |
| post-change answer | the post-change model through qnfo-ai with `pin_model: true`, `hedge: false`, `cache: false` (the `QNFO_AI` service binding, props caller `qnfo-model-eval`); a reply served by another model is never scored: the prompt goes to the Workers AI id through the AI binding instead (`detail.post_paths` says which path answered) |
| judges | two families outside the pair under test, at least one outside every family the worker uses; they see the two answers in opposite orders |
| score | win 1, tie 0.5, loss 0 per judge, averaged; an empty post-change answer is a loss with no judge call, except that one whose finish is `length` (the fixture's own token cap was spent, as a reasoning model does) is asked once more at `min(4096, max(2048, 4 x budget))` tokens first (AB-LENGTH-RETRY-1); a retry that cannot be made leaves the fixture unmeasured, not lost |
| verdict | `win_rate >= 0.40` passes (parity is 0.5, margin 0.10); fewer than 6 verdicts, or judges that disagree on most fixtures, is `inconclusive`; an unreachable router is `error` (retried, at most 3 a day); a regression files an `agent_issues` row |

`classification` lanes (`task_set: clef-classification`) pair `clefCanary` agreement over the same labelled
`agent_issues` rows instead of a judge.

Triggers, on the hourly grid tick: a changed model for a worker in `scripts/model-policy.json` on main (a worker
seen for the first time is only recorded), and a model a worker newly uses in `ai_call_counters` (at least 20 calls
yesterday or today, fewer than 3 in the 2 to 15 days before, against that worker's busiest earlier model). Bounded
by `ab_max_runs_per_tick` (2) and `ab_daily_cap` (12), deduped on worker, pre and post model for 7 days, and
stopped by `ab_enabled = 0`. Every row's `detail` starts with `harness_rev` (`AB_HARNESS_REV`, now 2, bumped when the
harness changes how a row is scored); a `regression` row only suppresses its candidate when it carries the current
revision, and a third trigger (`abStaleRevCandidates`) proposes every pair whose `regression` row of the last 7 days
does not, whether or not `ai_call_counters` still shows a model change, so a regression found by an older scoring is
measured again by the next hourly tick. A pass or an inconclusive row keeps the 7-day dedupe, except an inconclusive
run that lost fixtures to an unavailable retry, which is tried again (at most 3 such rows a day, like an error); no
row is edited.

Not shown: the fixtures are generic and short; they catch empty, unsupported, wrong or truncated answers and are
not a worker's own prompts. The seed baseline replies are authored reference answers, not machine recordings (use
`live_pre` for a real pre-change reply). With 8 fixtures one run is a screen; read `judge_agreement` and `detail`.

## Known limitation

`cfmb-2` has a small, deterministic battery. It separates **capability floors** and
**cost**, and it does **not** rank two models that both score 1.0 on top-end
reasoning. A saturated control therefore yields *cost win* or *parity*, never
*better*. Treat a promotion as "worth a canary", not "proven superior" — which is
exactly why the decision lane has a real-data canary before any routing switch.

## Config (`cf_model_eval_config`)

| key | meaning |
|---|---|
| `max_models_per_run` | candidates evaluated per sweep (1–12) |
| `canary_enabled` | `1` runs the decision canary at the end of each sweep |
| `clef_winner` | current best decision model (score, then price) |
| `manual_key` | `x-eval-key` for `POST /run`, `POST /canary`, `POST /ab/run` |
| `ab_enabled` | `0` stops the A/B tick (kill switch, control_registry `model-ab-switch`) |
| `ab_threshold`, `ab_max_runs_per_tick`, `ab_daily_cap`, `ab_min_calls`, `ab_default_task_set` | A/B pass line (0.4), runs per tick (2), runs per day (12), calls that make a model "used" (20), task set for an undeclared change |

## Test

```
node qnfo-model-eval/eval-logic.test.mjs
node qnfo-model-eval/ab-harness.test.mjs
```
