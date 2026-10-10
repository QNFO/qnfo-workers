# QNFO / QUNIVERSE — BUSINESS PLAN v1.1 (2026-09-26, aligned 2026-10-01)

> Aligned to docs/STRATEGY.md (STRATEGY-1, 2026-10-01). Where they differ, STRATEGY.md wins.

Status: owner-directed response to "what is the business plan and how will this system achieve ROI/profitability".
All numbers verified same-day against live billing + D1 + GitHub (see evidence table).

v1.1 (2026-10-01): section 2 (the 2026-10-25 shutdown), Phase A target, Phase B order, Phase C gate and the standing rules
are aligned to docs/STRATEGY.md sections 4, 7, 8, 9 and 11. The section 1 P&L is the 2026-09-26 record and is unchanged.

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
| Output (30d) | 16 full reports; 451 all-time | D1 living-paper |
| Audience | 5,660 pageviews/30d (+0.89% vs baseline; gate +30%) | CF GraphQL RUM |

Headline: **the entire burn is agent-session LLM spend; the system produces research output with zero monetization; its own survival gate (impressions +30% MoM) is failing.** (2026-10-01: that gate is retired; see section 2.)

Note 2026-10-01 (STRATEGY-1 sections 1 and 8): the table above covers the AI Gateway only. STRATEGY.md records total fleet
cost of about $725/month on 2026-09-26: Cloudflare plan about $200, direct DeepSeek/Anthropic keys about $400-500 with no
limit or visibility (BYOK providers bypass the gateway cap), AI Gateway about $110-170. "The entire burn" therefore means
the entire gateway burn.

## 2. The binding constraint (read this first)

**Review gate 2026-12-31 (changed 2026-10-01, STRATEGY-1 section 9).** On 2026-12-31 the research layer continues if
(credibility events at least 2 OR confirmed subscribers at least 50 OR funding secured) AND AI spend is inside the cap.
Otherwise the fleet shrinks to the selected-works core and the personal layer. **No research data is ever lost
automatically**: a store leaves the fleet only after a verified, restorable copy exists (OWNER-STANDING-GRANT-1,
2026-10-05); deleting data that has no such copy needs the owner's explicit email confirmation. The +30% pageview test is retired: it measured
traffic volume, which is the wrong objective, and its implementation reported a false pass.

The `shutdown_manifest` rows were updated on 2026-10-01 (verified in D1): row 1 (phase 1) is now this review gate, due
2026-12-31, action "shrink, no deletion"; row 2 (phase 2, data drop) is `OWNER-CONFIRM-REQUIRED`. Rows 3-4 are unchanged.
No code executes the manifest; only qnfo-fleet-dashboard reads it.

Record as of 2026-09-26 (superseded): the fleet encoded a self-destruct, `shutdown_manifest` with 4 ARMED rows.
- phase-1 (2026-10-25): retire all research/self-monitor workers unless `full_reports_live_30d >= 2` AND `impressions_growth >= +30%`.
- phase-2 (2026-11-01): archive + drop research data.
- EARLY-TRIGGER: gateway spend ≥ $150/30d with zero publish events.
- OWNER-KILL: email command.

Measured 2026-09-26: reports 16/30d (passing); impressions growth +0.89% vs +30% (FAILING).
The 2026-10-25 phase-1 date and the growth gate no longer apply (changed 2026-10-01, STRATEGY-1).

## 3. Business plan — the sequence that reaches ROI

### Phase A (week 1): make the cost non-lethal
1. Route ops-exec/ops-frontier agent traffic off gpt-5.5 onto gpt-4.1/deepseek-class models
   (gateway logs: deepseek-flash ≈ $0.0044/req; gpt-5.5 line is 92% of the invoice).
2. Target: gateway AI spend at most $60/30d by 2026-10-31 (changed 2026-10-01, STRATEGY-1 section 8). v1 set ≤ $40 and
   computed a break-even on $10/mo subscribers; that arithmetic no longer applies because the premium digest is deferred
   (Phase B).
3. Keep the $150/30d cap as a hard ceiling; add a per-model budget alert.
4. Direct-provider keys (about $400-500/month, unmetered): per-provider throttles and one unified monthly cost figure
   (RM-COST-UNIFIED-SPEND-1, #1683). The owner's standing directive for them is throttling, not a hard cap. (Added
   2026-10-01, STRATEGY-1 section 8: cost is the biggest ROI lever because total spend dwarfs any near-term income.)
- Progress recorded in STRATEGY.md section 8: ops-frontier traffic moved off gpt-5.5 in qnfo-ops 2.38.31. No paid advertising.

### Phase B (weeks 2–4): funding first, then the first revenue line (changed 2026-10-01, STRATEGY-1 sections 7 and 8)
Framing: QNFO is open, public-interest research with a funding target, funded by grants first and by paid assessments
second. Paid products follow audience, not the other way round. Funding target: grant or engagement income at least equal
to the AI burn by 2027-03-31, then to total fleet cost.

Existing assets (2026-09-26 record): 904-paper living corpus (451 full reports),
q08.org signal engine, ipatent (free experiment at ipatent.qnfo.org; `ipatent.me` has no DNS and is not cited), qnfo-ai
research gateway, outreach engine (3.18% reply rate).
Order:
1. **Grants** (priority): NLnet proposal (deadline 2026-11-03), then Emergent Ventures, Foresight and LTFF follow-ups.
2. **Assessment / advisory offer**: JPCUB measurement for a platform or data centre, opened through warm outreach replies
   (10 warm replies on 2026-09-26). This is the first revenue line that matches the lead pillar.
3. **Premium research digest ($10/mo)**: deferred until 200+ confirmed subscribers (1 subscriber; no payment rail, #1616).
- Not pursued now: ipatent B2B. ipatent stays a free experiment (#1648).
- v1 order, for the record: premium digest (own-domain only), ipatent.me B2B, bespoke research reports.

### Phase C (month 2–3): prove the numbers
- Gate: the review gate on 2026-12-31 (section 2), and the funding target above (2027-03-31). Changed 2026-10-01,
  STRATEGY-1; v1 gate was revenue ≥ burn by 2026-12-31, then grow 20%/mo.
- Dashboard now shows money math (burn, revenue, cost-per-report, break-even) on the root view. The plan is graded on the
  STRATEGY.md section 6.3 scorecard and the section 9 targets.

### Standing rules
- Personal utility layer (personal-api, qnfo-email, calendar, companion) is owner infrastructure, ~$0 marginal cost — it survives any research-layer decision and is NOT part of the research P&L.
- qnfo.org + papers.qnfo.org are the home of record that every post links to.
  arXiv and selected venues for works 1, 2 and 4; no journal-chasing for the rest. Social channels are in, under the
  STRATEGY.md section 4 cadence and the section 5 owner-voice gates. (Changed 2026-10-01, STRATEGY-1 sections 4, 7 and 11;
  v1 said "No traditional-journal submissions. No social media; own pages only.")
- The research layer is judged at the 2026-12-31 review gate (section 2). If it fails, the fleet shrinks to the
  selected-works core and the personal layer; no research data is deleted automatically. (Changed 2026-10-01, STRATEGY-1;
  v1 accepted phase-1 retirement on 2026-10-25.)

## 4. Honest risk statement
Failure modes: (a) the corpus may have no paying audience — 5,660 pageviews is small and its composition (bots vs humans) is unverified; (b) ipatent B2B has a long sales cycle, not compatible with a 29-day gate; (c) cost cuts may degrade agent output quality, reducing publish throughput below the report gate. The plan's first bet (cost floor) is near-certain; the revenue bets are uncertain and time-boxed by the existing gates.
(2026-10-01: ipatent B2B is not pursued, and the 29-day gate is replaced by the 2026-12-31 review gate; STRATEGY.md sections 7 and 9.)

## 5. Evidence pointers
- Billing: AI Gateway invoice-preview/credit-balance/topup-config (cents), audited 2026-09-26 10:00Z.
- Inventory: qnfo-audit D1 (shutdown_manifest, task_dod_register, gtd_register, agent_issues, fleet_issue_dispatch, email_loop_quarantine, worker_live_audit), GitHub org search (25 open issues).
- Dashboard: fleet.qnfo.org root, a single human-action page (qnfo-fleet-dashboard v1.8.0); /roi and /ops redirect to it.
