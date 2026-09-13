# Finding — the public runs route exposes rejected drafts, and confirms the name-matcher hypothesis (2026-09-13)

Written by qnfo-ops from a read-only `GET` to the live deployment. Two results: a disclosure defect,
and the first behavioural evidence that the deployed validator differs from the repo copy.

## 1. The route, and what it returns

`GET https://personal-companion.q08.workers.dev/api/runs` returns **HTTP 200 with no key** and a JSON
array of generation runs. Three fields per row are the whole problem: `status`, `detail`, and a
`raw:` segment inside `detail` that carries the beginning of the piece the run produced.

Verbatim from run id 442 (status `rejected`):

```
"detail": "validate: unverified names: Notation Systems, Cognitive Scaffolds, Interdependent
Computation, Playful Convergence, Double Fugue, Live Counterpoint || raw: # Field Notes for Rowan

## Notation Systems as Cognitive Scaffolds
A notation system is a collection of symbols given arbitrary meanings to enable structured
communication within a domain [1]. In the practice of ultrametric mathematics, symbols such as
p-adic digits serve as a compact language for hierarchical distances. In music, the staff, clefs,
and rhythmic symbols translate temporal patterns into visual form. Rowan's work on the seams
between mathematics and music repeatedly invokes such"
```

This is the `README.md` route list (`GET /api/runs — generation log`) behaving as documented. What
the README does not say is that the log carries the draft text.

## 2. What this falsifies

A prior record on this project states that rejected bodies are discarded, and cites
`FINDING-2026-09-13-publish-stall-ADDENDUM-draft-persistence.md` for it. That is **false as stated**
for the deployed worker: the opening of every rejected draft is persisted in `companion_runs.detail`
and served publicly. The persistence is truncated, but the truncation is not at 120 characters — run
442's segment carries a heading, a full sentence, and part of a second.

Consequence for the earlier analysis: the strings the validator flagged were reconstructed from
synthetic headings because the real rejected body was believed unrecoverable. It was recoverable the
whole time, and the reconstruction is now checkable against the original.

## 3. The heading hypothesis, confirmed on real output

Executed: `nameCandidates()` transcribed verbatim from `worker.js` (blob `c06edffb…`), applied to the
`raw:` string above.

| candidate | source in the raw text |
|---|---|
| `Notation Systems` | the `## ` heading |
| `Cognitive Scaffolds` | the same `## ` heading |
| `Field Notes` | the `# ` title |

The live run flagged `Notation Systems` and `Cognitive Scaffolds`. Both are the two words of a
section heading, which is exactly what the earlier reconstruction predicted and could not prove. Two
of the six flagged strings are now reproduced from the original text rather than from a synthetic
heading. The other four are in the truncated remainder.

So the mechanism is confirmed: the notes form requires a short title per item, the writer sets those
titles in Title Case, and the name validator reads each Title Case title as an invented proper name.

## 4. The anomaly — and why it is evidence of the provenance gap

The repo's rule produces three candidates from that raw text. The live run flagged two of them. The
one it did not flag is `Field Notes`, from the `# ` title.

Before treating that as a defect, the obvious innocent explanation has to be excluded: `unverifiedNames()`
suppresses a candidate when it appears anywhere in the anchor text, so `Field Notes` may simply have
been in the anchors. Executed check against the two summaries this topic would fetch — the topic is
`notation-thought`, wiki field `Notation`, and the run's own log line reads `anchorKinds
concept,concept`:

| anchor fetched | contains "field notes"? |
|---|---|
| `Notation system` summary (pageid 407860) | no |
| `Thought` summary (pageid 37080) | no |

So the innocent explanation fails on the most likely anchor pair. Two explanations survive: the
deployed validator skips the document title line, or the second anchor was something else whose text
happens to contain the phrase. I cannot separate them from here, and I am not asserting the first.
But this is the first time the divergence has been observable on real output rather than inferred
from a source mismatch, and it needs no access to the unreadable half of `worker.js`.

## 5. The rejected draft also carried a defect the voice checks would have passed

The same raw text contains the reader's name twice: once in the document title (`# Field Notes for
Rowan`) and once in the body (`Rowan's work on the seams between mathematics and music`).

Executed `checkVoice()` (rev 4 patterns) against the raw string with the reader's name as the target:
**one violation, `reader-as-subject`, severity `warn`.** Nothing else fires. The
`attribution-seam` check needs an experience verb within 80 characters of the name, and the phrase
that follows is `work on the seams … repeatedly invokes`, which has none. There is no recorded venue
in the string, so the presence checks cannot block either.

So the run was rejected for invented names and would have passed on voice. The name validator is
doing work the voice gate is supposed to do, by accident, and only because a heading happened to
contain two capitalised words. If the writer had used a sentence-case heading — the fix this project
already recommends for the notes form — the piece would have gone to the page naming the reader in
its title.

## 6. Provenance, one more signal

`GET /health` returns `version: v1.1.0`, `writer: "deepseek-chat"`, and a `models` array listing the
three Cloudflare models in the repo's `MODELS`. The failing runs of the 06:01Z cycle carry
`model: "@cf/openai/gpt-oss-120b"`, and the 04:01Z success carries `model: "deepseek-chat"`.

`deepseek-chat` is not in the repo's `MODELS` array and not in `BANNED_MODELS`. A writer identifier
the repo does not contain is further evidence that the deployed source is not the committed source,
and it names a fourth model to account for when the v1.1.0 source is recovered.

## 7. Severity

This is a disclosure defect on the same axis as the fail-open `authorized()` already recorded, and it
is worse in kind. The reading page is described in its own masthead as private, and
`/api/runs` publishes, without a key, drafts that name the reader and describe what he works on. The
existing finding covers published pieces; this covers **rejected** ones, which are the ones the
pipeline was built to withhold.

## 8. What is not claimed

- No fix applied. `ops_d1_query` is SELECT/WITH only and there is no write path to `PERSONAL`.
- I did not enumerate how far back the `raw:` segments go, nor how many runs carry them.
- I did not confirm the identity of the second anchor for run 442; the anchor check in §4 covers the
  most likely pair and is labelled as such.
- The `# ` title anomaly is recorded as an anomaly with two surviving explanations, not as a
  conclusion about which validator is deployed.
