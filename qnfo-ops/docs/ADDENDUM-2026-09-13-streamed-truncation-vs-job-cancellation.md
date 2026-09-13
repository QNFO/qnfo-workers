# ADDENDUM — "ctx.waitUntil killed mid-generation": the symptom is on the streaming path, not the async job path

Date: 2026-09-13 · Author: qnfo-ops · Evidence: live `ops_d1_query` + `github_repo_read` returns from this session.
Parent: `docs/FIX-reasoning-content-replay-2026-09-13.md` (F14), `patches/2026-09-13-async-job-addendum2-poll-auth-and-continuing-freeze.md` (D17).
Revision 2 — adds §3a (sweeper attribution, identified after revision 1 was committed).

---

## 1 — The question

> "reasoning models with a separate `reasoning_content` field — `ctx.waitUntil` is being killed mid-generation"

Two claims bundled. They are **two different defects on two different code paths**, and the second one is not where the evidence points.

## 2 — `reasoning_content`: verified, root-caused, still latent (F14 / issue 707)

Re-measured independently this session. Precise error-row count:

```sql
SELECT COUNT(*), MIN(ts), MAX(ts) FROM ops_ai_log
 WHERE ok=0 AND response LIKE '%JOB_ERROR: deepseek round 0 failed%';
-- 6 | 2026-09-12T11:50:01.275Z | 2026-09-12T13:27:59.295Z
```

The six `ops_jobs` rows all have `response=''` **and** `error=''` — confirmed row-for-row, same ids as the parent doc's table (`dab978f5`, `b35176b8`, `4053ae89`, `239189cb`, `611757757`, `772fe9ff`), elapsed 16–23 s, `round 0 failed` so no tool ran. **Zero occurrences on 2026-09-13** — the parent doc's §7 discriminator (09-13 jobs carry the `rc` placeholder, not real content) holds as an *observation*.

**Correction to the parent doc's evidence count.** It cites "`ops_ai_log` rows matching `%reasoning_content%`: 43" as the defect count. That filter is contaminated: `ops_ai_log.response` also stores ordinary answer text, and answers that *discuss* the field match. Split:

| filter | n |
|---|---:|
| `ok=0 AND response LIKE '%reasoning_content%'` | 37 |
| `ok=0 AND response LIKE '%JOB_ERROR: deepseek round 0 failed%'` | **6** |
| `ok=1 AND response LIKE '%reasoning_content%'` | 11 |

The 11 `ok=1` rows include this session's own answers. **The error count is 6, not 43.** Use the `JOB_ERROR` string, not the field name.

**`ops_jobs.payload` stores only the placeholder** `[reasoning omitted upstream; tool call decision only]`, so the runner has nothing real to pass back. Candidate fix (a) in the parent doc ("pass it back") is therefore **not available without also changing what the runner persists.**

## 3 — The `cancelled` cohort is NOT a mid-generation kill

This is the load-bearing falsification. 40 rows `status='cancelled'`, and:

```sql
SELECT COUNT(*) n,
       SUM(response LIKE '%Poll GET%')             ends_with_poll_instruction,
       SUM(response LIKE '%chain depth%')          states_chain_depth,
       SUM(response LIKE '%INCOMPLETE:%')          has_incomplete_trailer
  FROM ops_jobs WHERE status='cancelled';
-- 40 | 40 | 40 | 37
```

**All 40 responses are complete.** Every one ends with a deliberate continuation instruction — `"... (chain depth N/6). Poll GET https://qnfo-ops.q08.workers.dev/v1/jobs/job-<successor>."` — and 37 of 40 carry an `INCOMPLETE:` trailer. Nothing is truncated mid-token. Response lengths 3,199–7,512 chars.

They are the **self-chaining** jobs (depth 2/6 through 6/6), each spawning a full tool-enabled successor — issue 779. What never happened is the **terminal status write** (D17 exactly: "a chain-midpoint row whose successor was spawned but which was never marked `succeeded`"). Then a sweeper bulk-labelled them.

| sweep instant | rows | label | oldest job age | **newest job age** | created-span |
|---|---:|---|---:|---:|---:|
| `2026-09-13T14:41:28Z` | 10 | error=`P0 fleet-audit: runaway self-chaining job` | 9.3 min | **146 s** | 6.8 min |
| `2026-09-13 14:35:31` | 30 | no error recorded | 37.4 min | **27 s** | 37.0 min |
| `2026-09-13T13:51:35.662Z` | 35 | (promoted to `succeeded`) | 442.5 min | **128 s** | 440.4 min |

**Every sweep kills jobs seconds-to-minutes old.** No 20-minute or 45-minute staleness threshold can produce a 27-second-old victim. So the sweeps are **not** age-threshold reapers. This also **falsifies the "~20 minute reaper" hypothesis** recorded for the 13:51 sweep — its newest victim was 2.1 min old.

## 3a — The 30-row sweep is IDENTIFIED: it is an agent's unfiltered SQL, not a reaper

`cloud_ops_events` holds the writer's own logged statement. At **`2026-09-13T14:35:31.481Z`**, from a concurrent `job: qnfo-ops` session, via the endpoint's own `ops_d1_write`:

```json
{"args":{"db":"audit",
         "sql":"UPDATE ops_jobs SET status='cancelled', updated_at=datetime('now') WHERE status='continuing'"},
 "resultOk":true,"ms":353}
```

That single statement explains every property measured in §3:

| observation | explanation |
|---|---|
| 30 rows at one instant | `WHERE status='continuing'` matched every `continuing` row (30 of them) |
| `updated_at` = `2026-09-13 14:35:31` | literally `datetime('now')` in the SQL — SQLite format, not `toISOString()` |
| **no `error` recorded** | the UPDATE sets only `status` and `updated_at`; it never writes `error` |
| **newest victim 27 s old** | there is **no age predicate at all** — age is irrelevant to the statement |
| 353 ms | batch update, one statement |

**There is no threshold and no reaper for this path. An agent session mass-cancelled 30 in-flight generations with a bare `WHERE status='continuing'`.** That is the mechanism behind issue 779's "every fix races every other fix" — a peer agent's housekeeping terminated live work, with no lock and no coordination.

**The 10-row sweep at `2026-09-13T14:41:28Z` remains UNIDENTIFIED.** Its writer is *not* logged: no `ops_d1_write` in `cloud_ops_events` carries it, and the only `kind='fleet-audit'` event today (`2026-09-13 14:30:03`) is about cron pruning (PR 5), unrelated. It writes an ISO-8601 timestamp without milliseconds, which no tool observed in this fleet produces. Candidates, not distinguished: an in-worker path in a deployed worker, or a holder of direct D1 credentials. `qnfo-ops-jobs-reaper/worker.js` is **not deployed** — absent from the 55-worker fleet, and its own `FINDING-reaper-is-redundant.md` says do not deploy it.

Correlated, not causal: cancelled jobs carry **1.57×** the average payload of succeeded ones (620,358 vs 394,870 chars), and of the 102 jobs >500 KB, **32.4%** were cancelled vs **18.9%** baseline (**1.71×** risk). Cancelled jobs also had *longer* partial responses than successes (4,449 vs 3,151 chars) — i.e. they were still producing output.

## 4 — Where the mid-generation kill actually is: `streamed=1 AND ok=0`

```sql
SELECT source, streamed, ok, COUNT(*) n, MIN(ts), MAX(ts) FROM ops_ai_log
 WHERE ok=0 GROUP BY source, streamed, ok;
-- other  | 0 | 0 | 35 | 2026-09-05T20:35:22.067Z | 2026-09-12T12:37:24.140Z
-- job    | 0 | 0 | 32 | 2026-09-12T11:50:01.275Z | 2026-09-13T07:26:40.275Z
-- other  | 1 | 0 |  5 | 2026-09-05T02:42:28.262Z | 2026-09-06T04:33:26.836Z
-- mobile | 1 | 0 |  3 | 2026-09-11T13:52:31.891Z | 2026-09-12T13:25:45.360Z
-- chatbox| 1 | 0 |  1 | 2026-09-09T08:00:07.889Z | 2026-09-09T08:00:07.889Z
```

The 9 `streamed=1, ok=0` rows, decomposed — because the average length (159 chars) is **an artifact of error strings occupying the `response` column, not evidence of truncation**:

| ts | source | rlen | response text |
|---|---|---:|---|
| 2026-09-05T02:42:28.262Z | other | 206 | `ops agent error: deepseek 400: {…reasoning_content…}` |
| 2026-09-05T02:42:53.782Z | other | 206 | same 400 |
| 2026-09-05T18:15:57.587Z | other | 206 | same 400 |
| 2026-09-06T04:33:20.395Z | **other** | 82 | **`Unterminated string in JSON at position 5496 (line 1 column 5497)`** |
| 2026-09-06T04:33:26.836Z | other | 47 | `deepseek 520: error code: 520` |
| 2026-09-09T08:00:07.889Z | chatbox | 206 | same 400 |
| 2026-09-11T13:52:31.891Z | **mobile** | 82 | **`Unterminated string in JSON at position 1437 (line 1 column 1438)`** |
| 2026-09-11T13:52:31.893Z | mobile | 41 | **`Network connection lost.`** |
| 2026-09-12T13:25:45.360Z | mobile | 358 | 400 + SHAPES tail, ends `…assistant[tc3,rc1251]\|tool\|tool\|tool\|assistant\|assistant` |

**`Unterminated string in JSON at position N` is the signature of a stream severed with a JSON chunk in flight.** The 09-11 pair is 2 ms apart: the same request produced an unterminated-JSON parse failure *and* a connection-lost. That is the closest thing in this D1 to "killed mid-generation."

**Issues 463 and 464 already cover these two signatures — both were closed `wontfix`, and both have been REOPENED on this evidence**, because the signature recurred twice *after* that closure (09-11 and 09-12, both `mobile`; a position-5496 closure does not cover a position-1437 recurrence).

## 5 — Discrimination NOT achieved (the honest limit)

A server-side `ctx.waitUntil` termination and a **client disconnect** produce the *identical* signature. These rows cannot separate them.

- `source='mobile'` for 2 of the 3 truncation instances is a point **against** the server-side theory — mobile clients drop connections constantly.
- But the 2026-09-06T04:33:20.395Z instance carries `source='other'` (not client-originated) with the same unterminated-JSON signature, which supports a non-client cause.

What would settle it: a streamed truncation whose `source` is a cron/job (server-initiated) **and** which is correlated with a concurrent worker invocation ending. Not available from these tables. **The user's diagnosis is not confirmed; it is not refuted either — it is located on the streaming path and left there with the discriminator named.**

## 6 — `ops_ai_log.ok` is not an error flag

Of the 26 `ok=0` rows on 2026-09-13, **18 contain `INCOMPLETE:`**, **0 have an empty response**, and the average length is **3,575 chars** — longer than the `ok=1` average (2,970). These are complete, substantive answers logged as failures. Any monitor keying on `ok` reports false failures. Do not use `ok` alone as a health signal.

Same class of trap in `cloud_ops_events`: all three `v2-drain` HTTP-504 rows carry `status='ok'`, because the worker logs a *failed stage* as a *successful event*. Monitors keying on that column cannot see them.

## 7 — Recommended actions (none executable from this endpoint)

1. **`heartbeat_at` column**, written once per tool round by the runner. `qnfo-ops-jobs-reaper/worker.js`'s own WARNING block names this as the real fix: *"`ops_jobs.updated_at` is NOT a heartbeat … a short threshold therefore REAPS LIVE JOBS."* Verified schema: `ops_jobs` has **neither `heartbeat_at` nor `terminal_at`**.
2. **Stop agents issuing unfiltered `UPDATE ops_jobs … WHERE status='continuing'`.** This is the identified 30-row kill path (§3a). No threshold fix helps; the statement has no predicate to tune. Any agent-side job maintenance should carry an age/`terminal_at` predicate and a lock.
3. **Identify the 10-row sweep's writer** (§3a). Until then, no change to job lifecycle is safe.
4. **`terminal_at`** so sweep-assigned terminals are distinguishable from real ones.
5. **F14**: persist real `reasoning_content` (or stop implying thinking mode on replay). Currently the payload stores only a placeholder, so "pass it back" is not implementable as-is.
6. **463/464 reopened**; treat the streamed-truncation class as live until the discriminator in §5 is resolved.

Blocked on: no deploy verb on this endpoint; `qnfo-ops/worker.js` is 161,339 B against a 32,768-char read cap with no offset, so no contents-API full-file write.

## 8 — Self-corrections in this addendum

- I first read the 9 streamed failures' 159-char average as *"the signature of a stream cut short."* **The next query falsified it** — the short length is error strings in the `response` column. Same error class as the rest of this session: substituting a related metric for the metric under test.
- **Revision 1 of this file asserted that *both* sweepers were unidentified. That was wrong for the 30-row path.** The writer's own SQL is in `cloud_ops_events`; I had searched `text` for the label instead of `meta` for the statement, and the label only exists in `ops_jobs.error`. §3a is the correction.
- The parent doc's "43 occurrences" is an overcount; the error count is 6.
- The "~20 minute reaper" hypothesis for the 13:51 sweep does not survive the age span (newest victim 128 s).
- I did **not** file a new ticket for F14 — issue **707** already carries it, with the same window and the same "ZERO occurrences on 2026-09-13" conclusion. Filed nothing rather than a 4th duplicate.
