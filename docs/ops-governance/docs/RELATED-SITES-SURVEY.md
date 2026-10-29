# QNFO Related-Sites Survey - LessWrong Neighbors + Autonomous Multi-Venue Radar

> Version 1.0 (2026-09-03) - Owner: QNFO - Status: IMPLEMENTING (survey complete; radar worker in qnfo-workers)
> Claim: Under QNFO's hard requirement of 100%-autonomous, cloud-native, zero-user-intervention
> operations, the platforms related to LessWrong split into two classes: written-content forums
> (Alignment Forum, EA Forum, Hacker News) permit FULLY AUTONOMOUS READING only - every one gates
> writes behind a human account and/or community norms - while API-native prediction surfaces
> (Metaculus, Manifold) permit token-authenticated AUTONOMOUS WRITES. The multi-venue read radar
> therefore covers LW+AF (same API/corpus), EA Forum (RSS) and Hacker News (Algolia JSON), all
> machine-consumable without credentials; autonomous writes are deferred to Metaculus (and,
> optionally, Manifold) under the claim-calibration program.
> Evidence: live probes 2026-09-03 - alignmentforum.org/api returns the identical self-describing
> doc (name: lesswrong, version 2.0.0) and resolves the same policy post KXujJjnmP85u8eM6B;
> forum.effectivealtruism.org/api and /api/v1/posts return HTTP 404 while /feed.xml returns HTTP
> 200 valid RSS; hn.algolia.com/api/v1/search returns 200 JSON; metaculus.com/api2/questions
> returns 403 unauthenticated and the official API docs describe token auth via Authorization
> header; api.manifold.markets/v0/markets returns 200 JSON. Baseline platform evidence in
> docs/LESSWRONG-INTEGRATION.md (70b1c36).
> Confidence: high on surfaces probed live; HN guidelines page text was not machine-extractable
> (web fetch returned empty) so HN posting norms are cited from the published guidelines page
> without a fetchable excerpt.
> Status: survey + autonomy reframe complete; the implementation (qnfo-venue-radar) supersedes the
> LW-specific worker name in LESSWRONG-INTEGRATION.md section 6 (that spec remains the authoritative
> LW write/policy document and is UNCHANGED - QNFO.LW.002 red-team READ-ONLY gate).

---

## 1. Objective and scope

Extend the LessWrong integration exploration (QNFO.LW.001) to the adjacent platforms a
rationalist/EA/technical audience actually uses, and audit each against QNFO purpose (energy- and
compute-efficiency metrology: PaQit, joules-per-compute, physical limits of computation), mission
(honest open research, computational verification, zero fabrication/spam) and the autonomy
requirement (100% autonomous, cloud-native, no user intervention).

## 2. Platform survey (live-probed 2026-09-03)

| Venue | Purpose / mission | Machine surface (evidence) | Write autonomy | QNFO alignment (mission/audience/fit) | Verdict |
|---|---|---|---|---|---|
| LessWrong | Rationality + AI-safety discussion | Official agent API v2.0.0; read open; draft-collab-only write | 1/5 - human primary author required | 5 / 5 / 5 | Human-gated write; autonomous read (LESSWRONG-INTEGRATION.md) |
| Alignment Forum | AI alignment research | SAME platform/corpus as LW - identical API doc, policy post resolves, /api/latest + /api/home live | 1/5 - same policy | 4 / 4 / 4 | Covered by the same radar surface; no extra architecture |
| EA Forum | Effective altruism (AI safety, global health, climate, bio) | No public REST API (404); /feed.xml RSS 200; /graphql 400 (undocumented) | 1/5 - human account + FM norms | 3 / 3 / 3 | Autonomous RSS read input |
| Hacker News | Tech/engineering + launches | Algolia read API 200 JSON; no public write API; guidelines page not machine-fetchable | 1/5 - account + norms (Show HN for launches) | 4 / 4 / 3 | Autonomous Algolia read input |
| Metaculus | Forecasting ecosystem | Official API docs (metaculus.com/api); token via Authorization header; api2/questions 403 unauthenticated (live, gated) | 5/5 after one-time account+token | 4 / 2 / 4 | Autonomous write candidate (claim-calibration layer) |
| Manifold Markets | Play-money prediction markets | api.manifold.markets/v0/markets 200 JSON; documented bot ecosystem | 5/5 with API key | 2 / 2 / 2 | Autonomous write possible; low mission fit - experiment-only |

Considered-and-excluded (completeness record): Reddit rationalist subreddits (read possible, bot
posting norm-restricted), Astral Codex Ten / Substacks (read-only, no community API), ResearchGate /
Academia.edu (closed automation, weak fit), The Nonlinear Library (human-submission audio
republication). Social amplification (X/LinkedIn/Mastodon via Buffer, Bluesky via qnfo-social) is
already live per OUTREACH-AMPLIFICATION-CATALOG.md and is NOT re-scoped here.

## 3. Autonomy audit - structural reframe

No written-content forum permits unattended autonomous publishing:
- LessWrong/Alignment Forum: explicit policy - primary author must be an existing human account
  (LESSWRONG-INTEGRATION.md sections 2-3, 2025 policy post KXujJjnmP85u8eM6B retained section).
- EA Forum and Hacker News: writes gated behind human accounts + community norms; no public API.
- Reddit/Substack: same class.

API-native prediction surfaces (Metaculus, Manifold) are the only class that supports
token-authenticated autonomous writes; the QNFO social engine already performs autonomous
amplification on X/LinkedIn/Mastodon/Bluesky.

Therefore the autonomous architecture is:
1. AUTONOMOUS READ LAYER (this cycle): multi-venue radar - LW/AF (one API), EA Forum (RSS), HN
   (Algolia) - into qnfo-audit D1; no email; kill switch; audit rows.
2. AUTONOMOUS WRITE LAYER (claim-calibration program): Metaculus first (token), Manifold optional.
3. HUMAN-GATED WRITE (LW/AF/EA/HN): draft preparation stays autonomous; publication performed by
   the human account only if the no-intervention requirement is lifted for those venues - a
   platform-policy boundary, not an engineering gap.

## 4. Implementation decision (QNFO.LW.003)

Worker **qnfo-venue-radar** (new, qnfo-workers) supersedes the LW-specific Phase-1 name
(qnfo-lesswrong-radar) from LESSWRONG-INTEGRATION.md section 6. Schedule `45 6 * * *` UTC daily.
Bindings: qnfo-audit D1 (RADAR_DB, id 35e2e573-92f3-46ac-83c6-22f6429fc5e5). No secrets.
Tables (migration 001): venue_signal, venue_radar_runs, venue_radar_config (kill switch
venue_radar_enabled; last_run_utc; review_due_at=2026-10-03 for the 30-day relevance/Vectorize
review - dated trigger satisfies the zero-deferred rule). Keyword buckets mirror
LESSWRONG-INTEGRATION.md section 6 + QNFO research-domain keywords (events-radar DOMAINS style).

## 5. Claims and evidence

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| AF shares the LW platform/corpus + API | alignmentforum.org/api returns identical lesswrong v2.0.0 doc; policy post KXujJjnmP85u8eM6B resolves; /api/latest, /api/home, /api/search live 2026-09-03 | high | verified |
| EA Forum has no public REST API | /api and /api/v1/posts HTTP 404 2026-09-03 | high | verified |
| EA Forum exposes working RSS | /feed.xml HTTP 200 valid XML 2026-09-03 | high | verified |
| HN read path = Algolia JSON | hn.algolia.com/api/v1/search HTTP 200 2026-09-03 | high | verified |
| Metaculus API requires token auth | official docs (metaculus.com/api) describe Authorization-header token; api2/questions HTTP 403 unauthenticated | high | verified |
| Manifold has an open read API + bot ecosystem | api.manifold.markets/v0/markets HTTP 200; public bot docs | high | verified |
| Written-content forums gate writes behind human accounts | LW/AF policy text fetched; EA/HN no public write API (404s); HN norms page not machine-fetchable (len 0) | medium-high | verified (except HN excerpt) |
| LESSWRONG-INTEGRATION.md unchanged by this cycle | git log shows 70b1c36 as head of that file through 2026-09-03 | high | verified |

## 6. Open decisions (owner: user where noted)

1. Metaculus account + API token (one-time provisioning) before the claim-calibration write layer
   can run autonomously - owner: user.
2. Manifold participation (experiment-only) - owner: user; default: defer.
3. Lifting the no-intervention requirement for LW/AF/EA/HN publication would re-enable the
   human-vouched draft flow in LESSWRONG-INTEGRATION.md Phases 2-3 - owner: user; default: not lifted.
4. 30-day relevance-yield review of the radar (review_due_at 2026-10-03 in venue_radar_config)
   decides Vectorize RAG binding - owner: autonomous (worker marker) + next ops cycle.

---

*Canonical repo: QNFO/qnfo-ops (docs/RELATED-SITES-SURVEY.md). Companion: docs/LESSWRONG-INTEGRATION.md
(QNFO.LW.001, 70b1c36). Evidence probes 2026-09-03. QNFO.LW.002/003.*