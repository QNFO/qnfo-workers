# qnfo-ipatent — Inventor Disclosure Assistant (ipatent.qnfo.org)

**Version:** 3.6.0 (2026-10-02; support map, completeness meter, numbered paragraphs, daily cap, IndexNow) · 3.5.1 page metrics · 3.5.0 private by default, findable, honest copy · **Worker:** qnfo-ipatent · **Live:** https://ipatent.qnfo.org
## Purpose
Free experimental US-provisional patent disclosure drafting assistant, grounded in the
QNFO/QWAV patent corpus (33,500+ semantic segments). Turns an inventor description into
an 8-section USPTO-style draft with claims, using RAG over the ipatent-corpus Vectorize
index and a Workers-AI drafting model.

## What v3.4 added (adaptive, IP-domain suggestions — SUGGESTION-DOMAIN-1)

**v3.4.1:** clean technical-field taxonomy on the public suggestion surface — internal corpus
folder labels (`99_Brutal_Cleanup`, `Early_Drafts_202507`) are mapped to clean USPTO-style
fields via `cleanField()` on `/api/suggest` + `/api/idea` display surfaces (SOFT-N3 closure).

**v3.4.2:** prior-art closeness warning on /api/draft + result banner - when the description scores >=0.80 against an existing corpus filing, the response carries prior_art (flag/top_title/top_score/section) and the UI shows an amber PRIOR-ART CLOSENESS WARNING.
- `GET /api/suggest` — adaptive suggestion endpoint, IP-domain only:
  - `field` param → technical-field completions from `FIELD_SUGGESTIONS`.
  - empty `q` → rotating corpus examples (light metadata) for starter chips.
  - `q` ≥ 3 chars → `similar` corpus filings (embed + Vectorize search) for
    type-ahead "WHILE YOU TYPE" guidance.
  - Personal/ops actions (email, tasks, reminders, social) are NEVER suggested.
- `GET /api/idea?i=N` — deterministic example load by index (was random-only).
- Landing page: STARTERS chips (corpus examples, load into the form for editing),
  WHILE YOU TYPE corpus-guidance strip, and a Technical Field datalist.

## What v3.5.0 changed (pillars: security, reach)
- **PRIVATE-BY-DEFAULT-1.** An unfiled invention is confidential: a public listing of it is a pre-filing disclosure
  (fatal to novelty under EPC Art. 54). Nothing is stored unless the inventor ticks "keep a private copy"; a private
  draft writes only a metadata row (`title = '[private]'`, empty text) so the rate limit still counts. Every new row
  stores a salted SHA-256 of the IP, never the raw IP. Submission ids use `crypto.getRandomValues`.
- **DISCLOSURE-LIST-CLOSED-1.** `/api/disclosures` needs `X-Admin-Token` (secret `IPATENT_ADMIN_TOKEN`; 404 when unset).
  `/api/status` no longer lists recent titles. A saved draft is reachable only by its capability link `/d/<id>` (noindex).
- **CANONICAL-HOST-1.** `qnfo.org/ipatent*` pages 301 to `ipatent.qnfo.org` (they served a 200 duplicate);
  `/ipatent/api/*` still answers. HEAD is answered on pages.
- **FINDABLE-1.** `/robots.txt`, `/sitemap.xml`, canonical, Open Graph, JSON-LD (WebApplication, Article) with the
  ORCID author, and an indexable `/guide` (what a provisional protects, what to include, fees, pre-filing secrecy).
- **SUPPORT-GAPS-1.** Drafts end with a ninth section listing under-described features, needed drawings and statements
  that go beyond the inventor's text — the 35 U.S.C. 112(a) support problem a provisional exists to solve.
- Copy now matches the record (STRATEGY-1 s2): no "real filings", "defensible", "zero-cost", stale model name or
  `ipatent.me`; the corpus is described as the author's own draft disclosures. Download (.html) and print buttons.

## What v3.5.1 added (PAGE-METRICS-1, pillar reach)
iPatent had no pageview measurement. Each GET of `/` or `/guide` adds 1 to `page_views(day, path, source)` where source is
`search`, `qnfo`, `referral`, `direct`, `internal` or `crawler` (user-agent heuristic). No IP, user agent, cookie or
referrer URL is stored. `GET /api/metrics` serves 7d and 30d aggregates (views by source, guide views, drafts, saved
drafts, distinct drafters); qnfo-fleet-control IMPROVEMENT-LOOP-1 (SURFACE-METRICS-1) reads them hourly into
`metric_registry` as `ipatent_human_views_7d`, `ipatent_search_visits_7d`, `ipatent_crawler_hits_7d`, `ipatent_drafters_7d`.

## What v3.6.0 added (pillar: reach; the audit's phase 2, first slice)
- **SUPPORT-MAP-1.** Every claim element is matched, deterministically and at no model cost, to the numbered paragraph
  that shares most of its distinctive terms: supported (>= 60%), weak (>= 35%) or unsupported, with the terms not found.
  Shown under the draft and in the document. It checks wording, not legal sufficiency.
- **Numbered paragraphs.** Field, background, summary and detailed description are numbered [0001]... in USPTO style
  (Patent Center flags specifications without paragraph numbering).
- **COMPLETENESS-METER-1.** While typing: problem, parts, how it works, concrete values, alternatives, figures, length.
  Advisory, never blocking.
- **COST-GUARD-1.** At most 150 drafts in 24 hours across all users (the per-IP limit did not bound the total).
- **INDEXNOW-1.** `/<key>.txt` proves ownership for IndexNow (Bing, Yandex, Seznam, Naver; not Google).

## Endpoints
| Route | Method | Purpose |
|---|---|---|
| / | GET | Landing UI |
| /api/draft | POST | Draft disclosure (rate-limited 20/hr/IP) |
| /api/suggest | GET | Adaptive IP-domain suggestions |
| /api/idea?i=N | GET | Corpus example (random or by index) |
| /api/search?q= | GET | Corpus semantic search |
| /api/disclosures | GET | Submissions list (X-Admin-Token only) |
| /guide | GET | Provisional application guide (indexable) |
| /robots.txt, /sitemap.xml | GET | Crawl surface |
| /d/:id | GET | Saved draft by capability link (noindex) |
| /api/submission/:id | GET | One saved submission (private drafts 404) |
| /api/status | GET | Version/model/stats |
| /api/metrics | GET | 7d/30d aggregate page and draft metrics (no personal data) |

## Deploy
- Canonical source: `QNFO/qnfo-workers/qnfo-ipatent` (restored 2026-09-03 from the
  deployed v3.3 bundle; this directory is the canonical repo home).
- `wrangler deploy` from this directory (wrangler.toml reproduces the live binding set:
  D1 `IPATENT_DB` ipatent-db, R2 `IPATENT_R2` ipatent, Vectorize `DISCLOSURES_VZ`
  ipatent-corpus, AI).
- Verify after deploy: `/health` version + `/api/status` bindings true.
- Live custom route: ipatent.qnfo.org (verified). qnfo.org gateway 301s /ipatent here.
