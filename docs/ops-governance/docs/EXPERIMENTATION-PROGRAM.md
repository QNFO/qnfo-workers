# QNFO Experimentation Program

> Version 1.0 (2026-09-02) · Owner: QNFO autonomous program · Status: ACTIVE
> Claim: a governed, measured experiment loop (website content / paper topics / writing styles / social
> messages) adapts QNFO output to what actually raises honest engagement, using only honest analytics.
> Evidence: baseline EXP-2026-001 captured 2026-09-01 (treatment /papers/jpcub-qec-landauer = 3 req/day,
> control cwi-qa-qec-synthesis-2026 = 4 req/day; qnfo-audit paper_path_stats) · Confidence: medium ·
> Status: substrate live; first experiment running
> Companion: docs/VISIBILITY-VERSIONING-PROGRAM.md (WEBSITE-SYNC-COLUMNS-1, P7 scorecard)

---

## 1. Authority and scope

User standing directive (2026-09-02): autonomously initiate, design, and run A/B tests of website
content, paper topics, writing styles, social media messages, and related levers; track and measure
relevant analytics; adapt, iterate, and optimize. This program governs those experiments so they are
honest, measurable, and never spammy or fabricated.

## 2. Experiment types (current menu)

| Kind | Levers | Primary outcome metrics | Notes |
|---|---|---|---|
| Website content | paper page title/abstract/body framing; landing treatments | per-path honest requests (CF adaptive, exact path), page scroll/click where measurable, Zenodo view/download deltas | Dynamic-via-D1 (qnfo-gateway renders living-paper), so content edits are data writes |
| Version freshness | new-version publish + website sync (WEBSITE-SYNC-COLUMNS-1) | paper path requests, Zenodo record views/downloads, citation-watch deltas, social engagement | EXP-2026-001 is the pilot |
| Paper topics | which open questions / research programs to develop next | proposal acceptance, publish throughput, citation growth, downloads | gate on shortlist + registry |
| Writing styles | abstract/length/tone variants; publication prose style | engagement, downloads, citation velocity | respect ANTI-TELEGRAPH-1 / brand language |
| Social messages | post framing, length, channel mix, thread vs single | engagement per post (likes/reposts/replies), profile growth, click-through to DOI | use Buffer/qnfo-social per-post IDs (verified live 2026-09-02) |

## 3. Measurement rules (HARD)

- HONEST-ONLY: worker_invocations table is self-health, NEVER cited as external traffic
  (IMPRESSIONS-ZONE-NOT-WORKER-1). Honest web signal = CF GraphQL exact-path adaptive groups or
  1dGroups zone totals minus scanner/bot noise.
- AGGREGATE-OVER-N: per-paper daily honest traffic is tiny (EXP-2026-001 baseline: 3-4 req/day).
  A single-path page-view A/B cannot reach significance quickly. Experiments must aggregate at least
  two independent honest signals (e.g., site path + Zenodo deltas) and/or extend the window.
- NO-FABRICATION: results are read from the stores, never invented. A claim requires the tool call.
- NO-SPAM: social A/B runs within platform etiquette and the anti-burst rules of the email/social
  policy; channel IDs are live-discovered, never hardcoded.
- SAME-WINDOW COMPARISON: control and treatment measured over identical calendar windows.

## 4. Experiment registry (qnfo-audit D1)

- experiments (id, name, hypothesis, kind, treatment, control, outcome_metric, baseline_date, status,
  owner, created_at)
- paper_path_stats (date, slug, requests) - daily exact-path honest counts
- Social per-post engagement: wired 2026-09-02 - qnfo-audit.social_engagements table + jobEngagement
  (qnfo-cloud-ops v1.10.0, weekly Mon 07:15 AMS, Bluesky live + Buffer token-gated) + scripts/engagement_collect.py.
  See docs/ENGAGEMENT-STRATEGY.md (this program's execution umbrella).

Registered: EXP-2026-001 version-freshness (running); EXP-2026-002 social message framing (running); EXP-2026-003 social posting time (planned); EXP-2026-004 outreach subject-line A/B (registered, activates 2026-09-15 per OUTREACH-AUTOMATION-STRATEGY).

## 5. Iteration cadence

- Weekly: P7 scorecard digest (Mon 07:30 AMS) feeds experiment readouts.
- 14-day close: EXP-2026-001 reads all outcome metrics, decides keep/adapt, logs to memory.
- Adaptation rule: a lever that shows a positive honest-signal delta on >=2 metrics is promoted to the
  standard operating procedure for that surface; a neutral/negative lever is dropped with rationale.

## 6. Claims and evidence

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| Website is dynamic-via-D1 (content edits = data writes) | WEBSITE-SYNC-COLUMNS-1 fix verified live (22261547 on page, 0x old DOI) | high | verified |
| Honest per-paper traffic baseline is low (3-4 req/day) | paper_path_stats 2026-09-01 | high | verified |
| Experiment registry substrate live in qnfo-audit | experiments + paper_path_stats tables created 2026-09-02 | high | verified |
| P7 scorecard emits weekly honest digest (citations + engagement sections added) | qnfo-cloud-ops v1.10.0 /health (18 jobs, visibility) | high | verified |
| Social pipeline has per-post IDs for engagement tracking | Buffer post IDs recorded 2026-09-02 (mastodon/linkedin/twitter) | high | verified |

---

*Canonical repo: QNFO/qnfo-ops (docs/EXPERIMENTATION-PROGRAM.md). Program plan:
docs/VISIBILITY-VERSIONING-PROGRAM.md.*
