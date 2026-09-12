# personal-companion — grounding patch, wiring spec (2026-09-12)

Companion to `lib/grounding.js` (added in the same commit). Written by qnfo-ops
from a read-only audit of the live system. Nothing here has been deployed; the
deploy path is `qnfo-fleet-deploy` / the owner.

## Evidence

| item | value |
|---|---|
| surface | https://reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196 (HTTP 200) |
| store | PERSONAL D1 `companion_pieces` id=8, form=essay, 2539 words, created 2026-09-12T12:31:21.845Z |
| producing run | `companion_runs` id=358, model `deepseek-chat`, topic `boredom-creativity`, status ok |
| live version | `reading.q08.org/health` -> v1.1.0, pieces 4, writer deepseek-chat |

Ground truth (`PERSONAL.activity`):

```
2026-08-10  LoF26, Wolfson College, Cambridge   energy=5  energized
2026-08-17  QPL 2026, Amsterdam                 energy=1  drained
2026-08-28  CWI summer school, Amsterdam        energy=null
```

Computed relations:

```
LoF26  2026-08-10..2026-08-14  duration = 5 days
QPL    2026-08-17..2026-08-21  duration = 5 days
GAP    LoF26 -> QPL            start-to-start = 7 days, end-to-start = 3 days
```

Claims in the published piece vs the record:

| claim | record | status |
|---|---|---|
| LoF26 rated 5/5 energized | energy 5 energized | ok |
| QPL rated 1/5 drained | energy 1 drained | ok |
| LoF26 "ran five days" | duration 5 | ok |
| **"Five days later, at QPL 2026"** | gap is 7 days | **wrong** |
| **"cost roughly the same in travel and time"** | no amount/currency on either row; QPL is in the residence city | **wrong** |
| "the dining hall at Wolfson College" | venue is the string "Wolfson College, Cambridge" | unverified |
| "about forty people sat in a circle" | no headcount in any row | unverified |

Verification of the checker against this text (run 2026-09-12):

```
VIOLATION [interval] "Five days later" -> interval 5d is not a computed gap (computed gaps: 3, 7, 11, 14, 18)
VIOLATION [comparative-equality] "cost roughly the same" -> equality asserted on a quantity no record populates
violations=2
control (corrected text, "Seven days later") violations = 0
```

## Change 1 — supply the relations (context builder)

In `loadLife(env)`, the `activity` block currently emits one line per row. After
building those lines, append the derived block:

```js
import { deriveTemporalFacts, injectFacts } from './lib/grounding.js';

// inside loadLife(env), after the activity query
var facts = deriveTemporalFacts(ar);      // ar = acts.results
var derived = injectFacts(facts);
for (var q = 0; q < derived.length; q++) lines.push(derived[q]);
```

This is the actual fix for the wrong number: the model no longer has to compute
7 from two dates. It is told 7.

## Change 2 — verify before publish (new pass)

After the critique pass and before the insert into `companion_pieces`:

```js
import { checkGrounding, publishPolicy } from './lib/grounding.js';

var violations = checkGrounding(piece.body_md, facts);
var decision = publishPolicy({ quality: quality, violations: violations, forced: wasForced });
```

Log `decision.reason` into `companion_runs.detail` so a block is visible in the
run log rather than silent.

## Change 3 — stop serving forced fallbacks

`README.md` currently states: *"Pieces that never pass are still stored, tagged
`quality_json.gate = "forced"`, so the reading page is never empty."* Three such
runs exist (`companion_runs` ids 208, 221, 230, all `bremermann-economics`), each
immediately followed by an ok run that published a slug.

`publishPolicy` returns `publish: false, gate: 'forced-unpublished'` for these.
Keep writing the row for audit, but exclude `forced-unpublished` and
`blocked-grounding` from the index, `/api/pieces`, and the RSS feed. An empty
slot is preferable to an ungrounded piece; the rhythm will refill it next day.

Do **not** add a block on `verdict === "reject"`. `P_CRITIQUE` instructs the
critic to look for reasons the piece is worthless, so `reject` is its expected
output. Three of the four live pieces carry `reject` with `gate: "passed"`, and
that is not by itself a defect. The defect is that nothing checked the *facts*.

## Change 4 — fail-open authorization (separate, security)

`authorized()` in `worker.js`:

```js
function authorized(request, env) {
  var key = env.COMPANION_KEY || "";
  if (!key) return true;          // <-- fail-open
  ...
```

Confirmed live: `GET https://reading.q08.org/` returns 200 with full text and no
key, while the masthead reads "Written for one reader. Private." and README
claims the page is "gated by `COMPANION_KEY`". The `Private.` label is a label,
not access control, and RSS is public by design ("Shared with anyone who wants
to follow along").

Required: either set `COMPANION_KEY` on the deployment, or invert the default to
`if (!key) return false;`. If the page is intended to be public, remove the word
"Private." from the masthead — a false privacy claim is worse than none.

## Not done, and why

- **The live piece was not corrected or withdrawn.** `qnfo-ops` has read-only D1
  access; there is no write path to `PERSONAL.companion_pieces` from that
  endpoint, and no deploy tool. The row still reads "Five days later".
- **No in-place edit of `worker.js`.** The file is 62,666 bytes and only its first
  ~30,000 were readable through the API used, so a full-file rewrite would have
  risked truncating unseen code. This change is additive: a new module plus this
  spec.
- **Deploy provenance is still broken.** The repo's `personal-companion/worker.js`
  and `companion-hub/deployed-current.worker.js` both report `VERSION = "1.0.0"`,
  while production serves v1.1.0. The v1.1.0 source is not in the repo, so the
  gate actually running in production could not be read. Anything above about the
  production gate is behavioural inference from `companion_runs`, not source.
