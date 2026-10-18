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
4. **Carry the winner** — a promotion writes the ladder row (`active=0`), a
   `roadmap_implementation` item and a deduped `agent_issue` naming the switch.
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

`x-eval-key` is `cf_model_eval_config.manual_key`.

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
| `manual_key` | `x-eval-key` for `POST /run`, `POST /canary` |

## Test

```
node qnfo-model-eval/eval-logic.test.mjs
```
