# personal-companion — remediation patch, consolidated wiring spec (2026-09-13)

Extends `GROUNDING-PATCH-2026-09-12.md` and `VOICE-ADDENDUM-2026-09-12.md`; it does not
replace them. Everything below was measured live on 2026-09-13 by qnfo-ops, read-only.
Nothing here is deployed: this endpoint has no deploy tool, no D1 write path, no
branch-creation tool, and no secret write path. §5 lists each limit with the exact error
text it returned.

## 1. State of play

| item | measured 2026-09-13 |
|---|---|
| live index | `https://reading.q08.org/` HTTP 200 — **7 pieces** (was 4 when the 09-12 record was written) |
| live `/health` | `v1.1.0`, `pieces 7`, `writer "deepseek-chat"`, models kimi-k2.6 / gpt-oss-120b / glm-5.3 |
| store | `PERSONAL.companion_pieces` 7 rows, ids 6–12 |
| newest piece | id=12 `2026-09-13-notes-ae043d7af833c67b` "Four Instruments for Reading a Claim", 846 words, created 04:01:23.429Z |
| runs | ids 432–443, 2026-09-13 06:01–06:06Z |
| newest run | id=443 `status=failed`, `detail="no piece survived the gate"` |
| feedback | 48 rows; **42 reference slugs absent from `companion_pieces`** (87.5%) |
| repo source | `personal-companion/worker.js` 62,666 bytes, sha `c06edffb…`, `VERSION = "1.0.0"` |
| repo `deployed-current.worker.js` | **same size, same sha** `c06edffb…` |
| registry | `service_discover personal-companion` → version 1.0.0, `capabilities []`, `routes []`, `purpose null` |

Two corrections to the 09-12 record:

- The pipeline is **not** idle. It ran six times on 09-13 between 06:01 and 06:06Z. The note
  "idle for two hours with its last run unterminated" described 09-12 13:22Z and no longer holds.
- "pieces 4" is superseded: ids 10, 11 and 12 were added after that record was written.

## 2. Where the defects actually are

All published-text defects are confined to **one row**. Probe: `instr()` positions over
`body_md` across all seven pieces.

| id | title | `Rowan` | `he rated` | `Five days later` | `same week` | `roughly the same` | `Quantum Programming` |
|---|---|---|---|---|---|---|---|
| 6 | The Sector That Has No Ground Truth | – | – | – | – | – | – |
| 7 | The Hand That Signs | 711 | – | – | – | – | – |
| **8** | **The Understimulated Interval** | **289** | **475** | **332** | **489** | **540** | **392** |
| 9 | The Walker's Argument | – | – | – | – | – | – |
| 10 | The Hand That Signs | – | – | – | – | – | – |
| 11 | The Hand That Signs | – | – | – | – | – | – |
| 12 | Four Instruments for Reading a Claim | – | – | – | – | – | – |

The corpus is not systematically contaminated. One piece carries all six hits; id=7's single
`Rowan` at offset 711 is the disclaimer that *excludes* him ("Rowan's own handwriting is not
the subject here."). The fix must be a gate that would have caught id=8 — not a corpus rewrite.

## 3. Why the shipped gate passed id=8 — three mechanisms, all in source

### 3.1 `unverifiedNames()` cannot see a one-word name

`worker.js` `nameCandidates()` requires **two** capitalised words:

```js
if (sp !== 1 || !isCap(s, j)) continue;      // must be "Word Word"
out.push(a.w + " " + b.w);
```

"Rowan" is one token, so it is outside the check's range **by construction**. The check does
work — `companion_runs` 436/439/442 were rejected on `unverified names: Notation Systems,
Cognitive Scaffolds, Interdependent Computation, Playful Convergence, Double Fugue, Live
Counterpoint` — but it can only ever fire on multi-word inventions. This is the mechanism by
which id=8 shipped naming its own reader.

### 3.2 `voice.js` has two measured blind spots

Replicating its exact regexes against real text:

| check | input | result |
|---|---|---|
| attribution-seam | `"# Field Notes for Rowan\n\n## Notation Systems…"` | **`null`** — no experience verb to bind to |
| attribution-seam | live piece 8 opening | `"Rowan rated"` — caught |
| reader-as-subject | `"Rowan's work…"` (straight apostrophe) | `"Rowan's"` — caught |
| reader-as-subject | `"Rowan’s work…"` (**typographic**) | **`null`** — missed |

`voice.js` builds its possessive test with a straight apostrophe (`'\b' + n + "'s\b"`). The raw
text of run 442 shows the writer producing both a heading and a possessive, so both misses are
live rather than theoretical. `lib/addressee.js` (this commit) covers both.

### 3.3 The obvious general fix is wrong — measured

The tempting patch is to extend `nameCandidates()` to single tokens: flag any capitalised word
preceded by whitespace and absent from the anchors. Run against the **clean** live piece 12,
that produces **47 candidates**, among them `Only`, `High`, `Court`, `Eighty`, `Whether`,
`Four`. It would have blocked a piece with no defect in it. Signal-to-noise is roughly one
useful hit (`Rowan`, on id=8) against 46 legitimate tokens on a single clean piece.
**Do not do this.** Use a curated person-name list instead; `addressee.js` takes `names` as a
parameter for exactly this reason.

### 3.4 Deploy provenance is asserted, not true

`personal-companion/deployed-current.worker.js` is byte-identical to
`personal-companion/worker.js` — same 62,666 bytes, same sha `c06edffb…` — while production
serves `v1.1.0`. The file named "deployed-current" is not the deployed source.

Related: `/health` reports `writer "deepseek-chat"`, which appears in neither the repo's
`MODELS` array (`kimi-k2.6`, `gpt-oss-120b`, `glm-5.3`) nor the run log, whose `model` column
for the 09-13 runs reads `@cf/openai/gpt-oss-120b`. Treat `/health.writer` as unreliable, and
note that README's model note names `llama-3.3-70b-instruct-fp8-fast` while `worker.js` carries
`"llama"` in `BANNED_MODELS` — the README and the code disagree about which models may be used.

## 4. Wiring, in order of risk

### 4.1 authz — independent of the gate, fixes a live false claim

Replace the body of `authorized()` with `lib/authz.js` `authorized()`. The only behavioural
change is `if (!key) return true;` → `return false;`. Then route every non-public request
through `gateDecision(pathname, request, env)` and log `reason`. Replace the hardcoded masthead
string with `privacyLabel(env)`.

### 4.2 addressee

```js
import { checkAddressee, blockingViolations } from './lib/addressee.js';
var addr = checkAddressee(piece.body_md, { names: READER_NAMES });   // ['Rowan']
```

Feed `addr` into `mergeViolations()` with the other two checks. `blockingViolations(addr)` is
the strict subset, for callers that want the hard rule.

### 4.3 grounding + voice (staged 09-12, still unwired)

```js
import { deriveTemporalFacts, injectFacts, checkGrounding, publishPolicy } from './lib/grounding.js';
import { checkVoice, venuesOf, mergeViolations } from './lib/voice.js';

var facts = deriveTemporalFacts(ar);                       // ar = activity rows
var derived = injectFacts(facts);
for (var q = 0; q < derived.length; q++) lines.push(derived[q]);

var violations = mergeViolations(
  checkGrounding(piece.body_md, facts),
  checkVoice(piece.body_md, { names: READER_NAMES, venues: venuesOf(ar) }),
  checkAddressee(piece.body_md, { names: READER_NAMES })
);
var decision = publishPolicy({ quality: quality, violations: violations, forced: wasForced });
```

Log `decision.reason` into `companion_runs.detail` so a block is visible in the run log rather
than silent.

### 4.4 P_STYLE — add under the epistemic contract

> Do not narrate the reader's life, and do not name him. The piece is written *to* him; it is
> never *about* him and never *from* him. Never write his experience in the first person, never
> refer to him in the third person, and never put his name in a heading, a title, or an address
> ("for Rowan"). When a claim comes from his record, state it as the record: "the record shows
> energy 5". Never supply a particular the record does not hold — no headcounts, no rooms, no
> scene-setting. If the piece needs a concrete particular to open on, take it from the anchors.

The existing text forbids "self-reference as a model or assistant" and meta-commentary about
readers, but says nothing about the *reader's own name* — which `P_STYLE` itself supplies in its
first line ("You are writing for one reader: Rowan."). That omission is the seam.

### 4.5 feedback join

`loadContinuity()` tells the writer "HOW HE REACTED (this is the strongest signal you have)"
from a join that is 87.5% orphans (42/48). The fix is one word — `LEFT JOIN` → `JOIN`:

```js
var fb = await env.PERSONAL.prepare(
  "SELECT f.slug, f.signal, f.note, p.title FROM companion_feedback f " +
  "JOIN companion_pieces p ON p.slug = f.slug ORDER BY f.id DESC LIMIT 12").all();
```

Also log the orphan count: it is a silent data-integrity signal, and 42 rows of feedback are
currently feeding the writer reactions to pieces that no longer exist.

### 4.6 forced policy and deploy provenance

`publishPolicy()` already returns `forced-unpublished`; exclude that and `blocked-grounding`
from the index, `/api/pieces`, and the RSS feed. Replace `deployed-current.worker.js` with the
real v1.1.0 source, or delete the file — a mislabelled file is worse than none.

## 5. What this endpoint cannot do (re-verified 2026-09-13, with returned error text)

- **Branch / PR**: `github_file_write` → `GitHub 404: Branch ops/companion-remediation-2026-09-13 not found`. No branch-creation tool exists, so no PR is possible. Commits land on `main`, additive only.
- **Rewrite `worker.js`**: `github_repo_read` with `maxChars: 100000` still returns `…(truncated to 32768 chars)` on a 62,666-byte file. The ceiling is the tool's, not the request's, so a whole-file write would risk truncating unseen code. Hence a module plus a spec, not a patched bundle.
- **D1 write**: `ops_d1_query` is SELECT/WITH only across every bound database.
- **Deploy, secrets, backlog insert**: no tool. `qnfo-fleet-deploy` and `qnfo-fleet-control` exist in the registry but are not exposed here.
- **Two writes to the same branch in one batch** race: a parallel write returned `GitHub 409: is at 3a16705bd3b468ecb1fd03e3d69322b69f72ed0c but expected 2d8638d1a245178ffaf26b2114de6d7b6d3e708d`. Serialize commits.

## 6. Test evidence (all `run_code`, 2026-09-13)

- `addressee.js`: heading-only text → 1 block; run-442 text → 2 blocks + warns; typographic apostrophe → 2 blocks; live piece 8 → 1 warn, 0 blocks; piece 12 and the corrected control → 0. Pinned in `addressee.test.js` against verbatim fixtures.
- `authz.js`: fail-closed on unset / empty / undefined key; public routes unchanged; correct, incorrect and prefix credentials; label agrees with the gate. Pinned in `authz.test.js`.
- Arithmetic, independently recomputed: LoF26 duration 5, QPL duration 5, start-to-start gap **7**, end-to-start gap 3. `claim_equals_lof26_duration: true`, `claim_equals_any_gap: false`, `same_week: false`.

## 7. Known limits (stated, not hidden)

- These are surface checks. They flag spans for a policy to judge; they do not establish
  grounding and they do not prove authorship.
- `addressee.js` blocks heading and address forms and warns on a bare mention. A piece that
  narrates the reader **without naming him** — "the man who was there rated the week 5" — passes.
- `voice.js`'s invented-particular check is scoped to sentences that mention a recorded venue,
  so a piece recounting an event without naming the venue is not flagged on particulars.
- Nothing here has been executed against production. The deployed `v1.1.0` gate may differ from
  the repo's `v1.0.0` in ways that make parts of §4 redundant — or insufficient.
- The QPL expansion (Quantum Physics and Logic vs "Quantum Programming Languages") is still
  **not tool-verified**: `en.wikipedia.org/api/rest_v1/page/summary/Quantum_Physics_and_Logic`
  → HTTP 404, `qpl.science` → HTTP 530, DuckDuckGo returned no parseable results.
- `addressee.js` and `authz.js` have not been run under the worker runtime. They are pure
  functions with no bindings, and were executed in isolation only.
