# ADDENDUM — the draft-persistence question is closed (proven), and a one-line fix

Author: qnfo-ops, 2026-09-13. Addendum to
`personal-companion/FINDING-2026-09-13-publish-stall-thin-anchors.md` §2.1.

§2.1 named a discriminating test — capture two consecutive rejected drafts and compare them
byte-for-byte — and left it as future work. **That test cannot be run.** I checked every candidate store
rather than assuming, and the composed body is discarded on rejection.

## 1. Elimination, across all 26 tables in `personal-life`

| candidate | what it actually holds | verdict |
|---|---|---|
| `companion_runs.detail` | short strings only — `composed 3516`, `context 7000/3947/3558`, `validate: unverified names: …` | **length, not text** |
| `companion_pieces` | published pieces only (7 rows) | rejected drafts absent |
| `debug_progress` | **5 rows, all 2026-08-04T10:58:16Z** — a one-off debug table, 5.5 weeks stale | not a draft store |
| `chat` | 8,162 rows, `model="personal-twin-chat"`, `source="personal-api"` — the twin's log. The window from 04:00Z is **6 pairs of `Reply with exactly: OK`** (len 22 / len 2), i.e. health probes | not the compose path |
| `files` / `chunks` | d-drive file index (`path`, `type`, `size`, `chunks`, `wbs`) | not applicable |
| `media_objects` | 7 rows, last 2026-09-10T09:36Z | not applicable |
| `queries` | `id, ts, model, source, thread, prompt_tokens, completion_tokens, latency_ms` — **no content column** | metadata only |

So the only durable trace of a rejected draft is **its character count**. The `3516, 3516, 3516` signature
is the strongest available evidence that the three retries were the same text, and it is unverifiable
after the fact — and will be equally unverifiable for every future occurrence.

## 2. The fix: one line, using a helper that already exists

`sha16()` is already defined in `personal-companion/worker.js` (confirmed in the readable window — it
SHA-256s the input and returns the first 8 bytes as hex). The compose step already writes the length
into `companion_runs.detail`. Append the hash:

```
before:  detail = "composed " + body.length
after:   detail = "composed " + body.length + " sha=" + (await sha16(body))
```

Then a non-converging retry is **provable from `companion_runs` alone**:

- three identical `sha=` values → the loop is re-validating the same text; the retry budget is wasted
  and the fix belongs in the retry condition (stop when attempt *n+1* matches attempt *n*).
- three *different* `sha=` values with an identical length → the replay hypothesis is **falsified**, and
  the cause is something else. That is the more useful outcome, and it is the reason to log the hash
  rather than assume the conclusion.

**Anchoring note for the deploy actor:** `sha16()` is in the readable portion of `worker.js`, but the
compose detail-writing call site is **not** (past the 32,768-char read ceiling). The anchor to search for
is the literal `"composed "`, which appears in the run log as `composed 3516`.

Optional, larger: also persist the rejected body (or its first ~500 chars). The hash is enough to answer
the convergence question and costs one function call; the body would answer *why*, and is a design
decision about retaining rejected output.

## 3. The general defect this exposes

The pipeline records **what stage it reached and how long the output was**, but not enough to diagnose a
rejection after the fact. Every one of the three prior artifacts on this pipeline — including my own —
could only reason about *why* a piece was rejected from the validator's error string. That is an
observability gap, not a data gap: the run log is the right place, it just carries the wrong payload.

Two consequences worth stating:

1. Any future "the gate rejected everything" incident will be diagnosed the same way — from error text
   and inference, never from the artifact itself.
2. The same gap applies to the successful path: nothing verifies that a *published* piece matches what
   the validator approved, so a divergence between validated text and stored text would be invisible.

## 4. Unchanged

`companion_pieces.id=8` still serves the defective text on `reading.q08.org`; `QRI-4` is staged, verified,
not applied. The thin-anchor root cause and the "do not weaken the validator" recommendation in the
parent finding stand — this addendum only closes its open question and specifies the instrumentation.
