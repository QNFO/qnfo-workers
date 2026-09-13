# personal-companion

Autonomous personal reading companion. Personal plane only.

> **REV 2 (2026-09-13, qnfo-ops)** — four claims in this README contradicted the code or live
> behaviour, each verified by reading the source and probing the live deployment. They are
> corrected below and the original wording is quoted so the change is auditable. This README is
> what an operator reads before deploying; a README that names banned models and documents an
> inverted publish policy is a defect, not a nicety.

## What it does

Writes for one reader. Reads his own taste model (`personal-life.profile`), his lived
record (`activity`, `events`, `notes`), and public primary sources (arXiv, Wikipedia),
then writes three kinds of piece on a weekly rhythm:

| Day | Form |
|---|---|
| Mon Wed Fri | cross-domain essay |
| Tue Thu Sun | curated field notes |
| Sat | long-form installment |

Cron configured for 06:00 UTC. (Observed runs land 06:01–06:06Z; a separate cron-mismatch
finding exists in the ops workspace. Do not treat the 06:00 figure as a guarantee.)

## Partition

Binds `PERSONAL` (personal-life D1), `VZ` (personal-life Vectorize), `MEDIA`
(personal-media R2), `AI`, and the shared `EMAIL` service binding. It never reads the
QNFO records oracle, never writes a QNFO ledger, and nothing it produces enters the
research corpus, the audit log, or any QNFO registry.

## Routes

- `GET /health` — version, piece count, last piece (public)
- `GET /` — reading index
- `GET /p/<slug>` — one piece
- `GET /api/pieces` — JSON list
- `GET /api/piece/<slug>` — JSON piece
- `GET /api/runs` — generation log
- `GET /api/f?slug=&s=good|flat|no` — record a reaction
- `GET /run?form=essay|notes|serial` — generate now (add `async=1` to detach)

**CORRECTED (rev 2): the access-gated routes are PUBLIC in the live deployment.**
The original text described every route below `/health` as "gated". `authorized()` is
fail-open — `if (!key) return true;` — and `COMPANION_KEY` is **unset** on the live
deployment, so `authorized()` returns true for every request. Verified 2026-09-13: `/`,
`/p/2026-09-12-essay-3bf32c8a197d2196` and `/p/2026-09-13-notes-ae043d7af833c67b` all return
**HTTP 200 with full bodies and no key**, while the masthead reads "Private."

Do not invert that default on its own: with `COMPANION_KEY` unset, fail-closed would black
out the page on the next deploy. Set the key first, then ship the inversion.

## Model note

**CORRECTED (rev 2).** The original text named three models as the generation list:
`llama-3.3-70b-instruct-fp8-fast`, `gpt-oss-120b`, `gemma-4-26b-a4b-it`. **Two of those three
are banned by this worker's own `BANNED_MODELS` list**, so the README described a
configuration the code cannot run:

| README (old) | banned by `BANNED_MODELS` on |
|---|---|
| `llama-3.3-70b-instruct-fp8-fast` | `llama`, `-fp8-fast` |
| `gemma-4-26b-a4b-it` | `gemma-4-26b` |
| `gpt-oss-120b` | — (the only one that is actually usable) |

The real list, from `worker.js` `MODELS`:

```js
var MODELS = [
  "@cf/moonshotai/kimi-k2.6",
  "@cf/openai/gpt-oss-120b",
  "@cf/zai-org/glm-5.3"
];
```

All three pass `modelAllowed()`. Note that `glm-5.3` is present while the old README warned
against `glm-5.3-flash` — different model identifiers, and `-flash` is the banned substring.
The substantive warning survives: reasoning models spend the token budget on
`reasoning_content` and return **empty content** (`finish_reason=length`). Re-measure before
changing the list.

## Quality gate

**CORRECTED (rev 2).** The original text said: *"Pieces that never pass are still stored,
tagged `quality_json.gate = "forced"`, so the reading page is never empty."* That is the
policy the QRI remediation **inverts**, and `publishPolicy` no longer does it:

```js
if (o && o.forced) {
  return { publish: false, gate: 'forced-unpublished',
           reason: 'code validation not passed; stored but not served' };
}
```

A piece that fails the gate is now stored for audit and **excluded from the page**. A gap in
the reading page is preferred to an ungrounded piece; the rhythm refills it next day.

Also note that `verdict: "reject"` is **not** a block. `P_CRITIQUE` asks the critic to look for
reasons the piece is worthless, so "reject" is its expected output — 6 of the 7 live pieces
carry it. Gating on the verdict alone would empty the page. Only measured violations block.

The gate itself (`lib/gate.js` + `grounding.js` + `voice.js` + `addressee.js` + `filters.js`)
is **not running in production**: the bundle has never been deployed, and
`apply-remediation.mjs` does not wire the `runGate()` call at the insert site. Until that is
wired, the quality gate described above is aspirational.

## Secrets

`COMPANION_KEY` (page access — **currently unset, see Routes**), `EMAIL_API_KEY` (mail send).

## Version

**CORRECTED (rev 2).** This repo holds **v1.0.0**. The live deployment serves **v1.1.0**, whose
source is **not in this repo**. `deployed-current.worker.js` is **byte-identical** to
`worker.js` (`sha c06edffb`, 62,666 B) and is therefore mislabelled — it is not the deployed
source. `wrangler.toml` sets `main = "worker.js"`, so a deploy from this directory would ship
the v1.0.0 source and silently discard whatever v1.1.0 carries.

See `FINDING-2026-09-13-deploy-source-mismatch.md`. **Obtain and commit the v1.1.0 source
before any deploy.**
