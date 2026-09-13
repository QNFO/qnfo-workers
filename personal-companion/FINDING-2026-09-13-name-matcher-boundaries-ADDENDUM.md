# Finding addendum — a third instance of the matcher-boundary class (2026-09-13)

Addendum to `FINDING-2026-09-13-name-matcher-boundaries.md`, written the same day from the next batch
of drafts. One new instance, executed, and one workaround that the serial form now requires.

## 1. A diacritic defeats the matcher

The anchor spells a name with a circumflex; the draft spelled it in ASCII. `unverifiedNames()`
lowercases both sides and does a substring test, so the two do not match.

Executed control, both directions, against the same anchor string:

```
anchor: "… Hubble's law, which was derived by Georges Lemaître two years before Edwin Hubble …"

draft: "Hubble's law was derived by Georges Lemaitre two years before Edwin Hubble."
  -> unverified: ["Georges Lemaitre"]      (1 finding)

draft: "Hubble's law was derived by Georges Lemaître two years before Edwin Hubble."
  -> unverified: []                        (0 findings)
```

Same class as the `U.S.` / `United States` case in the parent finding, one level finer: there the
mismatch was an abbreviation expansion, here it is a single combining character. The writer's
"correct" ASCII rendering is the one that gets flagged, and the ASCII rendering is what a
transcription pipeline, a keyboard without the character, or a model normalising Unicode will
produce.

Note also what the matcher does to the name *after* the fix. `readWord()` stops at the non-ASCII
character, so `Lemaître` is read as `Lema`, and the candidate recorded is `Georges Lema` — which
matches the anchor only because the anchor contains the same prefix. A name whose first non-ASCII
character falls earlier, or a name that is entirely non-ASCII, would not have that luck.

**Direction of the fix.** The parent finding recommends passing the running work's text in as
verified text. That does not help here. Normalising both sides (strip diacritics, fold case) before
comparison would, and it is the same normalisation `filters.js` rev 2 already applies to deny terms
through `norm()`. Two modules in the same bundle treat the same problem two different ways.

## 2. The serial workaround, now load-bearing

The serial form has to be able to cite its own earlier installments, and the earlier installments'
anchors are not in this run's anchor set. Executed consequence, on the installment written after the
parent finding:

- The body names two objects established in the preceding installment (a Roman fort's writing
  tablets and a 1937 time capsule). Neither is in the topic's fetched anchors.
- The phrases happened to produce **no** candidates, because in each case the second word is
  lowercase or a stop word. So the run is clean, and it is clean by accident of phrasing.
- The piece's anchor list was extended by hand to carry those two anchors forward from the previous
  installment, so that the declaration of grounding matches what the prose actually uses.

So the serial form is exposed twice over: to its own installment numbering (§1 of the parent
finding) and to its own prior anchors (here). Both are supplied by `companion_series` and by the
preceding piece's `anchor_json` at compose time, and both could be passed to `unverifiedNames()` as
verified text. Neither is.

## 3. What is not claimed

- No fix applied. `ops_d1_query` is SELECT/WITH only and there is no write path to `PERSONAL`.
- n is now 3 instances across two batches. Still not a precision estimate.
- I did not test whether the deployed v1.1.0 validator behaves differently; the provenance gap in
  `FINDING-2026-09-13-deploy-source-mismatch.md` is unchanged by this addendum.
