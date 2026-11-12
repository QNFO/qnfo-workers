# Q08 forecast engine (FORECAST-ENGINE-1) and the spin-off plan

Code: `forecast-engine.mjs` (source), inlined into `worker.js` by `inline-forecast-engine.mjs`. Tests: `forecast-engine.test.mjs`.
Demo on real data: `node q08-prediction-markets/forecast-demo/run.mjs` (plan and prompts), then `--answers forecast-demo/answers-2026-11-12.json`.
Live once deployed: `markets.q08.org/forecasts`, `/api/forecasts`, `/api/forecast-ticks`.

## Why the old pieces did not work together (read from D1 on 2026-11-12)

| Piece | What it did | Measured |
|---|---|---|
| q08-signal-engine | scrape HN, GitHub, arXiv, Federal Register; write an essay; four model review layers; forecast every third piece from an essay | 14 days: 539 runs, 9 pieces published, ~23.1M Workers AI tokens (`ai_call_counters`), so ~2.6M tokens per published piece. 131 of 158 pieces ever published carry a retraction. 4 forecasts in total, 0 resolved. 2 subscribers. |
| q08-prediction-markets | estimate Polymarket questions with the price hidden from the models; paper-trade the gap | 30 resolved estimates: models Brier 0.218, market price 0.039 (the crowd was 5.6x more accurate). Universe dominated by Bitcoin brackets, sports spreads and stunts. |

The essay was the product and the forecast a by-product, so every forecast paid for an essay and its retraction risk. The markets pilot asked models to beat the crowd blind, on questions no news decides.

## The pipeline: forecast first, prose last

1. **Select** questions with a financial channel (rates, leadership of listed firms, capital raises, energy and geopolitics, officials and rules). 0 tokens.
2. **Prior** from the crowd, repaired across dated legs of one question with isotonic regression weighted by freshness and volume. 0 tokens.
3. **Match** signals to questions by proper-entity overlap. 0 tokens.
4. **Trigger** only on new matched evidence or a 5-point crowd move. Most hours cost nothing.
5. **Adjust**: two model families (deepseek-v4-flash, kimi-k2.6, thinking off) each propose a bounded log-odds shift citing evidence ids.
6. **Gate**: uncited or out-of-range shifts are dropped; both models must move in the same direction or the crowd stands; the mean is halved and capped at 1 logit.
7. **Ledger**: hash-chained `fe_forecast` rows in q08-trades; settled from closed markets; the headline is value added over the crowd (Brier of the prior minus Brier of the engine).
8. **Card**: the page renders each row. No essay.

## Demo result (2026-11-12, real snapshot, real Workers AI calls)

22 candidate markets, 6 dropped as trivial, 16 consequential, 3 with fresh signals were forecast:

| Question | Quoted | Crowd (repaired) | Engine | Tokens |
|---|---|---|---|---|
| Jensen Huang announced resignation or removal by Dec 31 | 15.5% (3 days stale) | 54.2% | **64.4%** (both models cite the board investigation and the WSJ ouster report) | 752 |
| Anthropic IPO by Nov 20 | 93.5% | 93.5% | 93.5% (both models: headlines already priced) | 872 |
| No change in Fed rates after the December meeting | 22.5% | 22.5% | 22.5% (only one model moved, so the crowd stands) | 619 |

About 750 tokens per forecast against about 2.6 million per published q08 piece. The largest signal in the run cost 0 tokens: the stale December Huang quote sat 39 points below the fresher November legs of the same question.

Measured while building: glm-5.3-flash has no thinking switch and spent its whole 1,200-token budget reasoning on 3 of 3 questions with no answer, so it is not in the pair.

## Honest limits

- No forecast has settled yet, so value added is unmeasured. It is the only number that can justify the engine; it is on the page from the first settlement.
- The signal stream is tech-centric (948 of 1,205 signals are Hacker News). Iran, Hegseth and most macro questions had no matching signal and were skipped, at no cost. Coverage, not model quality, is the next constraint.
- Headlines often arrive after markets move. The realistic edge is coherence (stale or inconsistent legs) and speed on niche questions, not out-guessing liquid markets.

## Spin-off plan

**What it is.** Q08 Forecasts: a public desk that turns public signals into scored probabilities on questions that move money, each one starting from the crowd and moving only with cited evidence. The pitch to readers and later to buyers is one number: value added over the market, settled in public.

**Phase 1, prove it (now to ~60 settled forecasts, about 6-8 weeks at current cadence).**
- Run the engine hourly in this worker (paper only). Point q08.org's forecast traffic at `/forecasts`.
- Widen coverage: a GDELT lane and the existing Federal Register lane into `signal_log`; official series (FRED, BLS, EIA) as deterministic priors and resolutions for macro questions.
- Stop paying for what does not compound: cap the q08 essay engine (`ops_config q08_max_per_day`) and switch off the price-hidden estimator once the engine has two weeks of rows.
- Paper P&L on deviations only: size paper positions on the engine's evidence-backed moves away from the crowd, so the money scoreboard measures the engine and not the crowd.

**Phase 2, earn attention (value added > 0 with a bootstrap interval clear of zero).**
- Alerts when the engine moves 10 or more points from the crowd: RSS, email digest and its own social account (not the owner's personal channels).
- A weekly scorecard post: what moved, what settled, value added to date.
- Own surface: `forecasts.q08.org` or the q08.org root, its own D1 and its own `fleet_budget` line.

**Phase 3, spin out (200+ settled, positive value added held for a quarter).**
- A data feed and API for newsletters and funds (probability, prior, evidence, ledger hash).
- Its own repository and Cloudflare account once it has an external user; until then it stays in the fleet, which is already over its worker cap.
- Real-money trading on a regulated venue stays an owner decision (money, accounts, jurisdiction), asked only after Phase 3 evidence and never automated by this code.
