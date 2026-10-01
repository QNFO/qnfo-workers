# FLEET REPORT CARD — Objective Function & Constraints (canonical)

Record-of-truth for objectives 1/2/329/330 in qnfo-audit D1 (`objectives` table).

> Aligned to docs/STRATEGY.md (STRATEGY-1, 2026-10-01). Where they differ, STRATEGY.md wins.

## Mission (objective_key=mission, ratified 2026-09-14)
Every recurring function runs in the cloud. The fleet operates, heals, audits, improves, publishes, and promotes itself. The human role narrows to policy-setting and exception handling.

## Objective function (objective_key=objective-function, ratified 2026-09-14)
Maximize SAI = 0.30*autonomy + 0.15*thinking + 0.15*decision + 0.15*self_improv + 0.10*reliability + 0.10*integration + 0.05*governance,
subject to the autonomy-ladder cap, cost ceilings (A9), and the residual-consent boundary.

## Cost ceiling A9 (objective_key=cost-ceiling, v2 corrected 2026-09-26)
Enforce a HARD monthly AI-spend ceiling that actually blocks spend. Unified AI Gateway burn ~$188/mo (corrected from a 100x cents-to-dollars misread). KPI: monthly cost_usd.

> Note 2026-10-01 (STRATEGY-1 section 8): the live ceiling is the $150/30d gateway cap; the target is at most $60/30d by 2026-10-31.

## Return-on-spend (objective_key=return-on-spend, v2 corrected 2026-09-26)
Tie monthly AI spend to measurable return. Return gates: full_reports_live_30d >= 2 AND impressions_growth >= 30% (baseline 5610). KPI per $1000 spent: subscriber_count, pageviews_30d, published_papers_30d, impressions_growth.

> **Superseded 2026-10-01 (STRATEGY-1).** The `impressions_growth >= 30%` gate is retired: it measured traffic volume, the
> wrong objective, and its implementation reported a false pass. Return is measured by the docs/STRATEGY.md section 6.3
> scorecard (search impressions, engaged human sessions, social reach and engagement rate, confirmed subscribers, warm
> conversations, credibility events, cost per engaged human), and the research layer is judged at the section 9 review gate
> on 2026-12-31: it continues if (credibility events at least 2 OR confirmed subscribers at least 50 OR funding secured) AND
> AI spend is inside the cap. The paragraph above is the D1 row as reproduced on 2026-09-26. Updated 2026-10-01: the
> qnfo-audit `objectives` row `return-on-spend` (id 330) is now version 3 with this definition, ratified by the agent under
> the owner's 2026-10-01 delegation. `cost-ceiling` (id 329) is unchanged; the $60/30d gateway target lives in STRATEGY.md
> section 8.

## Open objective-revision proposals (pending human ratification)
See goals table (goal_type='objective-revision', status='proposed', owner='human-ratify') in qnfo-audit D1. Terminal objectives are immutable by the agent; revisions route to human ratification.

---
Reconstruction note: the original docs/FLEET-REPORT-CARD.md was lost in the 2026-09-26 fleet consolidation. This file restores the citation referenced by objectives.id=2 (source field). Content reproduced verbatim from the live D1 rows.
