# REV4 — Masked failures in `v2-drain`: 30 rows, one stream (corrected)

Date: 2026-09-13. Adds a defect class **absent from the main audit**, corrects a
claim made by a staged patcher, and **retracts an inflated figure I published
earlier in this same revision cycle.**

---

## 1. What I missed in the main audit

In §8 I ran:

```sql
SELECT kind, status, COUNT(*) c FROM cloud_ops_events GROUP BY kind, status
```

which returned, among 30 rows:

```
{"kind":"v2-drain","status":"ok","c":40}
```

I recorded it as healthy and moved on. It is not healthy.

```sql
SELECT status, COUNT(*) n, MIN(ts), MAX(ts)
  FROM cloud_ops_events WHERE kind='v2-drain' GROUP BY status;
```

Returns **exactly one row**:

| status | n | first_ts | last_ts |
|---|---|---|---|
| `ok` | **40** | 2026-09-03T14:11:10.269Z | 2026-09-13T09:55:46.687Z |

A single-row `GROUP BY` over 10 days is the proof: **not one row was ever filed
as an error.** 30 of the 40 carry an explicit `"ok":false` payload. Verbatim,
newest first:

```
[{"ok":false,"stage":"v2","error":"newversion failed: {\"_status\":504,\"_text\":\"error code: 504\\n\"}"}]
[{"ok":false,"stage":"v2","error":"newversion failed: {\"_status\":504,\"_text\":\"error code: 504\\n\"}"}]
[{"ok":false,"stage":"v2","error":"NL is not defined"}]
[{"ok":false,"stage":"v2","error":"NL is not defined"}]
```

---

## 2. RETRACTION — I published a figure 40× too high

While quantifying this, I ran a sloppy filter:

```sql
-- WRONG
... WHERE status='ok' AND (text LIKE '%"ok":false%' OR text LIKE '%is not defined%'
                           OR text LIKE '%failed%') GROUP BY kind
```

and got `health` 976, `pipeline-supervisor` 207, `v2-drain` 30, `advisor-audit` 2
— **1,215 of 21,187**, which I described as "fleet-wide."

**That was wrong.** `%failed%` matches *legitimate metric payloads that report
failure counts as data*. Sampled:

```
health:              {"queued":0,"researching":0,"review":0,"failed":2,"published":19,...}
pipeline-supervisor: {"rq":[{"k":"ensemble-draft","n":3},{"k":"failed","n":2},...],...}
```

In both, `failed` is the **value being reported**, and `status='ok'` correctly
means "the probe ran." There is no masking.

The precise discriminator is the literal JSON marker:

```sql
SELECT kind, COUNT(*) masked FROM cloud_ops_events
 WHERE status='ok' AND text LIKE '%"ok":false%' GROUP BY kind ORDER BY masked DESC;
```

**Result: one row — `v2-drain`, 30.**

```sql
SELECT COUNT(*) total_ok,
       SUM(CASE WHEN text LIKE '%"ok":false%' THEN 1 ELSE 0 END) genuinely_masked
  FROM cloud_ops_events WHERE status='ok';
```

**Result: `total_ok` 21,216, `genuinely_masked` 30 — 0.14%.**

`advisor-audit`'s 2 also evaporate under the precise filter (0 matches). They
were false positives too.

---

## 3. Corrected scope — one stream, not the fleet

| claim | status |
|---|---|
| "1,215 masked rows / 5.7% / fleet-wide" | **RETRACTED — bad filter** |
| Genuine masking | **30 rows, all `kind='v2-drain'`, 0.14% of ok rows** |
| Other kinds masking failures as `ok` | **none detected** |

I also claimed this was "the single most important structural defect in the
fleet" and that "every error count in the main audit is a lower bound."
**Both withdrawn.** The masking is confined to one worker's drain stream. The
main audit's other counts are not inflated by this mechanism.

The distinction matters: `gateway-sweep` reporting `pass` while listing gateway
errors (main audit §3) and the calibration digest reporting `failing:[]` while a
probe fails (§3) are **real** findings — but they are *probe-level* defects where
the probe returns the wrong verdict. They are not the `logEvent()` status-default
bug, and they do not share a root cause with it. I had conflated three unrelated
defects into one "systemic" claim.

---

## 4. There are TWO distinct failures in this stream

| error | rows | last seen | owner |
|---|---|---|---|
| `NL is not defined` | **19** | 2026-09-13T05:21:30.947Z | **our code** |
| `newversion failed: {"_status":504}` | 2+ | 2026-09-13T09:55:46.687Z | **Zenodo upstream** |

```sql
SELECT status, COUNT(*) n, MIN(ts), MAX(ts) FROM cloud_ops_events
 WHERE text LIKE '%is not defined%' GROUP BY status;
```
→ one row: `ok`, **n=19**, 2026-09-11T12:41:26.743Z → 2026-09-13T05:21:30.947Z.

**`NL is not defined`** is a `ReferenceError` in `depositToGithub()`, which
builds a deposit README from a bare `NL` never declared in the
`qnfo-research-exec` bundle. The error text is itself the proof that no binding
exists: `var` would hoist to `undefined` (the README would contain the literal
string "undefined"), `let`/`const` would throw a different message. "No binding
in any enclosing scope" is precisely what produces this text.

**The 504 is not ours.** Zenodo's `/actions/newversion` is timing out. It is the
newest failure and explains why `NL` stopped appearing after 05:21:30 — the code
now dies earlier, before reaching `depositToGithub()`.

### Consequence for the staged fix

`qnfo-research-exec/apply-research-exec-fix.mjs` (idempotent, fails closed)
declares `NL` and fixes the status default. **Applying it will not clear the
current `version_queue` stall** — the newest failures are upstream 504s. The
patcher buys visibility and removes a real bug; it does not restore publishing.

---

## 5. Correction to the patcher's own claim

`apply-research-exec-fix.mjs` states:

> 38 occurrences over 10 days, and EVERY ONE carries the error payload above
> while being recorded with status='ok'.

**The "every one" is wrong.** Measured: 40 `v2-drain` rows, of which **19**
contain `is not defined` and **30** carry `"ok":false`. The rest are the Zenodo
504s and genuine successes. The patcher generalised from a `GROUP BY status`
that proves only that *no row was labelled error* — true, and the important part
— to a claim about payload contents, which is not.

The masking conclusion stands. The payload-uniformity claim does not.

---

## 6. Status of the fix

`qnfo-research-exec`: deployed **`0.8.1`**, canonical `0.5.17-research-restored`
(`deployed-ahead`). The patcher targets `0.8.2-nl-fix`, so **it is not applied.**

Same staging trap as the deploy guard (REV3 §5): committed and runnable, but
nothing runs it. It needs an operator with a shell and a deploy path.

Verification after apply:

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

## 7. Related live issue, and one that cleared

Open issue **677** — `VQ error version_queue id=18 (10.5281/zenodo.22706406 ->
2.0.2)` — is the human-visible tip of this stream. `version_queue` id 18 is
`status='drafted'`, created 2026-09-11 10:22:29, `updated_at` 2026-09-13
14:05:07, `recover_count: 1`, new DOI `10.5281/zenodo.22732639`.

**Positive result — the intake stall cleared during this session.** The `health`
payload moved between two readings:

| ts | intake_new | triaged |
|---|---|---|
| 2026-09-13T13:46:01.043Z | **496** | 62 |
| 2026-09-13T14:01:22.793Z | **0** | **558** |

496 pending proposals were triaged into the hold set (558) within ~15 minutes.
The `INTAKE-STALL escalated -> agent_issues dup: 496 proposals stuck new` alert
(×24 criticals) should therefore stop firing. `failed:2` persists in the same
payload, consistent with the two terminal research failures.

---

## 8. Limits

- **I cannot confirm the `NL` bug still exists in the deployed bundle.** The last
  `NL` error is 05:21:30Z; the two later runs died at `newversion` first. `NL`
  may be present-but-unreached, or already absent. Not established.
- **The `logEvent()` quote is from the patcher**, not read by me from
  `qnfo-research-exec/worker.js` (80,916 B — exceeds the 32,768-char read cap
  with no offset).
- **The 504 is attributed to Zenodo from the payload only.** I did not query
  Zenodo's status; a 504 could originate at any proxy in the path.
- **"30 carry a failure payload" comes from the `"ok":false` marker**, which is
  the reliable discriminator; the verified hard counts are 40 rows total, 30 with
  `"ok":false`, 19 with `is not defined`.
- **The cadence gap is unexplained.** Runs appear at ~130-minute intervals and
  the last is 09:55:46Z; my query at ~14:08Z found no ~12:05 or ~14:05 rows.
  Whether the drain stopped, slowed, or logs elsewhere is **not established**.
- **I published an inflated figure in this revision cycle** (§2). It was caught
  by re-running with a precise discriminator, in the same session, before the
  audit was finalised — but it should not have been written at all. A
  `LIKE '%failed%'` filter over a column of mixed JSON payloads is not a
  measurement.
