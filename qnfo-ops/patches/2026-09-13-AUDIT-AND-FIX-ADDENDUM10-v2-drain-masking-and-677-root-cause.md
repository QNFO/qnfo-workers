# ADDENDUM 10 — the version_queue drain: 40/40 masked as `ok`, and the error has moved on

Date: 2026-09-13T15:50Z · Author: qnfo-ops / ops-exec
Finds: the root cause of open issue **#677**, already diagnosed by a prior session and still unapplied.
Status: **confirmation + one new observation.**

---

## 1 — Total masking, confirmed

```sql
SELECT status, COUNT(*) n, MIN(ts) first_ts, MAX(ts) last_ts
FROM cloud_ops_events WHERE kind='v2-drain' GROUP BY status;
-- ONE row: status='ok', n=40, 2026-09-03T14:11:10.269Z .. 2026-09-13T09:55:46.687Z
```

**A single GROUP BY row is the proof.** Forty consecutive v2-drain cycles over ten days, **every one
recorded as `status='ok'`**, and not one filed as an error. The payload of each is a failure:

```
19 rows:  [{"ok":false,"stage":"v2","error":"NL is not defined"}]
```

`qnfo-research-exec`'s README: *"Purpose: version_queue drain: Zenodo publishV2 + PDF + KG"*. So the
drain that publishes `version_queue` was throwing a `ReferenceError` on every cycle and reporting
success. **That is open issue #677's root cause**, and it is why the drain "silently stalls; nothing
surfaces."

## 2 — The error has moved on (new)

The two most recent rows are **different**:

| ts | status | text |
|---|---|---|
| **2026-09-13T09:55:46.687Z** | `ok` | `newversion failed: {"_status":504,"_text":"error code: 504\n"}` |
| **2026-09-13T07:45:50.931Z** | `ok` | `newversion failed: {"_status":504,"_text":"error code: 504\n"}` |
| 2026-09-13T05:21:30.947Z | `ok` | `NL is not defined` |
| 2026-09-13T03:11:34.823Z | `ok` | `NL is not defined` |
| … back to 09-03 | `ok` | `NL is not defined` |

**Last `NL is not defined` = 2026-09-13T05:21:30.947Z.** After that, the drain gets far enough to
reach Zenodo and receives a **504**. So the `NL` defect appears to have stopped, and the **current**
blocker is a Zenodo upstream timeout.

This corroborates what I measured on #677 in ADDENDUM 3: `version_queue` id=18 moved
`status='error'` → `status='drafted'`, `recover_count=1`, at **14:05:07Z** — i.e. the drain resumed
and advanced the row. "Self-healing" was the right verdict, but the mechanism is now explained: the
`NL` throw stopped, so the row could progress.

**Caveat:** the repo's `qnfo-research-exec/worker.js` still declares
`VERSION = "0.8.1-quality-gate-fix"`, and the patcher below is unapplied **in the repo**. So either
the fix reached production by a path the repo does not reflect, or the behaviour changed for another
reason. I cannot distinguish these from here.

## 3 — The fix already exists, and it is good

`qnfo-research-exec/apply-research-exec-fix.mjs` (7,602 B, sha `e6639014…`, "Added 2026-09-13 by
qnfo-ops") contains a **deploy-runner patcher** that:

- declares `var NL = String.fromCharCode(10);` at module scope, anchored on the `VERSION` line;
- **proves the insertion is safe** — `var NL` anywhere in module scope would hoist to `undefined`
  (producing the literal text "undefined", not a throw); `let`/`const` would throw
  "Cannot access before initialization". `"NL is not defined"` is ReferenceError for an identifier
  with *no* binding in any enclosing scope, so no declaration can collide. That reasoning is correct.
- **FIX B**: changes `logEvent`'s `status || "ok"` to classify error-signature payloads as
  `status='error'` — the general cure for the masking class;
- **fails closed**: if any anchor does not match exactly once, it writes nothing and exits non-zero;
- is idempotent, with `--check` and `--apply` modes.

It is unapplied, pending a deploy runner. The repo is 80,916 B, so this patcher is the correct
approach — the same conclusion I reached independently for the reaper.

## 4 — The unifying finding of this whole audit

**The fleet's dominant failure mode is error-masking: failures recorded as successes.** Three
independent instances, found in three unrelated places today:

| instance | a failure looks like |
|---|---|
| v2-drain (this addendum) | `status='ok'` + an error payload — 40/40, never an error |
| `qnfo-arxiv-radar` (ADDENDUM 8) | "0 hits, 0 strong candidates" — a 429 as a clean empty scan |
| `qnfo-research-exec` deposits (ADDENDUM 7) | two dead INSERTs inside `try/catch` — silently no record |

Every one of these is invisible to `/health` (which asks only "does it answer?") and to the ticket
advisor (which files from health state). That is why the fleet reported **12/12 healthy** while its
research pipeline had been stalled for days and its publish drain had been throwing for ten.

The single highest-leverage fix is not any individual bug — it is **FIX B**: stop labelling failure
payloads `ok`. It is already written, and it is ten lines.

## 5 — Limits

- I confirmed the masking and the error transition from `cloud_ops_events`. I did **not** read the
  code that emits the v2-drain row, so "the drain throws in `depositToGithub`" is the patcher's
  diagnosis, corroborated by the payload text, not independently traced by me.
- Whether the `NL` fix is actually deployed is **unresolved** (§2 caveat) — the repo disagrees with
  the observed behaviour change.
- Zenodo 504s are a new, separate failure. I did not probe Zenodo, so I do not know whether they are
  transient or systemic.
- `research_scan_log`'s writer remains unidentified (ADDENDUM 9 §4).
- This is the **twelfth** entry in this session's correction series, and the second time the decisive
  evidence was already sitting in the repo — written by a prior session of this same endpoint. The
  lesson is to read the existing `patches/` directories before diagnosing from scratch.
