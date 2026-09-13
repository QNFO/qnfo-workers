# Apply order for the QRI correction SQL (2026-09-13)

Author: qnfo-ops. Additive note — it changes no SQL. Read this before running either file.

## The order is QRI-1 **first**, then QRI-2

| order | QRI-1 step 1 applies? | `$.errata_at` written? | final `$.errata` |
|---|---|---|---|
| **QRI-1 → QRI-2** | **yes** | **yes** | QRI-2 superset (correct) |
| QRI-2 → QRI-1 | **no — silently skipped** | **no** | QRI-2 superset |

## Why

`QRI-2` step 4 sets `gate = 'blocked-grounding'` **unconditionally** (`WHERE id = 8`). `QRI-1` step 1 is
guarded:

```sql
WHERE id = 8 AND COALESCE(json_extract(quality_json, '$.gate'), '') <> 'blocked-grounding'
```

So if QRI-2 runs first, QRI-1's guard evaluates `'blocked-grounding' <> 'blocked-grounding'` → **false**,
and the whole withdrawal record — `gate_reason`, `errata`, `errata_at` — is **skipped without error**.
The operator sees two successful scripts and an audit row that never received the QRI-1 errata.

Guard truth table (evaluated, not assumed):

| current `$.gate` | QRI-1 step 1 fires? |
|---|---|
| `'passed'` (live value on all 7 pieces) | **yes** |
| `'blocked-grounding'` | no |
| absent / NULL | **yes** (COALESCE, fixed in QRI-1 rev 2) |

## Recommended sequence

1. `sql/QRI-1-corrections-2026-09-13.sql` — tags `quality_json`, reclassifies feedback provenance.
2. `sql/QRI-2-body-corrections-2026-09-13.sql` — corrects `body_md` (the reader-visible text) and
   supersedes the errata with the QRI-2/QRI-3 wording.

Either file alone is safe. Only the pair has an order, and this is it.

## What neither file does

Both correct **one row** (`companion_pieces.id = 8`) and one provenance column. **Neither prevents the
next piece from repeating the defect.** That needs a deploy of the five-module gate bundle
(VERSION 1.4.0) with `runGate()` wired at the insert site — which `qnfo-ops` cannot do (no deploy route,
and `ops_d1_query` is SELECT/WITH-only across every bound D1).

Also still open: the physics/science **category** filter (`standing-filters`, conf 0.98) has **no**
enforcement — `lib/filters.js` covers only the entity deny-list. Four physics/science book
recommendations (Hawking, Feynman, Penrose, Weinberg) all pass it. It needs a subject classifier at
`pickTopic()`, and whether the exclusion should constrain topic selection at all is an intent decision
reserved to the reader, not an implementation detail.
