# Addendum — gate wiring, and a correction to §4.1 (2026-09-13)

**This supersedes §4.1 of `PATCH-2026-09-13-REMEDIATION.md`.** Everything else in that patch
stands.

Two qnfo-ops sessions worked this repository on 2026-09-13 and did not see each other's writes.
This file reconciles them: what each landed, where they disagree, and which advice was wrong.

## 1. Correction: do NOT invert `authorized()` before setting the key

`PATCH-2026-09-13-REMEDIATION.md` §4.1 says to replace `authorized()` with the fail-closed
version from `lib/authz.js`, describing the change as *"`if (!key) return true;` →
`return false;`"* and nothing more. **Applied on its own, that would take the reading page down.**
`COMPANION_KEY` is unset on the live deployment, so a fail-closed default would 401 `/`,
`/p/<slug>`, `/api/pieces` and `/api/runs` on the next deploy.

`REMEDIATION-2026-09-13.md` §5 already reaches this conclusion and is right:

> *"`COMPANION_KEY` is unset on the live deployment, so `--fail-closed` would black out
> reading.q08.org on the next deploy. The default instead corrects the false label. A security
> fix that silently takes a live page down is not a fix."*

Correct sequencing:

1. Set `COMPANION_KEY` on the deployment.
2. Then ship the fail-closed default — `lib/authz.js` is the right implementation of this step.
3. In the meantime, stop the masthead claiming "Private." while the page is public. A false
   privacy claim is the actual defect; the fail-open default is only how it became false.

`lib/authz.js` and `lib/authz.test.js` remain valid as step 2. They are not step 1, and the
patch text implied they were.

## 2. What each session landed (all additive, all on `main`)

| artifact | session | commit |
|---|---|---|
| `lib/grounding.js`, `lib/voice.js` + tests, `GROUNDING-PATCH`, `VOICE-ADDENDUM` | 09-12 | see `ACTION-grounding-fix.md` |
| `lib/gate.js` (rev 1), `lib/gate.test.js` (rev 1) | parallel, 09-13 | `b9f9ffac`, `99661bd4` |
| `sql/QRI-1-corrections-2026-09-13.sql` | parallel, 09-13 | `2d8638d1` |
| `apply-remediation.mjs` | parallel, 09-13 | `a9706dbd` |
| `REMEDIATION-2026-09-13.md` | parallel, 09-13 | — |
| `lib/authz.js`, `lib/authz.test.js` | this session | `eb973646`, `2566fc10` |
| `lib/addressee.js` (rev 2), `lib/addressee.test.js` (rev 3) | this session | `7606d973`, `3926869e` |
| `PATCH-2026-09-13-REMEDIATION.md`, `ERRATA-2026-09-13.md` | this session | `cb9fa53b`, `7c76c153` |
| `lib/gate.js` (rev 2), `lib/gate.test.js` (rev 2) | this session | `930b32df`, `266d875f` |
| this file | this session | — |

No conflicts: the two sessions touched disjoint files, except `gate.js`/`gate.test.js`, which
this session extended without removing anything.

## 3. The gate now closes a hole it did not close before

`gate.js` revision 1 composed `grounding` + `voice`. Measured by executing the committed
`voice.js` against the real rejection text of `companion_runs` id=442:

| input | `voice.js` violations |
|---|---|
| `"# Field Notes for Rowan\n\n## Notation Systems…"` with a **straight** apostrophe | 1 — `reader-as-subject` on `Rowan's` |
| the same text with a **typographic** apostrophe (`Rowan’s`) | **0** |

So revision 1 blocked that run for the possessive, not for the heading, and a writer that heads a
piece `# Field Notes for Rowan` without a straight-apostrophe possessive passed with **zero**
voice violations. `addressee.js` returns 2 blocking violations on the same text
(`reader-in-heading`, `reader-address`).

Revision 2 merges only the **blocking** subset of addressee findings. A bare mention stays a
warning, because the serial *"The Hand That Signs"* legitimately names the reader in order to
exclude him (*"Rowan's own handwriting is not the subject here."*). Merging warnings would block
that piece — a false block, which is as damaging as a false pass.

Measured effect on the existing contract: the live fixture yields 0 blocking addressee violations
and 1 warning, so `violations` remains 7 and every `gate.test.js` revision 1 assertion still
holds. `gate.test.js` is now 24 assertions.

## 4. Correction to my own earlier claim

I wrote that `voice.js` returns `null` on the heading. That is right about the heading but wrong
about the run: on the **actual** run-442 text it returns 1 violation, via the possessive. The hole
appears only when the apostrophe is typographic. Narrower than I first stated, and measured — the
table in §3 is the corrected version.

## 5. Overlap between this session's errata and the QRI-1 SQL

`sql/QRI-1-corrections-2026-09-13.sql` and `ERRATA-2026-09-13.md` overlap but neither is complete
alone:

- The **SQL** is executable: it tags `id=8` with `gate='blocked-grounding'` + `gate_reason` +
  `errata`, adds `companion_feedback.source`, and splits the provenance (42 probe / 3 human). It
  does **not** supply replacement prose.
- The **errata** supplies the replacement sentences for the two defective paragraphs and the
  localisation evidence that only `id=8` is affected. It is not executable from here.

Apply both. Do not apply the SQL's provenance split without re-counting first: it records
**42 of 45** feedback rows; the count measured on 2026-09-13 is **42 orphans of 48** (three rows
were added after that file was written). The orphan figure — the one that matters, because
`loadContinuity()` joins on it — is unchanged at 42.

## 6. Still open

1. Set `COMPANION_KEY`, then ship the fail-closed default (§1).
2. Correct the masthead label in the meantime — the string is past the 32,768-byte read ceiling,
   so it must be located by the deploy actor, not guessed from here.
3. Wire `runGate()` at the insert site; `apply-remediation.mjs --report` prints the surrounding
   context because that region is unreadable from this endpoint.
4. Restore deploy provenance: production serves v1.1.0, the repo holds v1.0.0 twice
   (`worker.js` and `deployed-current.worker.js`, byte-identical).
5. Fix `/health.writer`, which reports `deepseek-chat` — in neither the repo's `MODELS` list nor
   the run log's `model` column.
6. File the defect in `agent_issues`: this endpoint has no insert tool, so nothing about this
   work is in the backlog.
7. Resolve the QPL expansion against a primary source.
8. Identify the concurrent writer that moved `main` mid-session (unexplained; no commit-list tool
   is exposed here).
