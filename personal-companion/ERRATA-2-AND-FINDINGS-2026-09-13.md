# ERRATA-2 and findings — reading.q08.org remediation (2026-09-13)

Author: qnfo-ops. Every figure was measured live on 2026-09-13 in a single verification pass whose
purpose was to **falsify** the staged remediation, not to restate it. Corrections first, then two new
findings. Read alongside `ERRATA-2026-09-13.md` (which this corrects in two places) and
`PATCH-2026-09-13-REMEDIATION.md`.

---

## E1. FALSIFIED — the word count. QRI-3's figure is wrong; QRI-2's is right for QRI-2's text

`sql/QRI-2-...sql` §3 derives `word_count 2503` / `length 15276`. `sql/QRI-3-...sql` §4(a) states
`2504` / `15278`. `sql/QRI-1b-...sql` says both cannot be right and to recompute.

Recomputed, two independent counters (worker.js's own `wordCount()` algorithm, transcribed, and a
`/\S+/g` counter), every span verified boundary-safe (each begins and ends on non-whitespace, so no
token merges across a replacement boundary):

| span | words before -> after | chars before -> after |
|---|---|---|
| A (opening two sentences) | 49 -> 31 (-18) | 287 -> 155 (-132) |
| B (Rowan / QPL / arithmetic) | 54 -> 37 (-17) | 287 -> 180 (-107) |
| C ("the QPL 2026 room") | 4 -> 3 (-1) | 17 -> 15 (-2) |
| **total** | **-36** | **-241** |

`2539 - 36 = 2503` and `15517 - 241 = 15276`. **QRI-2's pair is correct. QRI-3's 2504 / 15278 is
falsified by 1 word and 2 characters.**

Both are now superseded in practice: `QRI-4` changes span B's replacement text (§E4 below), giving
**2511 / 15323**. Rule recorded in QRI-4: never carry a word count over from a file whose replacement
text you did not apply.

## E2. CORRECTED PREMISE — "there is no cost column" is wrong about the schema

`ERRATA-2026-09-13.md` §2 says, in bold, **"There is no cost column."** That is false.
`PERSONAL.events` is:

```
(id, category, title, venue, city, country, start_date, end_date,
 amount REAL, currency TEXT, booking_ref, source, source_subject,
 energy, energy_label, notes, ingested_at)
```

`amount` and `currency` exist. They are **unpopulated**: `SELECT COUNT(*) FROM events WHERE amount IS
NOT NULL` -> **0 of 71**.

The conclusion survives — "the record holds no cost for either" is still true — but the reason
recorded was wrong, and a claim resting on a false premise about a schema is a claim that breaks the
first time someone populates the column. The independent support is stronger anyway:
`events.evt-qpl26.notes` = "Epistemic rigidity; motive currency = status. **Draining despite local.**"
QPL was in Amsterdam, the reader's city of residence (`profile` `logistics.amsterdam`); LoF26 required
travel to Cambridge. The two events did **not** cost roughly the same in travel.

## E3. RESOLVED — the QPL expansion, against the conference's own site

`PATCH-...md` §7 and `ADDENDUM-...md` §6.7 both list this as unverified. It is now verified.
`https://qpl2026.github.io/`, HTTP 200, fetched 2026-09-13:

> "The 23rd International Conference on **Quantum Physics and Logic** (QPL 2026) will take place from
> **August 17th to August 21st 2026 in Amsterdam**, The Netherlands."

and, separately, "**Weekend workshops : August 15 - August 16**".

So the essay's "the Workshop on Quantum Programming Languages" is a **real adjacent component
misapplied as the event's name**, plus a wrong expansion of the acronym. The harder failure mode: a
correctly dated, correctly located sentence whose name points at something else.

Consequence for the fix: the name is still removed from the body, but for the correct reason — the
reader's **standing filter** forbids it, not because the expansion is unknown. Verified live:
`profile` id `standing:no-qpl-cwi`, conf 0.95, *"Do not bring up QPL or CWI summer school topics in
personal recommendations or reminders as of 2026-08-25."* A piece written for him to read is a personal
recommendation.

## E4. RESTORED — a record-supported phrase QRI-2 dropped

QRI-2's span-B replacement deletes "**a status tournament**" along with the false material. It is
supported twice:

- `events.evt-qpl26.notes` = "motive currency = **status**"
- `profile` id `dislikes.status-venues`, conf 0.95 = "Large status-currency tournaments drain him:
  QPL 2026 logged energy 1 (drained)"

`QRI-1b` flagged this as a silent loss and left the call to the operator. `QRI-4` restores the phrase
and drops "with proceedings and citations" instead ("proceedings" is defensible — QPL 2026 uses EPTCS
proceedings — but "citations" is in no record row and the sentence does not need it).

---

## F1. NEW FINDING — the ops read-only guard rejects the `replace()` scalar function

Discovered by trying to recompute E1 *in SQL* rather than by hand. Two probes, both executed:

| probe | result |
|---|---|
| `SELECT replace('abc','a','b') AS t LIMIT 1` | **rejected**: "read-only SELECT/WITH only - mutation keywords are rejected anywhere in the statement" |
| `SELECT 1 AS guard_text_test WHERE 'the word delete appears in this literal' <> '' LIMIT 1` | **rejected**: same error |

The second probe is the important one. It proves the guard is a **raw-text substring scan, not a
parser**: a mutation keyword occurring *inside a string literal* trips it. So:

1. `replace()` — the obvious way to verify a text correction — is unusable. This session rewrote its
   verification with `instr`/`substr`/`length`/`trim` instead.
2. Any query whose literal contains such a word is unusable, including a query that searches *for*
   that word.
3. Measured blast radius: `telemetry_report` (24 h) shows **ops_d1_query 132 failures**, second-highest
   failing tool after `web_fetch` 295. Ledger row `AUTO-SWEEP: ops_d1_query` = **443 occurrences**,
   status open, last_seen 2026-09-13T06:20:42.653Z.
4. **Linkage is not proven.** That ledger row's `last_detail` is the bare string `ops_d1_query` — no
   error text. I did not establish that the 443 occurrences are guard rejections rather than genuine
   failures. Hypothesis, with the missing evidence named.
5. `telemetry_analyze(6h)` returned `persistent: []`, `filed: 0` — it did **not** file a ticket, because
   the detector requires >=2 errors with no subsequent success and successes interleave. The self-heal
   loop cannot see this class by construction.

Proposed fix (spec only; qnfo-ops has no deploy tool and no `agent_issues` insert):
strip string literals, quoted identifiers and comments *before* scanning, match keywords on word
boundaries, and allowlist the scalar functions (`replace`, `instr`, `substr`, `length`, `trim`,
`lower`, `upper`, `json_extract`, `char`). Full write-up:
`qnfo-ops/FINDING-2026-09-13-d1-guard-false-positive.md`.

## F2. NEW FINDING — the deploy patcher has no duplicate-declaration check

`apply-remediation.mjs` strips `import`/`export` and concatenates five modules into **one scope**,
inserted before `function json(obj, status) {`. Any collision between two top-level declarations makes
the bundle fail to parse — the worker does not load, and the reading page goes dark on deploy.

The patcher verifies its four anchors and its marker. It does **not** scan for identifier collisions.
That failure mode has already been hit once, by hand: `filters.js` originally declared a top-level
`esc` that `voice.js` also declares, and was renamed `fesc` after the collision was caught manually —
its own header documents this. The patcher's comment tells a future author to "check its top-level
names against the others first", i.e. the check is manual and can be forgotten.

Verified this session, from the readable head of `worker.js` (62,666 B, sha `c06edffb`): all five
patcher anchors are present exactly as written — `var VERSION = "1.0.0";` (line 5), the `loadLife`
events query `  var evs = await env.PERSONAL.prepare(`, `function json(obj, status) {`, the `P_STYLE`
epistemic-contract line, and `authorized()`'s `if (!key) return true;`.

Residual risk, stated not hidden: `worker.js` is an esbuild-style bundle with ~60 top-level names and
**the tail past 32,768 bytes is unreadable from this endpoint**, so a collision with a name declared
only in that tail cannot be excluded from here. The decisive cheap check for the deploy actor is a grep
of the full file for each lib top-level name: `MON`, `WORDNUM`, `iso`, `dayNum`, `monthOf`, `esc`,
`fesc`, `norm`, `SEP`, `termPattern`, `ENTITY_DENY`, `checkGrounding`, `checkVoice`, `checkAddressee`,
`blockingViolations`, `checkStandingFilters`, `mergeViolations`, `runGate`. Recommended: add that scan
to the patcher so it refuses to write on a collision, exactly as it already refuses on an ambiguous
anchor.

## F3. The concurrent-writer hazard, observed again

The write of this very file was rejected once:
`GitHub 409: is at f45a20c1e32de154a79ef1d8920b50345ffff8c2 but expected e7c7408f599140ea22dbae47020aabdd9fb24dbe`
— a second writer moved `main` between my first commit and this one. `ADDENDUM §6.8` records the same
thing as unexplained. It is still unexplained; no commit-list tool is exposed here. Serialize commits.

---

## Live state re-verified (2026-09-13, ~06:26–06:50Z)

| check | result |
|---|---|
| `reading.q08.org/` and `/p/2026-09-12-essay-3bf32c8a197d2196` | HTTP 200 — **the defect is still served verbatim** |
| `/health` | `v1.1.0`, `pieces 7`, writer `deepseek-chat` |
| `/api/pieces` | HTTP 200, **no key**, returns `anchor_json` and `quality_json` for all 7 pieces |
| `companion_pieces` | ids 6–12; id=8 is the only contaminated row |
| id=8 probes | len 15517, word_count 2539, `Rowan` x1 (offset 289), `QPL` x2 (352, 13954), `qpl_exp` 0, `CWI` 0 |
| `PERSONAL.notes` (490 rows) | `dining hall` 0, `forty` 0, `circle` 0 — the invented particulars are corroborated as invented |
| `companion_runs` | last run 06:06:17.466Z `failed` "no piece survived the gate"; 443 runs, 11 ok; last publication 04:01:23Z |
| `agent_issues` open | **25** (model-health 10, ai-calibration 10, research-pipeline 2, infra 1, fleet-self-improve 1, backlog 1) |
| `issue_ledger` | open **281** / 2353 occurrences, resolved 18, acknowledged 1 |

### The 06:01–06:06Z cycle published nothing — a prompt/validator mismatch

Three compose attempts, three rejections, then outright failure:

```
06:03:13  rejected  validate: unverified names: Notation Systems, Cognitive Scaffolds,
                    Interdependent Computation, Playful Convergence, Double Fugue, Live Counterpoint
06:06:17  failed    no piece survived the gate            (324,411 ms)
```

`unverifiedNames()` fires on two-word capitalised pairs absent from the anchors. The rejected strings
are **conceptual vocabulary** ("Notation Systems", "Interdependent Computation"), not invented proper
nouns — the writer is being asked to name concepts and then refused for naming them. That is a
prompt/validator mismatch, and its cost is a whole publication cycle with no piece, surfaced in no
backlog. The opposite failure mode of the same check is already documented: it cannot see a one-word
name, which is why id=8 shipped naming its reader.

---

## Open, with the reason each is still open

1. **Apply `QRI-4`.** Needs D1 write on PERSONAL. `ops_d1_query` is SELECT/WITH only. Until it runs, the
   page still reads "Five days later".
2. **Deploy the gate.** Needs deploy access; qnfo-ops has none. Applying `QRI-4` corrects one piece and
   prevents nothing.
3. **Set `COMPANION_KEY` first, then ship fail-closed.** No secret write path. Inverting
   `authorized()` before the key is set 401s every gated route — the key is unset on the live
   deployment.
4. **Stop the masthead claiming "Private." while the page is public**, or set the key. A false privacy
   claim is the actual defect; the fail-open default is only how it became false.
5. **Wire `runGate()` at the insert site** and exclude non-publishing rows from `/`, `/p/<slug>`,
   `/api/pieces` and `feed.xml`. That region is past the 32,768-byte read ceiling; `--report` prints the
   context for the deploy actor.
6. **Restore deploy provenance:** production serves `v1.1.0`; the repo holds `v1.0.0` twice, byte
   identical. The deployed source is not in the repo.
7. **Fix `/health.writer`**, which reports `deepseek-chat` — a value in neither the repo's `MODELS` array
   nor the run log's `model` column.
8. **Fix the feedback join:** 42 of 48 `companion_feedback` rows point at slugs absent from
   `companion_pieces`, so `loadContinuity()` feeds the writer reactions to pieces that no longer exist.
9. **The category filter is not covered.** `filters.js` enforces an entity deny-list only; "No
   physics/science books in reading recommendations" (conf 0.98, the reader's highest-confidence
   exclusion) needs a subject classifier at `pickTopic()`, before anchors are fetched. Not written, not
   claimed.
