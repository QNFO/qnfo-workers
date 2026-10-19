# Closeout — professional paper typesetting with full bibliographic information and author/affiliation (2026-10-18)

Owner directive this thread: **"QNFO PAPER PDF NEED BETTER, PROFESSIONAL TYPESETTING AND FORMATTING THAT INCLUDE FULL
BIBLIOGRAPHIC INFORMATION AND AUTHOR/AFFILIATION"**, then **"RED-TEAM/MERGE/DEPLOY/CLOSEOUT/HANDOFF"**.

Everything below is measured against live `qnfo-pdf` (`https://qnfo-pdf.q08.workers.dev`), the public artifacts at
`qnfo.org/papers/<slug>.pdf`, and D1 `living-paper` / `qnfo-audit` unless marked otherwise.

---

## 1. What was wrong, and the shape of the fix

The paper PDF is the artifact a reader cites and an indexer crawls, and it carried neither of the two things that make it
citable. Measured on `https://qnfo.org/papers/completeness-senses-levi-civita.pdf` (133,651 bytes): fonts `LiberationSerif`
+ `KaTeX_*`, and the string `References` appeared **nowhere in the file**.

Three defects sat under that:

1. **The bibliography was never read.** Every paper ships `references.bib` beside its markdown in R2
   (`{papers.r2_path}references.bib`), and `body_md` ends at a bare `## References` heading. The renderer printed that
   empty heading and the raw `[@key]` markers; `respond()` and the backlog renderer passed `{title}` only.
2. **The author/affiliation record never reached the page.** `living-paper.papers` holds `authors`, `identifier`,
   `license`, `keywords`, `categories`, `version`, `published`, `paper_type` — none of it was passed to the render. 67
   records also carry an in-body byline block (`Author: … / Affiliation: … / ORCID: …`), which printed as a prose
   paragraph.
3. **The running head and page numbers were dead code.** `displayHeaderFooter: false`, so the header and footer templates
   never applied.

The fix is a typesetter, not a stylesheet: `renderer.js` 2.2.0 (title block, BibTeX parser, citation numbering, reference
list, print CSS, print templates) spliced into `worker.js` by `qnfo-pdf/build.mjs`, and `worker.js` 1.5.2 (metadata
plumbing, `loadBib()`, live header/footer, renderer stamp).

**PRs:** #2531 (1.5.0 TYPESET-PRO-1, merged `660e2234`), #2536 (1.5.1 TYPESET-PRO-2 red-team, merged `3cce866f`),
and the closeout PR (1.5.2: unkeyed reference lists, corpus audit script, this file, the registry migration).

## 2. Red-team, and what it changed

The 1.5.0 fixtures were cleaner than the corpus. Rendering 74 published papers through the deployed `/html` endpoint found
three defects the unit tests could not see:

| Defect | Evidence | Fix |
|---|---|---|
| A citation wrapped across a source line break printed as raw text | `radix-agnostic-dsi-detection` 3 markers, `trapped-ion-ultrametric-synthesis` 5, `alpha-pi-helix` 1, `arithmetic-quantum-thermodynamics` 1 | the paragraph buffer is joined **before** the inline pass; the scanner spans newlines |
| The numbered reference list most papers carry in their own body was ignored | `adelic-synthesis-pattern-particle` 34 unresolved keys, `paper-the-qubit-delusion` 46 — their entries end in the pandoc key that cites them | `parseBodyReferences()` lifts the list, maps `key -> entry number` case-insensitively, strips the key annotation, prints the author's own wording |
| An unmatched key was styled as an error in papers with no bibliography at all | every old chapter and glossary showed amber keys | plain `[Key]` where nothing can be missing; flagged only where a bibliography exists |
| A corpus-wide blind spot: 511 of 624 papers carry a **numbered reference list with no citation keys** | D1: `ref_section_with_content` 511, `has_keys` 43 | 1.5.2 typesets an unkeyed list too, guarded by "closing section + at least three entries + a majority carrying a year or DOI" so a checklist is not mistaken for a bibliography |

A fifth red-team finding was in my own instrument, not the product: the audit first counted the literal `.cite-missing`
in `PRINT_CSS` and reported 40 phantom unresolved keys. The detector now counts rendered spans only
(`class="cite cite-missing"`).

**Corpus measurement, 74 published papers, before → after 1.5.1:**

| | before | after |
|---|---|---|
| papers rendering a reference list | 3 | 10 |
| reference entries rendered | 69 | 201 |
| papers with raw `[@` markers | 4 | 0 |
| papers with a title block | 74 | 74 |
| papers with an author line | 74 | 74 |
| fetch failures | 0 | 0 |

## 3. Deployed state (verified)

- `GET /health` → `1.5.1-typeset-biblio-2`, renderer `2.1.0-typeset-pro-2` (1.5.2 lands with this closeout).
- `https://qnfo.org/papers/completeness-senses-levi-civita.pdf` → 4 pages, 180,272 bytes, `References` with 13 entries,
  running head `Completeness Senses and the Levi-Civita Field … Rowan Brad Quni-Gudzinas`, footer
  `doi:10.5281/zenodo.22109086 · 1 / 4 · QNFO-ULA-2.1`, KaTeX fonts embedded, no mojibake (text extracted with pdf.js).
- `https://qnfo.org/papers/geometric-unification-framework.pdf` → 24 pages, author + **QNFO** + ORCID + ISNI + email +
  DOI lifted out of the in-body byline block.
- Back catalogue: stored PDFs carry `customMetadata.renderer`; the `*/10` tick re-renders old-stamped ones
  (`renderer 2.0.0-typeset-pro-1, refreshed 4` on the first post-deploy tick). 20 newest papers were re-rendered on
  demand; the rest converge through the loop.
- `papers.pdf_path` intact for all 618 public records, so `citation_pdf_url` (Google Scholar's only route to full text)
  never lapsed.

## 4. Guards left behind (so this cannot recur silently)

- `qnfo-pdf/typeset.test.mjs` — 33 tests, dependency-free (evaluates the inlined renderer region with a KaTeX stub):
  bibliography parsing and numbering, body-carried list, unkeyed list, checklist rejection, byline lifting,
  plain-vs-flagged unresolved keys, print templates, metadata plumbing, UTF-8 cleanliness.
- `qnfo-pdf/build.mjs --check` — the inlined renderer cannot drift from `renderer.js`.
- `scripts/pdf_corpus_audit.mjs` — renders a spread of published papers through the live worker and exits 1 on a raw
  `[@key]`, mojibake, a duplicated title or a bare References heading. This is the detector named in
  `failure_modes.fm_key = 'pdf-typeset-bibliography-dropped'` (migration
  `migrations/2026-10-18-pdf-typeset-bibliography.sql`), together with its remediation contract and the
  `paper-pdf-typesetting` control row.

## 5. Known limits, stated plainly

- **Nothing is invented.** A citation key with no entry prints as the key and is counted in `stats.unresolved`; a paper
  with no bibliography keeps its `[Key]` tokens; an affiliation that is not in the record is not printed.
- An unkeyed reference list is typeset but **cannot** be matched to in-text keys — there is no mapping to guess from.
- The typeset bibliography reproduces the author's own entry text for body-carried lists; it does not convert them to a
  house style.
- Rendering is not idempotent across renderer versions by accident: a stored PDF is only replaced when a paper is
  requested, its body changes, or the sweep reaches it. The stamp makes that visible, not instant.
- **Not in scope, still open:** the HTML paper page is rendered by `qnfo-gateway` from `body_md` and still prints an empty
  `References` heading with the citation markers stripped. Same root cause, different worker, tracked separately.

## 6. Handoff

- Worker: `qnfo-pdf`, `qnfo-workers/qnfo-pdf/` (`renderer.js` is the source of truth for the inlined region).
- Re-render one paper: `GET https://qnfo-pdf.q08.workers.dev/pdf/<slug>` (falls back to the gateway PDF path).
- Re-measure the corpus: `node scripts/pdf_corpus_audit.mjs --limit 40` (exit 0 = clean).
- Rebuild the bundle after a renderer edit: `cd qnfo-pdf && node build.mjs` (refreshes the mirror too), then
  `node --test qnfo-pdf/*.test.mjs`.
