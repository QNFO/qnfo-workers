# DEGENERATE-TEXT-1: a model loop never stays on a paper page

Owner, 2026-10-26: "errors like this can never make it past review/publish gates", after paper `qnf-d66c40b5`
(Passive Fault Tolerance via Bruhat-Tits Tree Codes) was public with 8,122 consecutive `Te` tokens, a 24,586-character
wall of repeated text ahead of its Abstract, a title cut from the raw idea, and a headline result its own section 4.8
contradicted. The chain of gates that passed it, with the event ids and timestamps, is in
`migrations/2026-10-26-degenerate-text-1.sql`.

## The detector

`qnfo-cloud-ops/degenerate-text.mjs` is the source. Its block between `DEGENERATE-TEXT-BEGIN` and `DEGENERATE-TEXT-END` is copied
byte for byte into `qnfo-cloud-ops/worker.js` (`degenerate-text.test.mjs` fails when they differ) and, since qnfo-research-exec 0.39.0
(`DEGENERATE-TEXT-PRODUCER-1`), into `qnfo-research-exec/worker.js` (`degenerate-wiring.test.mjs` holds the two equal).

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

## The producer (qnfo-research-exec 0.39.0)

`DEGENERATE-TEXT-PRODUCER-1`, `REVIEW-TRIAGE-CLAIM-1` and `VERIFY-AUTOCORRECT-PRECISION-1` (agent_issues 1000535, 1000536, 1000537; all `qnfo-research-exec/worker.js`) landed together:

* The DEGENERATE-TEXT block is embedded byte for byte before `releaseGateVerdict` (`degenerate-wiring.test.mjs` is the acceptance suite). `releaseGateVerdict` gives the sweep's verdict;
  `finalGates` raises a HARD `gate-degenerate` fix for a loop and for more than `DEGEN_PREHEADING_MAX` characters ahead of the first heading.
* `stageReconcile` reads every writer draft and the model output (and its retry) with the detector: a loop is stripped when it is at most `DEGEN_REJECT_SHARE` (10 percent) of the text and
  6,000 characters (draft) or 10,000 (output) remain; otherwise the draft is dropped, or the output is taken for empty so the best-leg path runs. Event `reconcile-degenerate`; when every
  draft is a loop the row re-runs from ground ("reconcile: every writer draft is a model loop").
* `publishStageV2` and `publishV2` refuse a degenerate body (`markError`, or `gate-blocked` with a `gov_gate_log` BLOCK row for DEGENERATE-TEXT-1); `ensurePaperRow` titles from
  `ideaTitle`, the idea's first sentence, never the idea cut at 140 characters; `RESIDUE_PATTERNS` gain `TOPIC COMPLEXITY ASSESSMENT` and `An exceptional synthesis of your work`.
* Review triage counts the reviewer's `claim` as the quote it is (`reviewQuotedSpans`, `reviewNorm`, `REVIEW_CLAIM_WINDOW`): a finding whose sentence is still in the paper blocks (up to
  `REVIEW_TRIAGE_CAP`, the rest over-cap) and is never demoted as drift; a sentence edited out of the paper is still drift. `review-converge.test.mjs` replays the 8 findings of cycle 391
  (6 block, 2 over-cap).
* `autoCorrectNumeric` writes the computed value at the stated value's significant digits and notation, and skips a correction that moves the result of a displayed derivation by more than
  one unit of its last digit (`1 - 0.528 = 0.472` is left for revise). The `verify-autocorrect` event records `stated_sig` and `computed_sig`. `autocorrect-precision.test.mjs`.

Closing probes read the markers `DEGENERATE-TEXT-BEGIN`, `REVIEW-TRIAGE-CLAIM-1` and `VERIFY-AUTOCORRECT-PRECISION-1` in that file.
