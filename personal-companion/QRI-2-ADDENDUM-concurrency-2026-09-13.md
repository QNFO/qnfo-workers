# QRI-2 addendum — root cause of the write races, 2026-09-13

Author: qnfo-ops endpoint. Evidence from `ops_ai_log` (this endpoint's own execution
log, qnfo-audit), read in-session.

## The finding

The QRI-2 record (§5) reported three `GitHub 409` conflicts on
`personal-companion/lib/` paths, each citing a different blob sha for the same file,
and left the writer unidentified. It is now identified: **the concurrent writer was a
duplicate execution of the identical instruction, dispatched through the async job
path.**

`ops_ai_log`, same window:

| id | ts | strategy | source | ok | prompt | latency_ms |
|---|---|---|---|---|---|---|
| `ops-ca07fec37b2d8f` | 06:36:21 | **job-workflow** | **job** | **0** | "Audit and fix all. Execute remediation" | 430,857 |
| `ops-134fbc67786891` | 06:33:20 | **job-workflow** | **job** | **0** | "Audit and fix all. Execute remediation" | 53,685 |
| `ops-7a45db8c7c7acb` | 06:37:47 | agent-tools | mobile | 1 | "Go ahead" | 317,584 |
| `ops-1ae58605755220` | 06:29:57 | agent-tools | mobile | 1 | "Go ahead" | 158,964 |

The two `source: job` entries carry the **same prompt as this session's instruction**.
The mobile `agent-tools` runs succeeded; both job runs returned `ok:0`.

## What this means

1. **The write races were self-inflicted by duplicate dispatch**, not by an unrelated
   actor. Two executions of one instruction edited the same four files concurrently.
   The 409s are the expected symptom.
2. **Both async job runs failed** (`ok:0`) while the synchronous mobile runs succeeded.
   The same work, routed two ways, produced one success path and one failure path. The
   failed run also took 430,857 ms (7.2 min) against a 15-minute Workflow step ceiling,
   so it was not a timeout — it failed for another reason, not established here.
3. **A successful write is not evidence of a single writer.** Both runs could have
   written; the surviving content is whichever landed last. Verified this session: the
   current `lib/gate.js` (sha `150e08b7`) and `lib/voice.js` (sha `29dd0b99`) are the
   QRI-2 revisions **intact** — no competing revision overwrote them.

## Correction to the QRI-2 record

QRI-2 §5 said `gate.js` was "rewritten by another writer between my read and my write
(3,376 → 5,530 bytes)". The revision change is real; the attribution was incomplete.
It was not an unrelated writer — it was the duplicate job execution of this task.
QRI-2 §5's "Not verified: whether that writer is another agent session, a fleet
self-heal pass, or a human" is now resolved: **another agent session, executing the
same instruction via `/v1/jobs`.**

Also retracted: an in-session inference that the current `gate.js`/`voice.js` had been
"built upon" because they were larger than the revisions written here. They are not
extended — they are the revisions written here, byte-for-byte. The inference came from
a rough size estimate and was wrong.

## Remediation implication

Not fixable from this endpoint (no write path to the intent/job queue, and no
dedupe control over dispatch). For whoever owns the job route:

- Deduplicate concurrent execution of an identical instruction, or make the ops write
  path idempotent per (path, revision) so a duplicate run cannot race a live one.
- Investigate why the `job-workflow` route returns `ok:0` for an instruction the
  `agent-tools` route completes successfully.

Until then, any remediation run against `personal-companion/lib/` should expect 409s
and re-read the blob sha immediately before every write, as this session did.
