# Finding — two matcher-boundary defects found while drafting three pieces (2026-09-13)

Written by qnfo-ops from `run_code` execution of the committed gate patterns against three drafts
written the same day. Neither defect is new code; both are boundary behaviour of `unverifiedNames()`
as committed, and both were found by writing prose and running the check rather than by reading it.

## 1. The serial form is structurally exposed to `unverifiedNames()`

`P_SERIAL` (worker.js, v1.0.0) requires the installment to continue a running work and forbids
recapping beyond one sentence of orientation. Naming the installment it follows is the natural way
to do that. `nameCandidates()` reads any two consecutive capitalised words of length >= 3, neither in
`STOPW`, as a candidate proper name, so `Installment Five` is a candidate, and it cannot appear in
fetched anchor text.

Measured, executed: a draft serial's body produced 11 candidates, of which
`unverifiedNames()` reported `["Installment Five", "Indian Ocean"]` against the piece's own anchor
text. `Indian Ocean` was a genuine grounding error in my draft and was fixed. `Installment Five` is
an artefact of the form.

This is the same class as
`FINDING-2026-09-13-publish-stall-ADDENDUM-2-headings-and-source-mismatch.md`, and it does not admit
that finding's fix. Sentence-case headings dodge the notes-form exposure because a heading is
stylistic; the series reference is not. Lowercasing it (`The fifth installment`) is the only fix
available inside the writer, and it makes the prose worse for no reader-visible reason.

**Mechanism fix, not implemented here.** The caller already holds the running work at compose time —
`loadContinuity()` reads `companion_series.title`, `.thesis` and `.chapters` for the serial form.
Those strings can be passed to `unverifiedNames()` as verified text in exactly the way anchor text
is. That removes the exposure without weakening the check.

## 2. A faithful paraphrase of an anchor name over-blocks

An essay draft read `the United States National Bureau of Standards`. The anchor says
`the U.S. National Bureau of Standards`. `unverifiedNames()` reported `["United States",
"States National"]` — two invented-name flags on a claim that is exactly correct.

Executed, both directions:

```
anchor text: "... on sabbatical at the U.S. National Bureau of Standards in Washington, D.C. ..."
draft A: "the United States National Bureau of Standards"  -> unverified: United States, States National
draft B: "the U.S. National Bureau of Standards"           -> unverified: []
```

This is the mirror of `FINDING-2026-09-13-deny-list-evasion.md`. There, a deny-list was defeated by
deleting a space (`QPL2026` passed rev 1). Here, an anchor matcher is defeated by expanding an
abbreviation. Both are substring tests standing in for name tests, and both fail at the boundary —
one by letting a match through, one by refusing a match that is correct.

The asymmetry is worth recording because the failure modes are not symmetric in cost. Evasion
publishes something that should have been blocked. Over-blocking discards correct prose, and it
discards it silently: the writer has no signal that its paraphrase was the problem, only that the
run failed the gate.

## 3. A third instance, from the same batch

The same draft-check found a genuine grounding error — an `Indian Ocean` particular that no anchor
supported. It was caught by the check that produced the three artefacts above.

So the honest tally for this batch is: 4 strings flagged, 1 real error, 3 artefacts. The check's
precision on this sample is poor and it still paid for itself. That is the argument for running it on
drafts rather than only at publish time, and the argument against reading its verdicts as findings
without inspecting each span.

## 4. What is not claimed

- No fix is applied. This file records behaviour and one mechanism recommendation.
- The rates above are n=1 batch, three pieces. They are not a precision estimate for the check.
- I did not test whether the deployed v1.1.0 validator behaves differently. The repo copy is v1.0.0
  and is byte-identical to `deployed-current.worker.js` (blob `c06edffb…`), which is the provenance
  gap already recorded in `FINDING-2026-09-13-deploy-source-mismatch.md`; this finding does not
  narrow it.
- `ops_d1_query` is SELECT/WITH only and no write path to `PERSONAL` is exposed on this endpoint, so
  nothing here was applied to a live row.
