# qnfo-ipatent — Inventor Disclosure Assistant (ipatent.qnfo.org)

**Version:** 3.4.2 (2026-09-03) · **Worker:** qnfo-ipatent · **Live:** https://ipatent.qnfo.org

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

## Endpoints
| Route | Method | Purpose |
|---|---|---|
| / | GET | Landing UI |
| /api/draft | POST | Draft disclosure (rate-limited 20/hr/IP) |
| /api/suggest | GET | Adaptive IP-domain suggestions |
| /api/idea?i=N | GET | Corpus example (random or by index) |
| /api/search?q= | GET | Corpus semantic search |
| /api/disclosures | GET | Recent submissions list |
| /api/submission/:id | GET | One submission |
| /api/status | GET | Version/model/stats |

## Deploy
- Canonical source: `QNFO/qnfo-workers/qnfo-ipatent` (restored 2026-09-03 from the
  deployed v3.3 bundle; this directory is the canonical repo home).
- `wrangler deploy` from this directory (wrangler.toml reproduces the live binding set:
  D1 `IPATENT_DB` ipatent-db, R2 `IPATENT_R2` ipatent, Vectorize `DISCLOSURES_VZ`
  ipatent-corpus, AI).
- Verify after deploy: `/health` version + `/api/status` bindings true.
- Live custom route: ipatent.qnfo.org (verified). qnfo.org gateway 301s /ipatent here.
