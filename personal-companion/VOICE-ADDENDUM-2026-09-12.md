# personal-companion — voice addendum (2026-09-12)

Companion to `GROUNDING-PATCH-2026-09-12.md` (quantities) and `lib/voice.js`
(attribution). Written by qnfo-ops from a read-only audit of the live system.
Nothing here has been deployed; the deploy path is `qnfo-fleet-deploy` / the owner.

The question this answers: the published piece opens on the reader's own life and
names him in the third person, then speaks as "I" for two and a half thousand
words. Who is "I", and why are the events recounted inaccurately?

## 1. Evidence

| item | value | source |
|---|---|---|
| surface | `reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196` (HTTP 200, no key) | live fetch |
| store | `PERSONAL.companion_pieces` id=8, 2539 words, created 2026-09-12T12:31:21.845Z | D1 |
| producing run | `companion_runs` id=358, model `deepseek-chat`, topic `boredom-creativity`, status `ok` | D1 + `reading.q08.org/api/runs` (public) |
| seed | `companion_seeds` key `boredom-creativity`, source `rotation`, form `essay` | D1 |
| critic score | `{"specificity":5,"argument":6,"objection":8,"voice":7,"verdict":"reject","gate":"passed"}` | D1 |
| live version | `reading.q08.org/health` -> v1.1.0, pieces 4, writer `deepseek-chat`, models `kimi-k2.6, gpt-oss-120b, glm-5.3` | live fetch |
| repo version | `personal-companion/worker.js` -> `VERSION = "1.0.0"` | repo |

The critic flagged the autobiographical core in its own words — *"the piece rests
on a two-person energy rating that cannot bear the weight"* — and returned
`reject`. The piece was published anyway, which is the documented design
(`publishPolicy` deliberately does not gate on `reject`). The gate that does not
exist is the one that checks facts and voice.

## 2. Who "I" is

There is no narrator in the piece other than the reader. The mechanism is in the
prompt, not in the model's whim:

- `P_STYLE` (repo `worker.js`, v1.0.0): *"You are writing for one reader: Rowan."*
- `P_STYLE` also forbids, without exception: *"self-reference as a model or
  assistant; no greeting, no sign-off"*, and *"meta-commentary about writing,
  essays, readers, publishing, or disclosure"*.
- `P_ESSAY` requires the piece to open on *"a concrete particular"*.
- `loadProfile()` feeds the profile facets; `loadLife()` feeds `PERSONAL.activity`
  rows verbatim. The most concrete particulars in context are the reader's own
  recent events.

So the model may not say "I am a model", may not say "this is about you", and is
required to open on a particular. The only narrator left is the reader. It
therefore writes his life in the first person and, where it is transcribing the
dossier rather than inhabiting it, names him:

> "Rowan rated it 5 out of 5 for felt energy. ... he rated the same week 1 out of
> 5. Drained."

That sentence is a near-verbatim rendering of two rows the pipeline handed it:
`likes.play` — *"LoF26-style performance sessions energized him"*, evidence
*"LoF26 energy log (5, energized)"* — and `dislikes.status-venues` — *"QPL 2026
logged energy 1 (drained)"*. The name appears exactly at the seam between
quoting the record and speaking as its subject. A reader who knows the facts
asks who "I" is; the text has no answer, because it has no narrator.

Caveat, stated as a limit: the repo's `worker.js` is v1.0.0 and production serves
v1.1.0, whose source is not in the repo. The prompt text above is the v1.0.0
text. The behavioural inference (that v1.1.0 still names the reader and still
forbids model self-reference) rests on the published output, not on the deployed
source, which could not be read.

## 3. Errors in the recounting that `grounding.js` cannot see

`GROUNDING-PATCH-2026-09-12.md` catches two (`"Five days later"` — the gap is 7
days; `"cost roughly the same"` — no record populates cost). Three more:

| claim | record | status |
|---|---|---|
| "at QPL 2026 in Amsterdam — **the Workshop on Quantum Programming Languages**" | QPL 2026 is the 23rd International Conference on **Quantum Physics and Logic**, 17–21 Aug 2026, Amsterdam (weekend workshop 15–16 Aug). "Workshop on Quantum Programming Languages" was the name of the 2005/2006 editions. | **wrong name** |
| "The two events cost roughly the same in **travel** and time" | The reader's own QPL registration email (2026-08-16): *"I am based in Amsterdam, so attendance carries no travel cost for me."* The ledger row `evt-qpl26` notes: *"Epistemic rigidity; motive currency = status. **Draining despite local.**"* | **wrong, and contradicted by the source it was built from** |
| "he rated the **same week** 1 out of 5" | LoF26 10–14 Aug; QPL 17–21 Aug. Different weeks. | **wrong** |

The travel-cost error is the interesting one: the record does not merely fail to
support the claim, it explicitly records the opposite, in the row the pipeline
copied the energy value from.

## 4. What is not verifiable from here

- **LoF26 itself.** No external check succeeded (DuckDuckGo served a bot
  challenge; Bing returned no relevant results). The only record is the user's
  own GTD register: `PERSONAL.events` id `evt-lof26`, source
  `gtd-attendance-ledger`. The venue string "Wolfson College, Cambridge" is
  therefore unverified against any external source — and the profile separately
  records *"LoF28: 7-11 Aug 2028, Wolfson College, Cambridge"*, so venue
  contamination between the two entries cannot be excluded.
- **"about forty people sat in a circle", "the dining hall".** No row holds a
  headcount or a room. These are supplied particulars, not recalled ones.
- **The QPL name.** Internally checkable and checked (see §3); the mis-naming is
  a paraphrase, not a record value. `worker.js` already has `unverifiedNames()`,
  which extracts Capitalised pairs absent from the anchors — "Quantum
  Programming" would be a candidate — but nothing in the run log shows it
  blocking. Whether it ran and was ignored, or did not run in v1.1.0, is not
  determinable from here.

## 5. Change — voice gate (`lib/voice.js`, added this commit)

Three pure checks, measured against the verbatim opening of the published piece:

```
checkVoice(PUBLISHED + first-person tail, {names:['Rowan'], venues:['Wolfson College, Cambridge','Amsterdam']})
-> 5 violations
   attribution-seam     "Rowan rated"
   invented-particular  "about forty people"
   invented-particular  "dining hall"
   invented-particular  "sat in a circle"
   invented-particular  "took turns being wrong"
```

Controls in `voice.test.js`: corrected prose 0; a third-person review naming
Rowan 0 (the seam check is scoped to text that also speaks in the first person);
"I attended ... my week" 2; a room noun present in the venue string 0.

Wire it next to the grounding check, before the insert:

```js
import { checkGrounding, publishPolicy } from './lib/grounding.js';
import { checkVoice, venuesOf, mergeViolations } from './lib/voice.js';

var violations = mergeViolations(
  checkGrounding(piece.body_md, facts),
  checkVoice(piece.body_md, { names: ['Rowan'], venues: venuesOf(ar) })
);
var decision = publishPolicy({ quality: quality, violations: violations, forced: wasForced });
```

Also add to `P_STYLE`, under the epistemic contract:

> Do not narrate the reader's life. When you use his record, attribute it
> plainly — "the record shows he rated the week 5" — or leave it out. Never
> write his experience in the first person, and never supply a particular the
> record does not hold: no headcounts, no rooms, no scene-setting. If the piece
> needs a concrete particular to open on, take it from the anchors.

## 6. Not done, and why

- **The live piece was not corrected or withdrawn.** `qnfo-ops` has read-only D1
  access; there is no write path to `PERSONAL.companion_pieces` from that
  endpoint, and no deploy tool. `reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196`
  still reads "Five days later" and "cost roughly the same in travel and time".
- **No deploy.** `voice.js` and the `P_STYLE` paragraph are staged in the repo
  only; production is still v1.1.0.
- **The privacy claim is still false.** `GET /` and `GET /p/<slug>` return full
  text with no key, and `GET /api/runs` returns the generation log publicly,
  while the masthead reads "Written for one reader. Private." `authorized()`
  fails open when `COMPANION_KEY` is unset. Unchanged from the earlier patch
  (Change 4 there).
