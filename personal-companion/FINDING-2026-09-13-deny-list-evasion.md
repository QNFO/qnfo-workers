# Finding — the standing-filter deny-list is evadable, and the 0.98 filter is unenforced

Date: 2026-09-13. Author: qnfo-ops. Method: executed the **committed** `lib/filters.js`
(sha `30b00cedd11503e7f2357be977412dc01d3530e8`) in an isolated compute sandbox. No repo file
was modified by the verification itself.

## 1. What holds

| claimed case set | measured |
|---|---|
| must-block (6): `QPL 2026`, spelled-out `Quantum Physics and Logic`, `CWI summer school`, `Gleick`, `Rovelli`, `Centrum Wiskunde & Informatica` | **6/6 BLOCK** |
| must-not-block (5): `QPLX`, `acwi`, *"the information is not recoverable"*, *"the order of time was strange"*, clean prose | **5/5 pass** |
| the three SQL replacement outputs + the step-2b sentence | **all clean — no false block** |

The 9/9 claim in the QRI-3 record is accurate.

## 2. False negatives in a BLOCKING check

The boundary is `(?<![A-Za-z0-9])TERM(?![A-Za-z0-9])`. The lookahead requires a
**non-alphanumeric** character after the term, so **any digit immediately following defeats it**.

| probe | v1 (committed) |
|---|---|
| `QPL2026` | **pass — evades** |
| `Qpl2026` | **pass — evades** |
| `Quantum Physics & Logic` | **pass — evades** |
| `Q.P.L.` | pass — evades |
| `Q P L` | pass — evades |
| `the C.W.I. summer school` | pass — evades |
| `QPL’s`, `cwi-2026`, `QPL_2026` | BLOCK ✓ |

**6 of 9 probes evade.** The live `body_md` reads `QPL 2026` (with a space) and is caught — but
`QPL2026`, the concatenated form a model is at least as likely to emit, sails through. The module
*does* list the spelled-out expansion, so that variant was anticipated; the `&` substitution was not.

This is the mirror of the false-block failures the module's own header documents. A deny-list whose
purpose is to stop a specific named topic should not be defeated by removing a space.

## 3. Verified patch (v2) — normalise, then match

```js
const norm = s => String(s || '')
  .toLowerCase()
  .replace(/&/g, ' and ')          // conjunction substitution
  .replace(/[^a-z0-9]+/g, ' ')     // separators/whitespace -> single space
  .trim();
// match: new RegExp('(?<![a-z])' + fesc(norm(term)) + '(?![a-z])').test(norm(text))
```

`[a-z]`-only boundaries let digits sit adjacent (`QPL2026` matches) while letters still protect
against substring hits (`QPLX`, `acwi` still pass).

| set | v1 | v2 |
|---|---|---|
| must-block | 6/6 | **6/6** |
| must-not-block | 5/5 | **5/5** |
| corrected text clean | yes | **yes** |
| evasion probes blocked | 3/9 | **6/9** |

Closed by v2: `QPL2026`, `Qpl2026`, `Quantum Physics & Logic`. **No regressions.**

## 4. Residual limit — stated, not patched

Still evading under v2: `Q.P.L.`, `Q P L`, `the C.W.I. summer school`. Closing these needs a
letter-collapse step (join runs of single letters), which would also collapse ordinary prose
abbreviations — the same false-positive risk class the module deliberately avoided when it excluded
*"The Information"* and *"The Order of Time"*. Not implemented; recorded as a known limit.

## 5. The strongest filter has no enforcement

`PERSONAL.profile` `standing-filters`, conf **0.98**: *"No physics/science books in reading
recommendations."* Measured under both v1 and v2:

| recommendation | result |
|---|---|
| *"Hawking's A Brief History of Time rewards a second reading."* | PASS |
| *"I keep returning to Feynman's Lectures on Physics."* | PASS |
| *"Penrose's The Road to Reality is worth the effort."* | PASS |
| *"Weinberg's The First Three Minutes still holds up."* | PASS |

**4/4 evade.** Only `Gleick` and `Rovelli` are covered, by author name. The reader's
**highest-confidence** exclusion is the one with **no** enforcement. This needs a subject classifier
at `pickTopic()` — before anchors are fetched — which no session has written.

## 6. Why this file is a document and not a patch

A job carrying the companion task (`job-55c34efb82e9c6`) was live on these paths at the time of
writing, and `lib/filters.js` still carried its original sha. A write from here would have risked a
409 on that job's in-flight work — the sha-plumbing hazard recorded three times on this repo. Apply
v2 to `lib/filters.js` **after** that job reaches a terminal state, and add the nine probes above to
`filters.test.js` so the boundary cannot regress.
