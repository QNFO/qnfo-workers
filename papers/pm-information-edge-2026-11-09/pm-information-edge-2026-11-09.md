# Where Do LLM Forecasters Have an Edge Over Prediction Markets?

**Evidence, a pre-registered test, and the Q08 proving ground** · QNFO · 9 November 2026 · version 1.0 · charter PM-CHARTER-1

## Summary

1. **There is no demonstrated general edge.** In the sources reviewed for this paper, language-model forecasters at best match the aggregate of a human forecasting crowd, and they trail the best human forecasters. None of the studies compares them with liquid market prices after trading costs, and I found no peer-reviewed evidence of a profit from doing so.
2. **An edge is plausible only in specific places.** The evidence points to six hypotheses (section 3): combining a model with the crowd, structural mispricing between related contracts, systematic crowd biases such as the favourite-longshot bias, breadth across many low-attention markets, speed on thin or newly listed markets, and domains where the model's sources lead the crowd.
3. **Most published comparisons cannot tell us whether an edge is real.** Leakage of future information, human forecasts in training data, metric choices and small samples all inflate or obscure results (section 4).
4. **So the Q08 program is built to prove or refute an edge on paper, not to assume one.** Fourteen recommendations follow from the evidence (section 6). Eleven are implemented in the open-source worker `q08-prediction-markets` (version 1.7), and three are filed as tracked issues or recorded on the live-trading decision item. Real money stays out of reach of the code until a pre-registered gate passes (section 7).

*What this paper does not claim:* that Q08 has an edge. It claims that the question is testable, describes the test, and publishes the result as it accrues at `/api/charter` and `/api/track-record`.

## 1. Why the question matters

A prediction market price is itself an aggregate forecast. A model that only restates the price adds nothing, and a model that is worse than the price loses money to the people who trade against it. A forecaster profits only where its probability is better than the price by more than the cost of trading. That makes the right yardstick the market price, not a coin flip and not a forecasting-tournament crowd.

## 2. What the literature shows

| Study | Comparison | Reported result | What it does not show |
|---|---|---|---|
| Halawi et al. 2024, *Approaching Human-Level Forecasting with Language Models* [1] | Retrieval-augmented model system against the community forecast, on questions opened after the models' knowledge cutoffs | Brier score 0.179 for the system against 0.149 for the crowd. Where the crowd was uncertain (between 0.3 and 0.7) the system scored 0.238 against 0.240. Blending the system with the crowd improved on the crowd alone | The baseline is a forecasting platform's crowd, not market prices. The system did not beat the crowd overall |
| Schoenegger et al. 2024, *Wisdom of the Silicon Crowd*, Science Advances [2] | An ensemble of 12 language models against 925 human forecasters on 31 binary questions | The model ensemble was not statistically different from the human crowd. In a second study, showing models the median human forecast improved their accuracy by roughly 17 to 28 percent, and averaging human and machine forecasts was more accurate. Models showed an acquiescence bias, with mean predictions significantly above 50 percent | Thirty-one questions is a small sample, and the comparison is again with a tournament crowd |
| Karger et al. 2025, *ForecastBench*, ICLR [3] | A dynamic benchmark of about 1,000 questions whose answers are not yet known | In the launch evaluation on a 200-question subset: superforecasters 0.093, the general public 0.107, the best model (Claude 3.5 Sonnet) 0.111 | A 2024 snapshot; current standings change as questions resolve |
| Metaculus AI benchmark, quarterly reports 2024 and 2025 [4] | Bots against teams of professional forecasters | Pros beat the best bots in every quarterly benchmark found. In the first 2024 round, pros beat all 34 bots. In Q2 2025 (348 questions; 96 forecast by pros) the lead was significant (p = 0.00001). A Gemini-based bot placed 37th of 551 in a 2025 open cup | These are Metaculus's own analyses and a secondary 2026 synthesis; the gap has narrowed but not closed |
| Saguillo et al. 2025, *Unravelling the Probabilistic Forest* [5] | Price consistency inside and across Polymarket contracts, April 2024 to April 2025 | Across 8,659 single-condition and 1,578 multiple-condition markets the authors estimate about 40 million US dollars of realised arbitrage profit | Abstract-level reading only; it is structural arbitrage, not forecasting skill |
| Snowberg and Wolfers 2010, *Explaining the Favorite-Longshot Bias*, JPE [6] | Betting-market prices against outcomes | Misperception of probabilities explains the favourite-longshot bias better than risk-love | Racetrack data, not prediction markets |
| Bürgi, Deng and Whelan 2025, *Makers and Takers*, on Kalshi [7] | Kalshi contract prices against outcomes | Prices are informative and improve near expiry, with a favourite-longshot bias: contracts priced below 10 cents lose over 60 percent of the money staked; takers lose more than makers | Reported through a CEPR summary and several working-paper versions; the exact figures should be checked against the primary PDF |
| Baron et al. 2014, *Two Reasons to Make Aggregated Probability Forecasts More Extreme* [8] | Aggregated crowd probabilities against outcomes | Averaging pulls probabilities toward 0.5; transforming them toward 0 or 1 makes them correspond better to outcomes. The effect is smaller for the median or the mean of log-odds | Human tournaments, not model ensembles |
| Paleka et al. 2025, *Pitfalls in Evaluating Language Model Forecasters* [9] | Evaluation methods | Leakage of post-forecast information, unreliable date-restricted retrieval, human forecasts inside training data, and metrics that over-weight high-base-rate questions | A methodological critique, not a result about markets |

**Reading across the table.** The strongest, best-replicated result is that aggregation helps: ensembles of models approach a human crowd, and a blend of models and humans beats either. The weakest link is the absence of any test against market prices with realistic costs.

## 3. Where an edge is plausible: six hypotheses

Each hypothesis states a mechanism and what would refute it. None is established.

**H1. Combining model and crowd.** The best-supported claim: a blend of an independent model forecast and the market price beats the price alone [1][2]. *Refuted if* the blend's Brier score is not lower than the price's with a 95 percent interval clear of zero on a pre-registered sample.

**H2. Structural mispricing.** Related contracts that must sum to one often do not, and one study estimates about 40 million US dollars of realised arbitrage on Polymarket in a year [5]. This needs no forecasting skill, only consistent bookkeeping across contracts. *Refuted if* the gaps do not survive spreads and fees at the sizes we can trade. It is the only hypothesis in this list that does not depend on a model being better than the crowd.

**H3. Systematic crowd bias.** Low-priced contracts win less often than their prices imply [6][7] (the Kalshi figure is from a secondary summary). A model calibrated on outcomes can learn this correction. *Refuted if* the learned correction is indistinguishable from the identity on our own resolved sample.

**H4. Breadth.** A crowd attends to the headline markets. A program that reads evidence for every short-dated market in a category can cover the long tail. *Refuted if* edge appears only in markets with large volume, where the crowd is already attentive.

**H5. Speed on thin markets.** In newly listed or thinly traded markets, prices may lag fresh reporting. *Refuted if* the gap between our estimate and the price closes only after the evidence is already old.

**H6. Domains where our sources lead.** Q08's own signal sources are Hacker News, GDELT and Wikipedia (its search and its daily current-events portal), the same ones its research ledger reads. For technology, AI and software-release questions, reporting there may lead the crowd; for geopolitics and elections it plausibly does not. *Refuted if* the per-domain evaluation shows no positive interval in any domain after 30 resolved estimates per domain.

**Where we expect no edge.** Liquid headline markets, where public information is priced within minutes; sports, where the crowd and bookmakers already specialise (excluded from the Q08 universe); markets resolved by a price bracket or a count on a given day (price ranges, tweet counts), where news carries little beyond the live number and a structured price model is the right tool (excluded from the Q08 universe); and markets resolved by a subjective judgment of wording rather than by a checkable fact.

## 4. How forecasting evaluations go wrong

The pitfalls below shape the design, because each one can create an apparent edge from nothing [9][10].

1. **Leakage.** A model trained after the event, or a search engine that returns pages updated after the question date, can see the answer. Date-restricted retrieval has been found unreliable, and asking a model to feign ignorance of events before its cutoff does not stand in for a real cutoff [9][10]. *Control:* forward-only evaluation on questions whose answers do not yet exist, evidence limited to the previous three days, and the evidence stored with each forecast.
2. **Human forecasts in training data.** A model that has seen the crowd's number is not independent [9]. *Control:* the market price is never shown to the model.
3. **Metric choice.** Brier scores over-weight questions with a high base rate, and calibration alone can reward useless forecasts [9]. *Control:* report Brier score, log loss and the gain over the market price, on the same markets, with intervals.
4. **Forecast timing.** Scoring a forecast made hours before resolution rewards the easy cases. *Control:* the first forecast on each market is the one scored, with its lead time recorded.
5. **Tuning on the test set.** Adjusting thresholds while watching the score inflates the final result. *Control:* parameter changes start a new evaluation sample, and graduation counts only forecasts made under the current, frozen parameters.
6. **Selective memory.** Overwritten forecasts hide misses. *Control:* an append-only log in which each row carries a hash of the row before it.

## 5. Costs and market structure

A forecast is not a profit. Takers pay the spread and sometimes a fee, and the Kalshi study reports that takers lose more than makers [7] (a figure reported through a secondary summary). Our shadow return therefore charges slippage on every simulated bet, markets with wide spreads are skipped, and position sizes are a fraction of a Kelly stake so that estimation error cannot dominate. Live trading, if it ever happens, should use resting limit orders where the terms allow, which is a design for a later phase.

## 6. Recommendations and what was done

| # | Recommendation | Basis | Status in `q08-prediction-markets` 1.7 |
|---|---|---|---|
| R1 | Hide the market price from the model | [2], [9] | Implemented; tested |
| R2 | Use several model families and aggregate with the median | [2], [8] | Implemented: three families from the fleet's approved model table; agreement and spread rules |
| R3 | Retrieve fresh evidence from several independent sources and keep a snapshot | [1], [9] | Implemented: Hacker News, GDELT, Wikipedia search and the Wikipedia current-events portal; per-source counts and an evidence digest in every log row |
| R4 | Learn a recalibration (stretch or shrink) from resolved outcomes | [6], [7], [8] | Implemented: logistic recalibration fitted on raw ensemble probabilities, bounded, applied only after 50 resolved estimates |
| R5 | Blend the model with the market price and size by fractional Kelly | [1], [2] | Implemented: blend weight chosen by Brier score on resolved estimates; quarter-Kelly sizing capped at the position limit |
| R6 | Score the first forecast on each market, with lead time | section 4 | Implemented |
| R7 | Append-only, tamper-evident forecast log, public | section 4 | Implemented: hash chain, `GET /api/track-record` with verification |
| R8 | Freeze parameters during evaluation | section 4 | Implemented: parameter version; graduation counts the current version only; tuning at most weekly |
| R9 | Evaluate by domain and switch off domains that lose | H6 | Implemented: domain classifier, per-domain interval, automatic domain pause |
| R10 | Report log loss as well as Brier score | section 4 | Implemented |
| R11 | Skip wide-spread markets | section 5 | Implemented |
| R12 | Test structural arbitrage separately from forecasting skill | H2, [5] | Filed as issue 9106: it needs each event's full outcome list |
| R13 | Run consistency and fake-date probes on the model | [9][10] | Filed as issue 9107 |
| R14 | Maker-style execution for any live phase | section 5 | Recorded on the live-trading decision item (issue 8960); not built |

## 7. Pre-registered test and stopping rules

Fixed before any result exists, and served live at `/api/charter`:

- **Sample:** at least 30 days of paper trading, 100 resolved forecasts and 30 qualifying trades under one frozen parameter version.
- **Primary criteria, each with a 95 percent bootstrap interval clear of zero:** the model (or the model and price blend) has a lower Brier score than the market price; the shadow return after slippage is positive; and the signal's bets beat backing whichever side the market already favours.
- **Safety:** drawdown under 20 percent.
- **Automatic pauses:** new entries pause for 24 hours at a 15 percent drawdown or when the model is significantly worse than the price after 30 resolved forecasts. A domain that is significantly worse than the price after 20 resolved forecasts is switched off.
- **What happens on success:** the gate only reports. It cannot switch anything on. A live account needs a wallet-signed key, an API key, funding and a jurisdiction and terms review, all of which belong to the owner, and none of which the worker holds.
- **What would change our mind:** a negative interval on the primary criteria after 100 resolved forecasts retires the signal strategy. The program would then keep only the structural-arbitrage work, if that survives costs.

## 8. Limitations

- The literature review was a targeted search, not a systematic review. Several figures come through secondary summaries and are marked as such.
- The sample will take weeks. Early paper profit says little, and the dashboard will say "not yet" for a long time.
- Wikipedia as an evidence source and the router's acceptance of every model identifier could not be verified before deployment; per-source counts and the list of models that answered are stored with every forecast so a failure is visible.
- The three model families share much of the same internet text, so their errors are correlated; three models are worth fewer than three independent forecasters.
- Resolution risk (disputed or ambiguous resolution) is not modelled.

## References

1. Halawi, D., Zhang, F., Yueh-Han, C., Steinhardt, J. (2024). *Approaching Human-Level Forecasting with Language Models.* [arXiv:2402.18563](https://arxiv.org/html/2402.18563v1)
2. Schoenegger, P., Tuminauskaite, I., Park, P. S., Tetlock, P. E. (2024). *Wisdom of the Silicon Crowd: LLM Ensemble Prediction Capabilities Rival Human Crowd Accuracy.* Science Advances. [arXiv:2402.19379](https://arxiv.org/html/2402.19379v6)
3. Karger, E., Bastani, H., et al. (2025). *ForecastBench: A Dynamic Benchmark of AI Forecasting Capabilities.* ICLR. [arXiv:2409.19839](https://arxiv.org/pdf/2409.19839)
4. Metaculus (2024 to 2025). AI Forecasting Benchmark quarterly results. [Q1 2025](https://forum.nunosempere.com/posts/mwcWxwdsEMexm98GF/q1-ai-benchmarking-results-human-pros-crush-bots), [Q2 2025](https://www.lesswrong.com/posts/Surnjh8A4WjgtQTkZ/q2-ai-benchmark-results-pros-maintain-clear-lead), [Q3 2024](https://forum.nunosempere.com/posts/E3hiRG68wc6zLWr6m/can-ai-outpredict-humans-results-from-metaculus-s-q3-ai)
5. Saguillo, O., Ghafouri, V., Kiffer, L., Suarez-Tangil, G. (2025). *Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets.* [arXiv:2508.03474](https://arxiv.org/abs/2508.03474)
6. Snowberg, E., Wolfers, J. (2010). *Explaining the Favorite-Long Shot Bias: Is it Risk-Love or Misperceptions?* Journal of Political Economy 118(4). [NBER w15923](https://www.nber.org/papers/w15923)
7. Bürgi, C., Deng, W., Whelan, K. (2025). *Makers and Takers: The Economics of the Kalshi Prediction Market.* [CEPR summary](https://cepr.org/voxeu/columns/economics-kalshi-prediction-market), [working paper](https://www.karlwhelan.com/Papers/Kalshi.pdf)
8. Baron, J., Mellers, B. A., Tetlock, P. E., Stone, E., Ungar, L. H. (2014). *Two Reasons to Make Aggregated Probability Forecasts More Extreme.* Decision Analysis 11(2). [link](https://econpapers.repec.org/RePEc:inm:ordeca:v:11:y:2014:i:2:p:133-145)
9. Paleka, D., Goel, S., Geiping, J., Tramèr, F. (2025). *Pitfalls in Evaluating Language Model Forecasters.* [arXiv:2506.00723](https://arxiv.org/html/2506.00723v1)
10. *Simulated Ignorance Fails: A Systematic Study of LLM Behaviors on Forecasting Problems Before Model Knowledge Cutoff* (2026). [arXiv:2601.13717](https://arxiv.org/html/2601.13717v1)
11. Polymarket documentation, *Geoblock*. [docs.polymarket.com](https://docs.polymarket.com/developers/CLOB/geoblock)

*Live evidence:* [markets.q08.org/api/charter](https://markets.q08.org/api/charter) · [markets.q08.org/api/track-record](https://markets.q08.org/api/track-record) · charter PM-CHARTER-1 · decisions and open items: issues 8960, 8961, 8840, 9106 and 9107 in the QNFO/qnfo-workers repository.
