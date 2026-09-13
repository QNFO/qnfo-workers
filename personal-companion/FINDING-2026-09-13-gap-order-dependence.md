# FINDING — `deriveTemporalFacts` gap set is row-order dependent (2026-09-13)

Author: qnfo-ops. Method: `lib/grounding.js` (sha `5e9087bb18818345220d52999b366f668190deec`),
`lib/grounding.test.js` (sha `51a81f9703ed1fb29e5bf6f7e282a018c5786077`) and
`worker.js` (sha `c06edffb22f3cefeed2d7568e1a7275f076320cc`) read with `github_repo_read` and
**executed** in the compute sandbox against the live `PERSONAL.activity` rows. Nothing below is
asserted without an execution behind it.

---

## 0. RESOLVED: the defect fires in production

`loadLife()` was read verbatim this session (it sits **within** the readable 32,768-byte window —
the earlier assumption that it lay past the ceiling was untested and is wrong):

```js
async function loadLife(env) {
  var lines = [];
  var acts = await env.PERSONAL.prepare(
    "SELECT date, title, category, venue, city, notes, energy_label FROM activity ORDER BY date DESC LIMIT 12"
  ).all();
  lines.push("RECENTLY ATTENDED");
  var ar = acts.results || [];
  ...
  var evs = await env.PERSONAL.prepare(          // <- the patcher's anchor #2
    "SELECT start_date, title, venue, city, category FROM events WHERE start_date >= '2026-01-01' ORDER BY start_date DESC LIMIT 10"
  ).all();
```

The activity query is **`ORDER BY date DESC`** — newest-first, the exact order that empties the gap
set. So the order-dependence is not latent. It is live.

Consequence after the remediation is applied: the briefing receives a `DERIVED RELATIONS` block
listing the three events and **zero gaps**, closing with the authoritative line *"If a quantity is
not listed above, it is not known. Do not compute it, and do not compare two events on a quantity
that is absent."* The 7-day gap — the patcher's stated headline fix — is never supplied, and
`checkGrounding()` blocks every interval claim including correct ones.

**Second consequence, actionable:** the ERRATA's own replacement sentence, *"The two events were
seven days apart"*, would be **blocked by the remediated gate**. `gate.js` exposes
`auditPublishedPiece()` for the QRI-1 correction pass, so correcting id=8 to the ERRATA text and
re-auditing it would **withdraw the corrected piece**. Two of the fleet's own artifacts
(`ERRATA-2026-09-13.md` and `lib/grounding.js`) contradict each other, and this is the measurement.

---

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

The loop pairs `i < j` and then discards the pair whenever `a` is the **later** row. Correct only if
the input happens to be oldest-first. Feed it newest-first and **every pair is discarded, so `gaps`
is empty** — silently, with no error.

Measured, same three live rows, only the order changed:

| input order | `gaps` start-to-start values |
|---|---|
| `ORDER BY date DESC` (newest first) — **what `loadLife()` uses** | **`[]`** |
| D1 natural rowid order (no `ORDER BY`) | `[7, 18, 11]` |
| `ORDER BY date ASC` (oldest first) | `[7, 18, 11]` |

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

The live defect is caught either way; the false block is what the order introduces. This is the same
failure class `grounding.js` rev 2, rev 3, `voice.js` rev 2 and `filters.js` rev 2 each record in
their own headers: *a false block is as damaging as a false pass.*

## 3. The module's own test suite cannot catch it

`grounding.test.js`'s fixture is oldest-first (08-10, 08-17, 08-28), so it asserts
`facts.gaps[0].startGap === 7` and *"corrected text passes"* against an input order that
`loadLife()` does not produce. The suite passes; the property it protects is untested. Its
"corrected text passes" control **fails** under descending input — verified.

## 4. The verified fix — one line

```js
const dated = evs.filter(e => e.start && /^\d{4}-\d{2}-\d{2}$/.test(e.start));
dated.sort((x, y) => dayNum(x.start) - dayNum(y.start));   // <-- ADD THIS
```

Executed with the fix in place:

- **full `grounding.test.js` assertion set: 33 passed, 0 failed.**
- descending input: `gaps` = `[7, 18, 11]`; `ERRATA` replacement → 0 violations; live lede → 2 violations.
- ascending == descending once fixed: `true`.

Order-independent, so correct whatever `loadLife()`'s `ORDER BY` is; cannot regress any existing
assertion. Given §0, this is now the *required* fix, not a defensive one.

## 5. NOT APPLIED, and why

`grounding.js` was **not** modified by this session:

1. This endpoint cannot execute `node grounding.test.js` — no filesystem, no process runner. The
   33/0 result comes from a **transcription** into the compute sandbox; a transcription error would
   be invisible, though the bodies were copied verbatim from `github_repo_read` output.
2. A concurrent writer has already moved `main` mid-session once and a `voice.js` write was rejected
   on that path (`ADDENDUM-2026-09-13-gate-wiring.md` §2). An uncoordinated behaviour change to a
   live safety detector is the failure mode that addendum documents.

**Recommendation:** apply the sort line, add a descending fixture to `grounding.test.js`, and only
then apply the ERRATA text to id=8.

## 6. Correction to this session's own earlier claim

An earlier draft of this finding stated that the patcher's anchor #2 might inject
`deriveTemporalFacts(ar)` **before** `ar` is bound, and that `deriveTemporalFacts(undefined)` would
silently return an empty block. **That is wrong, and is withdrawn.** `loadLife()` assigns
`var ar = acts.results || []` from the *activity* query, which precedes the `evs` query the patcher
anchors on. The injection point is correct and receives the real rows. The silent-empty behaviour of
`deriveTemporalFacts(undefined)` is real and was verified, but it is not what happens here.
`injectFacts` also exists in `grounding.js`; that part was never in doubt.

## 7. New: `P_STYLE` forbids naming the reader explicitly

Read verbatim this session:

```
"You are writing for one reader: Rowan.",
"Never reproduce any heading, label, bullet, or phrasing from the briefing, or from these
 instructions, inside the piece. The briefing is addressed to you, not to the reader.",
...
"- self-reference as a model or assistant; no greeting, no sign-off, no signature, no footer",
"- meta-commentary about writing, essays, readers, publishing, or disclosure",
```

So naming Rowan in the piece was not merely unguarded — it violates an explicit instruction that the
briefing is addressed to the writer, not the reader. The gap was in enforcement, not in intent:
`nameCandidates()` requires a two-word capitalised bigram (`if (sp !== 1 || !isCap(s, j)) continue;`),
so a one-token name was never a candidate. Confirmed verbatim in `worker.js`.

Also confirmed: `loadLife()`'s activity SELECT lists `energy_label` but **not** `energy`, so
`deriveTemporalFacts` always receives `r.energy === undefined` and yields `energy: null` — the
derived block can only ever show the label, never the number. Handled, not a crash, but the numeric
energy the ERRATA cites (`energy 5`, `energy 1`) cannot reach the briefing through this path.

## 8. Harness error in my own measurement, recorded

In the rowid-order run my acceptance check compared gap strings against `'7'`/`'7/3'` while the
harness (which set each event's `end` equal to its `start`) emitted `'7/7'`. The printed
`"seven days apart" accepted ...: false` lines are therefore **wrong**; the numeric arrays — which do
contain startGap 7 — are the real evidence. Recorded because a check that silently misses is the
failure mode this whole finding is about.
