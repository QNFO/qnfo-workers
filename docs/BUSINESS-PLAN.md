# QNFO / QUNIVERSE — BUSINESS PLAN v1 (2026-09-26)

Status: owner-directed response to "what is the business plan and how will this system achieve ROI/profitability".
All numbers verified same-day against live billing + D1 + GitHub (see evidence table).

## 1. Current P&L (verified 2026-09-26)

| line | value | evidence |
|---|---|---|
| Monthly burn (AI Gateway Sept draft invoice) | $188.46 | /ai-gateway/billing/invoice-preview (USD cents ÷100) |
| — of which openai/gpt-5.5 agent-session traffic | $192.87 gross / $174.79 net of credits | invoice line items |
| — Workers AI prepaid | $13.54 | invoice line |
| Workers AI 30d estimate (all models) | ≈$15 | infra_analytics neurons |
| Credit balance | $11.55 | credit-balance (cents) |
| Auto top-up | +$10.00 whenever balance < $10.00 | topup config |
| Spend limit | $150 / 30d sliding (enabled) | gateway spend_limits |
| Revenue | $0.00 (no payment rail exists) | — |
| Subscribers | 1 | D1 subscribers |
| Outreach (cumulative) | 314 sent, 10 replies, 3.18% reply rate | D1 emails/outreach |
| Output (30d) | 16 full reports; 451 all-time; 219 Zenodo DOIs | D1 living-paper |
| Audience | 5,660 pageviews/30d (+0.89% vs baseline; gate +30%) | CF GraphQL RUM |

Headline: **the entire burn is agent-session LLM spend; the system produces research output with zero monetization; its own survival gate (impressions +30% MoM) is failing.**

## 2. The binding constraint (read this first)

The fleet already encodes a self-destruct: `shutdown_manifest` has 4 ARMED rows.
- phase-1 (2026-10-25): retire all research/self-monitor workers unless `full_reports_live_30d >= 2` AND `impressions_growth >= +30%`.
- phase-2 (2026-11-01): archive + drop research data.
- EARLY-TRIGGER: gateway spend ≥ $150/30d with zero publish events.
- OWNER-KILL: email command.

Measured today: reports 16/30d (passing); impressions growth +0.89% vs +30% (FAILING).
→ Unless the growth gate passes or the owner revises the gates, phase-1 fires in 29 days. The owner's "kill it as a cost sink" instinct is already the system's default behavior.

## 3. Business plan — the sequence that reaches ROI

### Phase A (week 1): make the cost non-lethal
1. Route ops-exec/ops-frontier agent traffic off gpt-5.5 onto gpt-4.1/deepseek-class models
   (gateway logs: deepseek-flash ≈ $0.0044/req; gpt-5.5 line is 92% of the invoice).
2. Target: monthly AI Gateway burn ≤ $40. Break-even subscriber count at $10/mo drops from 19 to 4.
3. Keep the $150/30d cap as a hard ceiling; add a per-model budget alert.

### Phase B (weeks 2–4): pick one monetization line and close the funnel
Existing sellable assets: 904-paper living corpus (451 full reports, 219 Zenodo DOIs),
q08.org signal engine, ipatent.me patent analytics, qnfo-ai research gateway, outreach engine (3.18% reply rate).
Choose ONE flagship line. Recommended order:
1. **Premium research digest / newsletter** — $10/mo. Funnel: 5,660 pageviews/30d → landing page
   with subscribe CTA (today: 1 subscriber = broken conversion). Own-domain only (no social).
2. **ipatent.me patent analytics** — B2B, highest price point, needs product positioning + 5 pilot users.
3. **Bespoke research reports** — sell per-report work through the outreach contacts that already reply (10 warm replies).

### Phase C (month 2–3): prove the numbers
- Gate: revenue ≥ burn by 2026-12-31, then grow 20%/mo.
- Dashboard now shows money math (burn, revenue, cost-per-report, break-even) on the root view — the same numbers this plan is graded on.

### Standing rules
- Personal utility layer (personal-api, qnfo-email, calendar, companion) is owner infrastructure, ~$0 marginal cost — it survives any research-layer decision and is NOT part of the research P&L.
- No traditional-journal submissions; Zenodo is canonical. No social media; own pages only.
- If Phase A+B do not produce measurable revenue by 2026-10-25, accept phase-1 retirement (keep personal layer) rather than extend the burn.

## 4. Honest risk statement
Failure modes: (a) the corpus may have no paying audience — 5,660 pageviews is small and its composition (bots vs humans) is unverified; (b) ipatent B2B has a long sales cycle, not compatible with a 29-day gate; (c) cost cuts may degrade agent output quality, reducing publish throughput below the report gate. The plan's first bet (cost floor) is near-certain; the revenue bets are uncertain and time-boxed by the existing gates.

## 5. Evidence pointers
- Billing: AI Gateway invoice-preview/credit-balance/topup-config (cents), audited 2026-09-26 10:00Z.
- Inventory: qnfo-audit D1 (shutdown_manifest, task_dod_register, gtd_register, agent_issues, fleet_issue_dispatch, email_loop_quarantine, worker_live_audit), GitHub org search (25 open issues).
- Dashboard: fleet.qnfo.org root (FAILURE INVENTORY, qnfo-fleet-dashboard v1.7.13), /roi, /ops.
