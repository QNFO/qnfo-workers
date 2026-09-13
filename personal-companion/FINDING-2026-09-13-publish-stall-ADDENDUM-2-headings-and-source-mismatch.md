# ADDENDUM 2 — the rejected strings are the item headings, and the repo's validator does not reproduce the publish decisions

Author: qnfo-ops, 2026-09-13. Addendum to
`personal-companion/FINDING-2026-09-13-publish-stall-thin-anchors.md` (§2.2) and to
`FINDING-2026-09-13-publish-stall-ADDENDUM-draft-persistence.md`.

Everything below was produced by transcribing `nameCandidates()` verbatim from
`personal-companion/worker.js` (sha `c06edffb22f3cefeed2d7568e1a7275f076320cc`) and executing it in the
compute sandbox over heading strings and bodies read out of `PERSONAL` D1 this session. No repo file was
modified; no validator was weakened.

## 1. The six rejected strings are the item headings, not prose inventions

Executed over the headings of the rejected run (`companion_runs.id=442`, as far as the 120-char run
detail preserved them):

| input | `nameCandidates` output |
|---|---|
| `# Field Notes for Rowan` | `Field Notes` |
| `## Notation Systems as Cognitive Scaffolds` | `Notation Systems`, `Cognitive Scaffolds` |

Those are the first three strings the validator named, in the order it named them. The rule is two
consecutive capitalised words of length >= 3, neither in `STOPW`; a Title Case heading satisfies it
whenever neither word is a stopword. And `P_NOTES` instructs the writer: *"Give every item a short
title."* The notes form therefore asks for exactly the construction that trips the name validator. The
exposure is structural, not incidental.

## 2. Control: two published pieces contain candidate-producing headings

Same rule, applied to headings of rows that are live on `reading.q08.org`:

| row | heading | candidates |
|---|---|---|
| `id=12` notes, published 04:01:23Z (5 anchors) | `## The Meridian That Runs Through Nothing` | `Runs Through`, `Through Nothing` |
| `id=11` serial Installment Three, published 2026-09-12 | `## Installment Three: The Repeatable Walk` | `Repeatable Walk` |
| `id=10` serial Installment Two, published 2026-09-12 | `## Installment 2: The Cabinet and the Grid` | none (`Installment 2` breaks the pair; `The Cabinet` is stopword-led) |

On the full body of `id=12`, the rule returns eight candidates: `Akkadian Empire`, `Runs Through`,
`Through Nothing`, `Australian Antarctic`, `Antarctic Territory`, `United Kingdom`, `Antarctic
Division`, `Alfred Korzybski`.

## 3. What follows

**(a) The parent finding's direction is supported, but an anchor floor alone will not close the class.**
The 06:01Z cycle ran 2 anchors (both concepts) and produced six flagged strings; the 04:01Z cycle ran 5
and produced two, from a single heading. Thin anchors do increase the rate. But `id=12` had the richer
set and still produced candidates, because the notes form's title convention manufactures them
independently of anchor quality. §3.1-3.2 of the parent finding (anchor count and kind floor, rotate on
a thin set) remain correct and are not sufficient on their own.

**(b) The repo's rule does not reproduce the observed publish decisions.** `id=11` and `id=12` both
carry headings whose word pairs are candidates, and both are live. Under the repo's rule they should
have been rejected unless those phrases appeared in the fetched anchor text. `anchor_json` stores topic,
seam and bridge — not the fetched Wikipedia summaries — so the anchor text is not recoverable after the
fact, and neither explanation can be eliminated from this endpoint:

1. the deployed v1.1.0 validator differs from the repo's v1.0.0, which is what
   `FINDING-2026-09-13-deploy-source-mismatch.md` predicts; or
2. the fetched anchor text for those runs contained `runs through` / `repeatable walk`, in which case
   the validator passed them correctly.

This is an independent behavioural test of the provenance gap: it needs no access to the unreadable half
of `worker.js`. It does not prove explanation 1. The test that would: run `unverifiedNames` with the real
anchor array for a published run, or read the deployed validator.

## 4. Proposal (design note, not a patch — this endpoint has no deploy route)

Keep the validator's blocking power. Scope it, rather than loosening it:

- **Exclude headings from the name check.** Reader names in headings are already covered by
  `addressee.js` (`reader-in-heading`), which is the detector that actually caught the `# Field Notes
  for Rowan` case; `unverifiedNames`' remaining job is invented external particulars in prose. So
  excluding headings does **not** re-open the `id=8` class. It does drop one real signal — abstract
  vocabulary is also how thin anchors show up — so if the anchor floor in the parent finding is adopted,
  the signal is redundant; if it is not, this trade is worse than the disease.
- **Or require one concrete anchor per notes item.** `P_NOTES` already says each item is one concrete
  thing; the titles drift abstract because the anchors were abstract, which is the parent finding's root
  cause seen from the other end.

## 5. What I did not do

- Did not modify `worker.js`, `lib/voice.js` or any module. The parent finding's *"do not weaken
  `unverifiedNames()`"* stands and is not contradicted by anything here.
- Did not file into `agent_issues`: this endpoint has no insert tool (same gap recorded in
  `ADDENDUM-2026-09-13-gate-wiring.md` §6.6).
- Did not read the deployed validator: it is not in the repo, and `worker.js` is unreadable past 32,768
  chars from here.

## 6. Adversarial note on this addendum

The weakest joint is §1's completeness. The run detail preserves only 120 characters, so I reproduced
three of the six flagged strings from the headings and could not reproduce `Interdependent Computation`,
`Playful Convergence`, `Double Fugue`, `Live Counterpoint` — the bodies are discarded on rejection,
which the draft-persistence addendum proves. Those four are consistent in shape (two-word Title Case
noun phrases) but they are not demonstrated. The finding I would defend is the narrow, executed one: the
name validator's rule fires on Title Case item titles, `P_NOTES` requires those titles, and the rule as
committed does not reproduce the publish decisions taken on `id=11` and `id=12`.
