# Handoff: Quick Read on the living papers (2026-10-19)

Owner directive this session: implement Google Scholar's **Quick Read** (scholar.googleblog.com, 25 Aug 2026) for
QNFO's living papers, then plan and execute every next action to a closeout.

State at handoff: **qnfo-gateway 3.23.2-quick-read-6**, live on papers.qnfo.org, all 20 gateway suites green,
mirror-guard clean, `worker.js` pure ASCII, `deployed-current.worker.js` byte-identical.

## What Scholar shipped, and what this is

Scholar attaches a "Quick read" to a search result that discusses your question: an overview, then **Answers**
(each point with its supporting detail behind "Show details"), **Approach** and **Considerations**.

This is the same surface over the QNFO corpus, with the one thing a full-text corpus can add and a search index
cannot: **every line of the answer quotes a sentence of the paper**, anchored to the section id the paper page
publishes, and a statement whose evidence is not in the text is dropped and counted instead of shown.

## Surfaces

| Route | Behaviour |
|---|---|
| `GET /papers/<slug>/quickread` | question form; **no model call** (a crawler following a link costs nothing) |
| `GET /papers/<slug>/quickread?q=...` | the same shell; the browser asks for the answer |
| `POST /papers/<slug>/quickread` (q) | server-rendered answer, no JavaScript needed |
| `GET /api/quickread/<slug>?q=...` | JSON; `&format=html` returns the fragment the page paints; `&fresh=1` bypasses the cache |
| `GET /_audit/quick-read` | the SLA as counters (see Monitoring) |

Entry points: a **Quick read** button on every paper page; a **Quick read** link on a search result carrying the
question typed (the question rides in `data-qr-q` and reaches the href only on pointer/focus — the
ASK-CLIENT-GONE-CRAWL-1 rule); `robots.txt` has `Disallow: /*quickread` and the pages are `noindex` with a
canonical back to the paper, because question space is unbounded.

## The three paths (owner doctrine: no single-path process)

1. **Cache** — `living-paper.quick_read`, keyed `(slug, q_hash)` where `q_hash` includes `qrRev(paper)`, i.e.
   pipeline version | version | updated_at | body length. A corrected paper is a different key. TTL 45 days,
   pruned and capped by the daily cron (`qrPrune`).
2. **One model call** — `@cf/openai/gpt-oss-120b` with `reasoning_effort: "low"` (Harmony rejects `"none"`),
   900 output tokens, over the sections the question touches (max 9 sections / 11k chars), 15 s deadline.
3. **Extractive read** — the paper's own best sentences for the question, its method sentences and its caveat
   sentences. Deterministic, verbatim by construction, and the path taken when the model fails, times out or
   returns nothing quotable.

The page always names which path ran.

## Grounding (the invariant)

- Evidence must equal a sentence of the paper in comparison form (lowercase alphanumerics, TeX and markup
  dropped); the quote shown is always the paper's text, never the model's.
- A point whose prose carries a DOI, link, author citation or figure the paper does not contain loses that
  sentence, and the item is dropped if nothing survives (the ASK-GROUND-1 standard).
- A question whose words the paper never uses is **not** refused on that basis alone: the question and the
  sections are embedded (`@cf/baai/bge-small-en-v1.5`, one batched call, vectors cached per revision in
  `quick_read_vec`) and sections above `QR_SEM_MIN = 0.55` are read and labelled **related**. When nothing clears
  the floor, the honest verdict stands — `coverage: none`, no model call, and the page names what the paper does
  cover.

## Measured, not claimed

- First read 5–10 s (was 12–16 s), cached instant. Model choice was measured, not assumed: kimi-k2.6 9.7 s vs
  gpt-oss-120b 5.2 s on the same 2k-token prompt.
- `/_audit/quick-read` at handoff: `ok: true`, 17 reads, 13 answered, 2 related, 2 uncovered, 6 written or partly written,
  5 answered from the paper's own sentences, 20 statements dropped, 18 section vectors, 0 unreadable payloads.

## Registry (so the gaps cannot recur)

| Kind | Key |
|---|---|
| failure mode | `fm-quick-read-stale-cache`, `fm-quick-read-vocabulary-miss` |
| root cause | `rc-quick-read-stale-cache`, `rc-quick-read-vocabulary-miss` |
| contract | `QUICK-READ-STALE-CACHE-1`, `QUICK-READ-VOCABULARY-MISS-1` |
| issue | 99903, 99904 — closed through `issue_triage → resolved` with evidence |

## Defects found and fixed in this work (all the same shape)

Every one was a **claim not tied to evidence**:

1. A cache key without the paper revision claimed freshness for text the paper no longer had.
2. An exact-vocabulary miss claimed the paper did not answer a question it does bear on.
3. A release note claimed the OpenAPI index carried the endpoint; it did not.
4. A payload claimed `coverage: related` with `passages: 0` — the selector's lexical gate emptied the pick and the
   page still said it had read the closest sections. (Found in the closeout sweep, on the live site.)

The pattern is worth keeping in view: the feature's honesty was never the model's problem, it was the plumbing
asserting states it had not verified.

## Known limits (unchanged, stated so they are not rediscovered)

- **One global cosine floor (0.55)**, not calibrated per shelf. It has been exercised on one paper; a QEC paper and
  an energy paper plausibly need different floors.
- **A meaningful share is "read, not written"**: 17 statements dropped across 14 reads. When the model paraphrases
  instead of quoting, its item is rejected and the paper's own sentence answers. Honest, less synthesized.
- **Cost**: each new `(paper, revision)` pays 18 embeddings plus one completion.
- **Cross-domain questions correctly refuse** (`coverage: none`) — the fallback is for different words about the
  same material, not for different material.

## Operating notes

- Purge one answer: `DELETE FROM quick_read WHERE slug = ? AND question LIKE ?` — or ask with `&fresh=1`.
- Purge a paper's vectors (after an embedding model change): `DELETE FROM quick_read_vec WHERE slug = ?`.
- Change the floor: `QR_SEM_MIN` in the QUICK-READ-1 block; `QR_CACHE_VERSION` must be bumped with any change to
  the pipeline, which retires the rows it wrote.
- The suite is `qnfo-gateway/quick-read.test.mjs` (70 assertions) and it runs in `deploy-gate`.

## Next actions (in priority order)

1. **Calibrate `QR_SEM_MIN` per shelf** — sample 20 questions per shelf against 3 papers each, and record the
   cosine of the first relevant section; a single floor is a guess.
2. **Reduce the dropped-statement share** — the surviving model items are correct; more of them would be if the
   prompt returned sentence indices from a numbered passage list, which makes verbatim quoting mechanical rather
   than a model habit.
3. **Pre-warm the default question** for papers published in the last 7 days in the daily cron, so the first
   visitor's read is cached.
4. **Watch `/_audit/quick-read`** — a rising `answered_from_the_paper_only` share means the model path is degrading
   and the page is silently becoming a quote machine.
