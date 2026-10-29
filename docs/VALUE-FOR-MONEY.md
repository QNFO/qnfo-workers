# Value for money (VALUE-FOR-MONEY-1)

Charter pillar: **cost**, serving **reach** and **research**. Migration: `migrations/2026-10-29-value-for-money.sql` (view `v_value_for_money`).
Builds on `docs/OUTPUT-QUALITY-LEDGER.md`; that ledger says whether outputs got better, this says what each unit of money bought.

## Owner question, 2026-10-29

"I see the money go out. What I don't see is what I'm getting ... Cost per what? When we talk about quality, what are we really talking about?"

## Finding (live reads, 2026-10-29)

| Fact | Value |
|---|---|
| 30-day cost | $365.70 (`cost_usd_30d`); other registered figures for the same month: $423.98 (portfolio, ceiling $200), $466.66 pace, $872.79 run rate. No single cost truth. |
| Published papers, 30 d | 267 -> $1.37 each by the old unit |
| Papers with an open high-severity erratum | 29.5% |
| q08 essays later retracted | 75.3% (30 d) |
| Engaged human sessions, 28 d | 18,330 (site-wide, not per paper) |
| Outreach human clicks, 7 d / referrals 30 d | 561 / 610 |
| New subscribers, month | 0 |
| Zenodo download stats | last fetched 2026-08-29: no per-paper external-interest signal is current |
| Cost-linked focus items | research neurons per published version above 20k (live 65k); q08 148k per piece |

The fleet's unit is "a paper that passed a gate", and a gate is not quality. The cost is real, the unit is not.

## What quality means here: the outcome ladder

Quality is the highest rung an output reaches, judged by something the generator cannot satisfy.

| Rung | Meaning | Judge |
|---|---|---|
| R0 published | passed a gate | the pipeline (proxy, not quality) |
| R1 correct | no open high-severity erratum, claims survive an independent model family | falsifying reviewer |
| R2 read | distinct human readers of that paper | people |
| R3 pulled | human clicks, referrals, replies, reader reports | people |
| R4 retained | subscribers, returning readers, citations, expert or owner verdict | people |
| R5 breakthrough | external citation, expert endorsement or a result others build on | outsiders |

Rule: money is reported per rung, never per R0. The headline is **dollars per R1+R2 paper**; R5 is counted by hand until it exists.

## What changes

1. `v_value_for_money`: dollars per unit at R0 to R4. Zero units at a rung prints NULL dollars, which means the spend bought nothing there.
2. One cost truth: reconcile the five cost figures to a single source before any cap decision (follow-up item below).
3. Spend steers by yield: programs and workers whose cost per R2+ output is worst lose model tier first (BUDGET-SOFT-ROUTE-1 steers, never stops).

## Follow-ups (filed as work, not prose)

- Per-paper reads: join site analytics to paper slug so R2 is per paper, not site-wide (the largest gap; "one or two papers get interest" is anecdote until then).
- Replace the stale Zenodo stats feed with a current external-interest source (R5).
- Cost reconciliation: one authoritative `cost_usd_30d` with the others derived or retired.
- Dashboard: put `v_value_for_money` first on fleet.qnfo.org, above breach counts.
- Owner verdict channel: a one-click keep / slop mark per paper, recorded as R4/R5 evidence.

## Falsifier

The ladder is wrong if cost per R2 paper falls while owner slop marks or errata rise. That is a `validity` finding for `output_quality_measures`, not a reason to add a measure that agrees.
