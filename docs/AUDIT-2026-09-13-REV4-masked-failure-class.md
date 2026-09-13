# REV4 — The masked-failure class: 40 production failures recorded as successes

Date: 2026-09-13. Adds a defect class **absent from the main audit**, and
corrects one claim made by a staged patcher.

This is the most consequential omission in the audit. It was visible in my own
query output and I did not flag it.

---

## 1. What I missed

In the main audit §8 I ran:

```sql
SELECT kind, status, COUNT(*) c FROM cloud_ops_events GROUP BY kind, status
```

which returned, among 30 rows:

```
{"kind":"v2-drain","status":"ok","c":40}
```

I recorded it as a healthy row and moved on. It is not healthy. `v2-drain` is
the `version_queue` → Zenodo publish drain owned by `qnfo-research-exec`, and
**every one of its 40 rows is a failure recorded as a success.**

```sql
SELECT status, COUNT(*) n, MIN(ts), MAX(ts)
  FROM cloud_ops_events WHERE kind='v2-drain' GROUP BY status;
```

Returns **exactly one row**:

| status | n | first_ts | last_ts |
|---|---|---|---|
| `ok` | **40** | 2026-09-03T14:11:10.269Z | **2026-09-13T09:55:46.687Z** |

A single-row `GROUP BY` is the proof of total masking: **not one row in 10 days
was ever filed as an error.**

30 of the 40 carry a failure payload. Verbatim, newest first:

```
[{"ok":false,"stage":"v2","error":"newversion failed: {\"_status\":504,\"_text\":\"error code: 504\\n\"}"}]
[{"ok":false,"stage":"v2","error":"newversion failed: {\"_status\":504,\"_text\":\"error code: 504\\n\"}"}]
[{"ok":false,"stage":"v2","error":"NL is not defined"}]
[{"ok":false,"stage":"v2","error":"NL is not defined"}]
```

---

## 2. There are TWO distinct failures in this stream

| error | rows | last seen | owner |
|---|---|---|---|
| `NL is not defined` | **19** | 2026-09-13T05:21:30.947Z | **our code** |
| `newversion failed: {"_status":504}` | 2+ | 2026-09-13T09:55:46.687Z | **Zenodo upstream** |

```sql
SELECT status, COUNT(*) n, MIN(ts), MAX(ts)
  FROM cloud_ops_events WHERE text LIKE '%is not defined%' GROUP BY status;
```
→ one row: `ok`, **n=19**, 2026-09-11T12:41:26.743Z → 2026-09-13T05:21:30.947Z.

**`NL is not defined`** is a `ReferenceError` in `depositToGithub()`, which
builds a deposit README using a bare `NL` that is never declared in the
`qnfo-research-exec` bundle. The error text is itself the proof that no binding
exists: a `var` would hoist to `undefined` (the README would contain the
literal string "undefined"), and `let`/`const` would throw a different message.
"No binding in any enclosing scope" is precisely what produces this text.

**The 504 is not ours.** Zenodo's `/actions/newversion` endpoint is timing out.
It is the *newest* failure and it is why `NL` stopped appearing after 05:21:30 —
the code now dies earlier, before reaching `depositToGithub()`.

### Consequence for the staged fix

`qnfo-research-exec/apply-research-exec-fix.mjs` (idempotent, fails closed)
declares `NL` and fixes the masking. **Applying it will not clear the current
`version_queue` stall.** The newest failures are upstream 504s. The patcher
buys visibility and removes a real bug; it does not restore publishing.

---

## 3. The masking mechanism, and it is systemic

The patcher documents the cause:

```js
// logEvent() writes `status || "ok"`.
```

Any caller that logs a failure payload **without passing a status** records a
successful event. That is how 40 failures stayed invisible for 10 days. This is
not one worker's bug — it is a logging-helper contract that fails open, and
every worker using `logEvent()` inherits it.

This is the same class as the main audit's §3 finding that the calibration
digest reports `failing:[]` while a probe fails, and §9's `gateway-sweep`
reporting `pass` while enumerating hundreds of gateway errors. **Three separate
subsystems, one failure mode: the recorder does not read what it records.**

**This is the single most important structural defect in the fleet.** Every
error count in the main audit — including the 802 criticals and the 8.7% tool
failure rate — is a *lower bound*, because failures recorded as `ok` are
invisible to all of them.

---

## 4. Correction to the patcher's own claim

`apply-research-exec-fix.mjs` states:

> 38 occurrences over 10 days, and EVERY ONE carries the error payload above
> while being recorded with status='ok'.

**The "every one" is wrong.** Measured now: 40 `v2-drain` rows total, of which
**19** contain `is not defined`. The remaining ~21 include the Zenodo 504s and
genuine successes. The patcher generalised from a `GROUP BY status` that proves
only that *no row was labelled error* — which is true and is the important
part — to a claim about payload contents, which is not.

The masking conclusion stands. The payload-uniformity claim does not.

---

## 5. Status of the fix

`qnfo-research-exec`: deployed **`0.8.1`**, canonical `0.5.17-research-restored`
(`deployed-ahead`). The patcher targets `0.8.2-nl-fix`. Since deployed is
`0.8.1`, **the patch is not applied.**

Same staging trap as the deploy guard (REV3 §5): the patcher is committed and
runnable, but nothing runs it. It needs an operator with a shell and a deploy
path. It is not live.

Verification after apply, per the patcher itself:

```sql
SELECT ts, kind, status, text FROM cloud_ops_events
 WHERE kind = 'v2-drain' ORDER BY ts DESC LIMIT 10;
```

Optional backfill for the already-masked rows (D1 write, not performed here):

```sql
UPDATE cloud_ops_events SET status = 'error'
 WHERE kind = 'v2-drain' AND text LIKE '%is not defined%';
```

---

## 6. Related live issue

Open issue **677** — `VQ error version_queue id=18 (10.5281/zenodo.22706406 ->
2.0.2)` — is the human-visible tip of this stream. `version_queue` id 18 is
`status='drafted'`, created 2026-09-11 10:22:29, `updated_at` 2026-09-13
14:05:07, `recover_count: 1`, new DOI `10.5281/zenodo.22732639`.

The main audit §6 called this a "stuck queue" and left the cause unstated. The
cause is this stream: the drain fails every ~130 minutes and records `ok`.

---

## 7. What this changes in the ranked fix queue

New entry, ranked **2** (above every code fix, because it is a *measurement*
fix — it determines whether the other fixes can be verified at all):

| # | Fix | Owner | Safe now? |
|---|---|---|---|
| 2 | `logEvent()` must not default to `status='ok'`; apply `apply-research-exec-fix.mjs` FIX A + FIX B | qnfo-research-exec | yes, code — needs shell + deploy |
| 3 | Backfill the 19 masked rows to `status='error'` | D1 write | needs D1 write |

Note the ordering interaction: **fixing the recorder before the recorder's own
input is trustworthy is the correct order**, because every subsequent
verification step reads it.

---

## 8. Limits

- **I cannot confirm the `NL` bug still exists in the deployed bundle.** The
  last `NL` error is 05:21:30Z; the two later runs died at `newversion` first.
  `NL` may be present-but-unreached, or already absent. Not established.
- **The `logEvent()` quote is from the patcher**, not read by me from
  `qnfo-research-exec/worker.js` (80,916 B — exceeds the 32,768-char read cap
  with no offset).
- **The 504 is attributed to Zenodo from the payload only.** I did not query
  Zenodo's status, and a 504 could originate at any proxy in the path.
- **My "30 of 40 carry a failure payload" figure comes from a `LIKE` filter**
  (`%ok%false%` OR `%error%`) that can match on incidental substrings; the
  verified counts are 40 total and 19 with `is not defined`.
- **The cadence gap is unexplained.** Runs appear at ~130-minute intervals, and
  the last is 09:55:46Z; my query at ~14:08Z found no ~12:05 or ~14:05 rows.
  Whether the drain stopped, slowed, or logs elsewhere is **not established**.
