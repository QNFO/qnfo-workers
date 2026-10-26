# DEGENERATE-TEXT-1: a model loop never stays on a paper page

Owner, 2026-10-26: "errors like this can never make it past review/publish gates", after paper `qnf-d66c40b5`
(Passive Fault Tolerance via Bruhat-Tits Tree Codes) was public with 8,122 consecutive `Te` tokens, a 24,586-character
wall of repeated text ahead of its Abstract, a title cut from the raw idea, and a headline result its own section 4.8
contradicted. The chain of gates that passed it, with the event ids and timestamps, is in
`migrations/2026-10-26-degenerate-text-1.sql`.

## The detector

`qnfo-cloud-ops/degenerate-text.mjs` is the source. Its block between `DEGENERATE-TEXT-BEGIN` and `DEGENERATE-TEXT-END` is copied
byte for byte into `qnfo-cloud-ops/worker.js` (`degenerate-text.test.mjs` fails when they differ) and, by the code task
`DEGENERATE-TEXT-PRODUCER-1`, into `qnfo-research-exec/worker.js` (`degenerate-wiring.test.mjs` reads PENDING until it is there).

It reads markdown with fenced code, display and inline math and table rows blanked, split on whitespace. A region is degenerate when

| shape | threshold |
|---|---|
| one alphabetic token repeated back to back | 16 or more |
| a unit of 2 to 12 tokens repeated back to back | 6 or more repeats and 36 or more tokens |
| a window of 160 alphabetic tokens holding few distinct tokens (the near-periodic loop) | 14 distinct or fewer |

A paper is withdrawal-class when one region covers 200 tokens or the regions together cover 5 percent of its tokens; anything
shorter is `quality:repetition` (revise, never a withdrawal). Calibration on 2026-10-26 over every living-paper body (950 papers,
about 70 million characters, all statuses): one paper flagged, this one; no false positive. Cost: 2 to 9 ms for a typical paper.

## What acts on it

* qnfo-cloud-ops 1.41.0 (`pub-gate-v5-degenerate`): the hourly sweep and a fresh lane on every tick (papers published or changed
  in the last 90 minutes, or never gated). A non-owner paper that scans withdrawal-class is quarantined singly (status
  `quarantined`, ledger row with `change_actor` and `change_reason`, one `publication_gate_audit` row), at most 10 a run; the rest
  stay published as revise and the run reports degraded. An owner paper (`qnfo-2025-*`) is never withdrawn. The restore step keeps a
  paper quarantined while its body still scans degenerate.
* `ops_config degenerate_text_withdraw = off` turns the withdrawal into a revise without a deploy (the PUB-GATE-NO-WITHDRAW-1
  posture). Registered in `control_registry` as `degenerate-text-withdraw`.
* Failure-mode detector `fm-degenerate-text-published`: a published non-owner paper whose `release_gate_reason` names
  `quality:degenerate-text`.

## What still has to land in the producer

`DEGENERATE-TEXT-PRODUCER-1`, `REVIEW-TRIAGE-CLAIM-1`, `VERIFY-AUTOCORRECT-PRECISION-1` (all `qnfo-research-exec/worker.js`): reconcile
strips or rejects a looping draft or output instead of keeping anything over 10,000 characters; `finalGates` and `releaseGateVerdict`
read repetition and text ahead of the first heading; publish refuses a degenerate body; the fallback title comes from `ideaTitle`,
not the idea cut at 140 characters; review triage counts the reviewer's `claim` as the quote it is (eight true findings were
demoted as drift); the verify autocorrection keeps the precision of the derivation it corrects. Closing probes read the markers
`DEGENERATE-TEXT-BEGIN`, `REVIEW-TRIAGE-CLAIM-1` and `VERIFY-AUTOCORRECT-PRECISION-1` in that file.

## Re-measuring

The calibration ran in the Cloudflare API sandbox against `living-paper` (paged `SELECT ... body_md`, the detector inline). To re-run it
after a threshold change, page `papers` by rowid four at a time and report `found`, `withdraw`, `longest` and `share` per paper; the
detector module is pure and has no imports.
