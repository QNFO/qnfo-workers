# personal-companion

Autonomous personal reading companion. Personal plane only.

## What it does

Writes for one reader. Reads his own taste model (`personal-life.profile`), his lived
record (`activity`, `events`, `notes`), and public primary sources (arXiv, Wikipedia),
then writes three kinds of piece on a weekly rhythm:

| Day | Form |
|---|---|
| Mon Wed Fri | cross-domain essay |
| Tue Thu Sun | curated field notes |
| Sat | long-form installment |

Daily at 06:00 UTC. Private reading page at `/`, gated by `COMPANION_KEY`.

## Partition

Binds `PERSONAL` (personal-life D1), `VZ` (personal-life Vectorize), `MEDIA`
(personal-media R2), `AI`, and the shared `EMAIL` service binding. It never reads the
QNFO records oracle, never writes a QNFO ledger, and nothing it produces enters the
research corpus, the audit log, or any QNFO registry.

## Routes

- `GET /health` - version, piece count, last piece (public)
- `GET /` - reading index (gated)
- `GET /p/<slug>` - one piece (gated)
- `GET /api/pieces` - JSON list (gated)
- `GET /api/piece/<slug>` - JSON piece (gated)
- `GET /api/runs` - generation log (gated)
- `GET /api/f?slug=&s=good|flat|no` - record a reaction
- `GET /run?form=essay|notes|serial` - generate now (gated; add `async=1` to detach)

## Model note

Generation uses non-reasoning models only (`llama-3.3-70b-instruct-fp8-fast`,
`gpt-oss-120b`, `gemma-4-26b-a4b-it`). Measured 2026-09-11: reasoning models
(`deepseek-v4-flash-0731`, `glm-5.3-flash`) spend the entire token budget on
`reasoning_content` and return **empty content** (`finish_reason=length`). Do not
add a reasoning model to this list without re-measuring.

## Quality gate

Every piece must clear a code validation (length band, banned-phrase list, emoji
scan, required structure) and an adversarial critique scoring specificity, argument,
bridge, objection, and voice. A rejected attempt feeds its critique back into the
next attempt (3 attempts). Pieces that never pass are still stored, tagged
`quality_json.gate = "forced"`, so the reading page is never empty.

## Secrets

`COMPANION_KEY` (page access), `EMAIL_API_KEY` (mail send). Mirrored to `~/.env`.

## Version

v1.0.0 - 2026-09-11
