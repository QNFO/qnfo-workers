# FINDING — `deriveTemporalFacts` gap set is row-order dependent (2026-09-13)

Author: qnfo-ops. Method: `lib/grounding.js` (sha `5e9087bb18818345220d52999b366f668190deec`) and
`lib/grounding.test.js` (sha `51a81f9703ed1fb29e5bf6f7e282a018c5786077`) transcribed verbatim from
`github_repo_read` and **executed** in the compute sandbox against the live `PERSONAL.activity` rows.
Nothing below is asserted without an execution behind it.

## 1. The defect

`deriveTemporalFacts()` builds its gap set with a pairwise loop guarded by a one-directional test:

```js
for (let i = 0; i < dated.length; i++) {
  for (let j = i + 1; j < dated.length; j++) {
    const a = dated[i], b = dated[j];
    if (dayNum(a.start) > dayNum(b.start)) continue;   // <-- drops every pair
    gaps.push({ ... startGap: dayNum(b.start) - dayNum(a.start) ... });
  }
}
```

The loop pairs `i < j` and then discards the pair whenever `a` is the **later** row. That is correct
only if the input happens to be oldest-first. Feed it newest-first and **every pair is discarded, so
`gaps` is empty** — silently, with no error.

Measured, same three live rows, only the order changed:

| input order | `gaps` start-to-start values |
|---|---|
| `ORDER BY date DESC` (newest first) | **`[]`** |
| D1 natural rowid order (no `ORDER BY`) | `[7, 18, 11]` |
| `ORDER BY date ASC` (oldest first) | `[7, 18, 11]` |

`PERSONAL.activity` natural order was measured read-only: `rowid 1 = 2026-08-28`, `rowid 2 =
2026-08-10`, `rowid 3 = 2026-08-17`. So the gap set has two possible values here, not one.

## 2. Why this is not cosmetic

`checkGrounding()` flags an interval claim whenever the number is absent from the gap set:

```js
if (c.kind === 'interval' && gaps.indexOf(c.n) < 0) v.push({ ... });
```

With `gaps === []` that test degenerates to **"block every interval claim"**. Executed:

| text | descending (`gaps: []`) | ascending (`gaps: [7,18,11]`) |
|---|---|---|
| live lede, `"Five days later"` | 2 violations (correct block) | 2 violations (correct block) |
| `ERRATA` replacement, `"seven days apart"` | **1 violation — BLOCKED** | 0 violations — passes |

So the live defect is caught either way, but under descending input the gate **false-blocks the
correct prose that the ERRATA proposes to replace it with** — including via `auditPublishedPiece()`,
which `gate.js` exposes specifically for the QRI-1 correction pass. Applying the ERRATA text and
then re-auditing it would withdraw the corrected piece.

This is the same failure class `grounding.js` rev 2, rev 3, `voice.js` rev 2 and `filters.js` rev 2
each record in their own headers: *a false block is as damaging as a false pass.*

## 3. The module's own test suite cannot catch it

`grounding.test.js`'s fixture is oldest-first:

```js
const ROWS = [
  { date: '2026-08-10', ... },   // LoF26
  { date: '2026-08-17', ... },   // QPL
  { date: '2026-08-28', ... }    // CWI
];
```

It therefore asserts `facts.gaps[0].startGap === 7` and *"corrected text passes"* against an input
order that never occurs in a newest-first caller. The suite passes, and the property it is meant to
protect is untested. Its "corrected text passes" control **fails** under descending input — verified.

## 4. The verified fix — one line

```js
const dated = evs.filter(e => e.start && /^\d{4}-\d{2}-\d{2}$/.test(e.start));
dated.sort((x, y) => dayNum(x.start) - dayNum(y.start));   // <-- ADD THIS
```

Executed with the fix in place:

- **full `grounding.test.js` assertion set: 33 passed, 0 failed.**
- descending input: `gaps` = `[7, 18, 11]`; `ERRATA` replacement → 0 violations; live lede → 2 violations.
- ascending == descending once fixed: `true`.

The fix is order-independent, so it is correct whatever `loadLife()`'s `ORDER BY` turns out to be.
It cannot regress any existing assertion.

## 5. NOT APPLIED, and why

`grounding.js` was **not** modified by this session. Three reasons, stated so the decision is
reviewable rather than silent:

1. This endpoint cannot execute `node grounding.test.js` — it has no filesystem or process runner.
   The 33/0 result above comes from a **transcription** into the compute sandbox. A transcription
   error would be invisible, and the bodies were copied verbatim from `github_repo_read` output.
2. `loadLife()`'s `ORDER BY` is **unverified**: that region is past the 32,768-byte read ceiling.
   The alternative fix — correcting the query — cannot be evaluated from here, and the sort fix
   should not be shipped as a substitute for finding out.
3. A concurrent writer has already moved `main` mid-session once (recorded in
   `ADDENDUM-2026-09-13-gate-wiring.md` §2, and a `voice.js` write was rejected on that path). An
   uncoordinated behaviour change to a live safety detector is the failure mode that addendum
   documents.

**Recommendation:** apply the sort line, add a descending fixture to `grounding.test.js`, and
resolve `loadLife()`'s `ORDER BY` separately.

## 6. Related: the patcher's anchor #2 can no-op silently

`apply-remediation.mjs` injects, immediately **before** the query that binds the rows:

```js
var _facts = deriveTemporalFacts(ar);
```

If `ar` is not yet bound at that line, `deriveTemporalFacts(undefined)` does **not** throw —
`(rows || [])` yields `[]` — so the try/catch never fires and the briefing receives:

```
DERIVED RELATIONS (computed from the record; state these exactly, do not recompute)
If a quantity is not listed above, it is not known. Do not compute it, and do not compare
two events on a quantity that is absent (cost, distance, effort).
```

Zero events, zero gaps, and an instruction that reads as authoritative. Verified executed:
`deriveTemporalFacts(undefined)` and `deriveTemporalFacts([])` produce byte-identical output, no
exception. So the patcher's headline claim — *"the model is TOLD that LoF26 -> QPL is 7 days"* — is
**unverified and fails silently** if the anchor's position is wrong. Whether it is wrong depends on
where `var ar` is assigned in `loadLife()`, which is past the read ceiling. `injectFacts` itself does
exist in `grounding.js`; that part of the patcher is sound.
