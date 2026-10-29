# QNFO Analytics, Marketing & User Engagement Strategy

> Version 1.0 (2026-09-02) · Owner: QNFO · Status: ACTIVE
> Claim: a unified, honest engagement system - funnel instrumentation, governed A/B experimentation,
> multi-channel social amplification, and a citation engine - raises impressions, likes, comments,
> shares, reposts, and especially citations, all measured end-to-end with live, verifiable evidence.
> Evidence: verified live 2026-09-02 this session (CF GraphQL zone 7d = 66,328 req / 26,727 pageviews /
> 7,044 uniques; Bluesky 30 latest posts = 0 likes / 0 reposts / 19 replies collected into
> qnfo-audit.social_engagements; Buffer token 401 = reconnect required; qnfo-cloud-ops v1.10.0 deployed
> with jobEngagement) · Confidence: high (substrate) / medium (growth projections) · Status: ACTIVE
> Companion docs: EXPERIMENTATION-PROGRAM.md (experiment governance), VISIBILITY-VERSIONING-PROGRAM.md
> (version engine), OUTREACH-AUTOMATION-STRATEGY.md (execution layer: automated email outreach - RFC /
> async interviews / journalist-blogger pitches / grant EOIs - and open submissions; programs P-A..P-F,
> qnfo-outreach worker v0.1.0), CLOUD-NATIVE-AUTONOMY-PLAN.md

---

## 1. North-star and success metrics

North-star: **citations** (external works citing QNFO records) and **reposts/shares** (humans
re-broadcasting QNFO work). These two compound; everything else is a leading indicator or hygiene
metric. Honest-measurement doctrine (IMPRESSIONS-ZONE-NOT-WORKER-1): worker_invocations is self-health
and is NEVER cited as external traffic.

| Metric | Definition | Source (live) | Store | Cadence |
|---|---|---|---|---|
| Impressions | requests/pageviews on papers.qnfo.org; Zenodo views; per-post reach | CF GraphQL httpRequests1dGroups (zone 84e9dc1d7fb72629ccdbe3174ed24420) + exact-path; Zenodo records API stats; Buffer interactions.reach | qnfo-audit (zenodo_stats, paper_path_stats, social_engagements) | daily zenodo; weekly scorecard |
| Likes | per-post favourites | Bluesky likeCount (AT proto); Buffer interactions.favorites (Mastodon/LinkedIn/X) | social_engagements | weekly (jobEngagement, Mon 07:15 AMS) |
| Comments | per-post replies; inbound email | Bluesky replyCount; Buffer interactions.comments; qnfo-email inbox | social_engagements + emails | weekly + continuous |
| Shares / reposts | re-broadcast of QNFO content | Bluesky repostCount; Buffer interactions.retweets/shares | social_engagements | weekly |
| Citations | external works citing QNFO records | OpenAlex cited_by_count; DataCite events citationCount (Zenodo DOIs are DataCite-registered; Crossref 404s on them); citation-watch deltas | citation_stats | weekly sweep + event triggers |

Baseline (verified 2026-09-02):
- Zone 7d: 66,328 requests / 26,727 pageviews / 7,044 uniques (raw; ~90% scanner/bot noise; honest
  /papers/* traffic ~400 req/day across ~106 paths per reach-audit).
- Bluesky (30 latest posts): 0 likes, 0 reposts, 19 replies - engagement is real but tiny.
- Buffer: token 401 (reconnect owner = user; surface via scorecard until fixed).
- Citations: OpenAlex cited_by_count = 2 across the 20 DOIs OpenAlex tracks; DataCite
  citationCount = 32 across 25 DOIs (verified 2026-09-02 sweep; NOTE: DataCite counts
  intra-corpus/version citations too - internal-vs-external classification is the next
  instrumentation step, see §6).

## 2. Funnel model (P0)

Discover → Land → Engage → Amplify → Cite, with per-stage metrics and levers:

| Stage | Metric | Levers (this program) |
|---|---|---|
| Discover | impressions, search presence | IndexNow pings, OpenAIRE/DataCite registration, sitemap, SEO meta, arXiv radar |
| Land | honest /papers/* requests, Zenodo views | version freshness (WEBSITE-SYNC-COLUMNS-1), titles with visible bridges (CROSSWALK-TRANSLATION-1) |
| Engage | likes/comments/replies, downloads, email replies | plain-language threads, reply-to-everything policy, practitioner/student boxes |
| Amplify | reposts/shares, referrals | D7-copy social posts with real deltas (no announcement theater), Buffer multi-channel |
| Cite | cited-by counts, follow-up versions | open access + DOI + aggregators, citation-watch → type-C version deltas |

## 3. Analytics instrumentation (P1)

Existing (verified): P7 visibility scorecard (qnfo-cloud-ops jobVisibility, weekly Mon 07:30 AMS),
zenodo_stats (daily 09:00), paper_path_stats (experiment baselines), experiments registry,
social_threads (Bluesky queue), social_media_posts (Buffer log), citation_stats (per-DOI metrics).

New this cycle (implemented + verified):
- **social_engagements** time-series table in qnfo-audit (platform/post_id/metric/value/collected_at,
  UNIQUE upsert key) - created 2026-09-02, first live rows collected same session.
- **jobEngagement** in qnfo-cloud-ops v1.10.0 (deployed, /health verified): weekly Mon 07:15 AMS
  collects Bluesky like/repost/reply counts (AT proto, 25-uri chunking) + Buffer interactions
  (graceful 401 → auth_status row), writes via env.AUDIT.batch.
- **jobVisibility v1.10.0** digest extended with citation + engagement sections.
- Canonical scripts in qnfo-ops/scripts/: engagement_collect.py (local run path, same APIs),
  citation_sweep.py (OpenAlex + DataCite + Zenodo), buffer_post.py (list-channels/post/interactions,
  exit code 2 = token reconnect needed).

Rules (HARD): honest-only; same-window comparisons; per-collection idempotency (upserts); no
fabrication - a metric that was not collected reads as "unavailable", never zero.

## 4. A/B experimentation program (P2)

Governed by EXPERIMENTATION-PROGRAM.md (HONEST-ONLY, AGGREGATE-OVER-N, NO-FABRICATION, NO-SPAM,
SAME-WINDOW). Registry: qnfo-audit.experiments.

| Experiment | Status | Design | Decision gate |
|---|---|---|---|
| EXP-2026-001 version-freshness | running | treatment jpcub-qec-landauer v1.7 site-synced vs static control; baseline 3-4 req/day | 14-day close, >=2 honest signals |
| EXP-2026-002 message framing (NEW) | running | delta-first framing vs DOI-first framing on Bluesky threads (cycle-1 papers). Treatment applies to newly composed threads from 2026-09-02; control = existing queue pattern (DOI-first). Both post through the same engine. | per-post engagement deltas aggregated over >=4 weeks |
| EXP-2026-003 posting time (NEW) | planned | morning window (07-08 UTC) vs current 14:30 UTC slot | gate on EXP-2026-002 data + cron shift of qnfo-social |

Power reality (AGGREGATE-OVER-N): per-paper honest traffic is 3-4 req/day; a single-path A/B cannot
reach significance quickly. All experiment reads therefore aggregate >=2 independent honest signals
(site path + Zenodo deltas + per-post engagement) over identical windows.

Backlog (registered next cycle, same registry discipline): abstract-length framing (title/abstract
variants on living-paper), thread length (5-post vs 3-post), channel-mix (Bluesky-only vs
Bluesky+Buffer cross-post), landing-page CTAs.

## 5. Social media amplification (P3)

Channel matrix (verified 2026-09-02):

| Channel | Engine | State | Cadence |
|---|---|---|---|
| Bluesky (@qnfo.bsky.social) | qnfo-social worker | LIVE - 13 queued threads at audit, posts 1/day 14:30 UTC | daily |
| Mastodon / LinkedIn / X | Buffer (buffer_post.py) | channels connected; token 401 = reconnect (owner user) | on v-next publish + calendar |

Content rules (D7 copy): <=280 chars, contribution → DOI, no exclamation marks, no hype, no invented
numbers; every post carries why-a-reader-should-care (SO-WHAT-GATE-1); no AI-telegraph styling
(ANTI-TELEGRAPH-1); no internal gate names as marketing (PUBLICATION-BRAND-LANGUAGE-1).

Engagement policy: reply to every genuine comment/reply/mention within 24h (this is the single
highest-leverage social action at current scale); follow and engage adjacent-domain accounts
(QEC/thermo/energy efficiency); threads invite scrutiny, not applause.

Content calendar (next 7 days, from the existing queue + cycle-1 shortlist): 1 queued thread/day
from the existing queue (13 queued threads at audit time 2026-09-02 - the queue is fed by
autoScan + compose, count varies with concurrent sessions; engine posts 1/day at 14:30 UTC) + one
v-next announcement thread when JPC.003 v1.7 addendum publishes (P3 amplification of
VISIBILITY-VERSIONING-PROGRAM). Newly composed threads use delta-first framing (EXP-2026-002).

## 6. Citation engine (P4)

- Registration & discoverability: Zenodo is the canonical venue (NO-JOURNALS-1); OpenAIRE indexes the
  set; DataCite events now collected; Semantic Scholar does NOT index the set (S2-ZENODO-GAP-1) -
  mitigated via arXiv preprints where applicable + ORCID record + Google Scholar profile.
- citation-watch → version trigger (VISIBILITY P5): a new citation or related external result for an
  existing paper writes a type-C version suggestion; the v-next responds to the citing work (this is
  how citations beget citations).
- Cross-linking: genuine intra-corpus citations (KG edges) + "cite this" blocks (BibTeX + DOI) on
  paper pages (P6 surface).
- Collection: citation_sweep.py (OpenAlex + DataCite + Zenodo stats) verified 2026-09-02
  (25 DOIs → 95 rows: openalex 20, datacite 25, zenodo 50). Internal-vs-external citation
  classification: query DataCite events detail (relationships.citedByCrossref) and exclude
  qnfo.org-affiliated DOIs, store class in citation_stats via the note/metric suffix -
  next instrumentation step.
- Weekly cloud recurrence: the Monday jobEngagement scope covers social engagement; citation
  sweeps run on the same weekly cadence via citation_sweep.py from the ops cycle
  (CLOUD-FRONTEND-ONLY-1: no local cron).
- Targets (90d, re-baselined after 2 weeks): >=1 external citation per cycle-1 flagship
  (JPC.003 / UMP.012 / UMP.014); >=10% of corpus DOIs with non-zero Zenodo unique views.

## 7. Email & researcher outreach (P5)

- Version notifications: topic-affinity contacts who engaged with v1 get a one-line "v2 adds X" note
  (OUTREACH-REVIEW-1: fully autonomous, receipt = notification not a request).
- Reply-to-everything on inbound mail; no burst sends; test-email spam gate (EMAIL DELIVERABILITY)
  applies to all sends.
- Domain outreach is evidence-gated: only after a paper shows honest engagement or a citing work.

## 8. Website conversion & engagement surfaces (P6)

- Paper page (living via qnfo-gateway + D1): cite-this block (BibTeX + DOI), version-delta note,
  practitioner takeaway / student companion boxes (reach deltas from VISIBILITY-PROGRAM §3.1).
- Comment surface: deferred until funnel data shows engagement volume that justifies moderation
  (decision gate: >=50 honest /papers/* req/day aggregated or >=5 inbound emails/week). Until then
  social replies + email are the engagement surface.
- SEO: sitemap live, IndexNow pings on publish, meta descriptions per paper (weekly-ops SEO health
  job already audits title/JSON-LD).

## 9. Scorecard, cadence & goals (P7)

- Weekly digest (Mon 07:30 AMS): zone traffic, Zenodo deltas, new versions, social threads,
  citations (new), social engagement (new).
- 14-day experiment reads; monthly strategy review (agent, evidence-based); quarterly plan revision
  with the user (VISIBILITY-PROGRAM §7).
- 30/60/90-day goals (honest, directional): 30d - all five metric classes instrumented + first
  engagement deltas; 60d - +20% honest /papers/* traffic aggregated; 90d - >=1 citation per cycle-1
  flagship + Buffer reconnected and cross-posting resumed.

## 10. Governance & guardrails (P8)

Cost envelope: all collection is read-only API calls (AT proto, Buffer, OpenAlex, DataCite,
  Zenodo, CF GraphQL) - no AI inference in the collection path; Cloudflare spend stays inside the
  $90/30d budget policy (COST-AUDIT-MISS-AI-1).

HARD: honest-only metrics; NO-SPAM (social etiquette + email anti-burst); NO-FABRICATION; no
credential signaling; brand-language ban; no meta-commentary; no journals (Zenodo canonical);
publications remain computationally verified (COMPUTATIONAL-VERIFICATION-1); fleet self-doc
(VERSION + /health + repo parity) on every worker change; claim-sheet convention on every locked
claim in this document (FRAMEWORK-DOGFOOD-1).

## 11. WBS (WBS.TAXONOMY §2) & roadmap (P9)

| WBS | Work package | Deliverable | Owner | Status (2026-09-02) |
|---|---|---|---|---|
| P0 | Funnel + north-star definition | this document §1-2 | QNFO | done-verified |
| P1 | Analytics instrumentation | social_engagements + jobEngagement + jobVisibility 1.10.0 + 3 scripts | QNFO | done-verified (deployed, rows live) |
| P2 | A/B program | EXP-2026-002/003 registered; backlog | QNFO | done-verified |
| P3 | Social amplification | calendar + reply policy + Buffer tool | QNFO | partial (Buffer token user-side) |
| P4 | Citation engine | DataCite/OpenAlex sweep + cite-this blocks | QNFO | sweep done-verified; cite-this next cycle |
| P5 | Email outreach | version-notification flow + full outreach engine (RFC/interview/pitch/EOI via qnfo-outreach v0.1.0, OUTREACH-AUTOMATION-STRATEGY P-A..P-F) | QNFO | live (date-gated activation 2026-09-15) |
| P6 | Website conversion | cite-this block, comment-surface gate | QNFO | planned |
| P7 | Scorecard & review | weekly digest + experiment reads | qnfo-cloud-ops cron | live (v1.10.0) |
| P8 | Governance | guardrail list + claim sheets | QNFO | live |
| P9 | Roadmap maintenance | 30/60/90 re-baseline after 2 weeks of scorecard data | QNFO | scheduled (weekly digest) |

## 12. Claims & evidence

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| Bluesky engagement collected live into D1 | social_engagements rows: 30 posts, 0 likes, 0 reposts, 19 replies, collected 2026-09-02 | high | verified |
| Buffer API token currently unauthorized | profiles.json 401 (both api.bufferapp.com endpoints) 2026-09-02 | high | verified; reconnect owner=user |
| jobEngagement deployed and scheduled | /health version=1.10.0, 18 jobs incl. engagement; cron 15 5 * * 1 added via schedules API (16 triggers) | high | verified |
| Weekly digest now carries citations + engagement | jobVisibility v1.10.0 source reads citation_stats + social_engagements | high | verified (code read-back) |
| Citation sweep works end-to-end | 25 DOIs → 95 rows (openalex 20 sum 2, datacite 25 sum 32, zenodo 50 = 2,502 dl / 684 views) | high | verified |
| Zone honest baseline | CF GraphQL 7d 66,328 req / 26,727 pv / 7,044 uniq; ~90% bot noise (reach-audit) | high | verified |
| Outreach execution layer live | qnfo-outreach v0.1.0 deployed (activation 2026-09-15), cron 0 11 * * 1-5, +1 mined contact; scorecard outreach section via cloud-ops v1.11.0 (/health outreach:true) | high | verified |
| Corpus citations are non-zero via DataCite | datacite citationCount sum 32 / 25 DOIs; internal-vs-external split not yet classified | high | verified-baseline |

## 13. Open items (explicit, owned)

- Buffer token reconnect (401) - owner: user; trigger: reconnect at buffer.com → update ~/.env
  BUFFER_TOKEN → next jobEngagement run auto-recovers (buffer_post.py exit 2 flags it).
- Comment surface on paper pages - owner: QNFO; trigger: funnel gate in §8 reached.
- cite-this blocks on paper pages - owner: QNFO; trigger: next qnfo-gateway cycle.

---

*Canonical repo: QNFO/qnfo-ops (docs/ENGAGEMENT-STRATEGY.md). Scripts: qnfo-ops/scripts/*
