# ADDENDUM 2 — the 6,969 "gateway failures" are ONE window replayed 47×; my count was 47× inflated

Date: 2026-09-13T14:20Z · Author: qnfo-ops / ops-exec
Corrects: §6 of `2026-09-13-AUDIT-AND-FIX-consolidated.md` (sha `625fb64b…`) **and** §2–3 of
`2026-09-13-AUDIT-AND-FIX-ADDENDUM1-error-classes.md` (sha `c02de7a3…`)
Status: **corrective.** Two figures I published are wrong. Both are withdrawn.

---

## 1 — The decisive measurement

```sql
SELECT COUNT(*) rows_24h, COUNT(DISTINCT model||'|'||status) distinct_classes,
       COUNT(DISTINCT sample_detail) distinct_samples, COUNT(DISTINCT ts) distinct_sweeps
FROM ai_gateway_failures WHERE ts > (unixepoch('now')-86400)*1000;
-- 373 | 8 | 9 | 47
```

**373 rows. 9 distinct `sample_detail` values. 47 distinct sweep timestamps.**

Then, grouping by the AiError request UUID embedded in `sample_detail`:

| request UUID | model | status | distinct sweeps | rows |
|---|---|---|---|---|
| `3319680e-b7ff-4ce2-8487-01609d595f48` | `@cf/moonshotai/kimi-k2.6` | 429 | **47** | 47 |
| `4e9a2549-dcf2-4a27-a847-ed160f2e406a` | `@cf/zai-org/glm-5.2` | 429 | **47** | 47 |
| `763b6fc6-4398-486d-b9eb-a234a232bf34` | `@cf/moonshotai/kimi-k2.7-code` | 429 | **47** | 47 |
| `d974d123-c3e5-428a-9ee6-3b…` | `@cf/google/gemma-4-26b-a4b-it` | 400 | **46** | 46 |

**The same four failed requests, with byte-identical Cloudflare request UUIDs, were re-inserted
on 47 separate sweeps.** One failure event, 47 rows.

## 2 — What that does to my numbers

The `SUM(count)` I reported as "6,969 failures / 24h" is **47 × the real figure**. The underlying
window contains roughly **148 failed requests** (6969 ÷ 47), and — critically — it is **not a 24-hour
window at all**. It is one stale window re-read every 30 minutes, so the "24h" label was wrong too.

| I published | Actually |
|---|---|
| "6,969 gateway failures / 24h" | ~148 failed requests in a single replayed window |
| "`bge-base-en-v1.5` is 52.2% of **every failure in the fleet**" | 52.2% of a replayed count; the "fleet" denominator does not exist |
| "429 = 4,058 (58.2%), 400 = 2,911 (41.8%)" | **proportions survive** (same window, so the ratio is real); the magnitudes do not |

The error-class *split* is still informative — it is computed within one window and is internally
consistent. Everything expressed as a rate, a total, or a share-of-fleet is withdrawn.

## 3 — `source` is a hardcoded literal, so my "single source" claim was an artifact

From `qnfo-ai-calibration/worker.js`, verbatim:

```js
await env.QNFO_AUDIT.prepare(
  "INSERT INTO ai_gateway_failures (ts, model, status, count, error_class, sample_detail, source)
   VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'qnfo-ai-calibration')"
).bind(...)
```

`source` is the **string literal `'qnfo-ai-calibration'`** — the *sweeper*, not the originator of the
failing request. My statement that "all 6,969 failures come from a single source,
`qnfo-ai-calibration`" therefore identifies the observer, not the observed. **Withdrawn.**
The originator is not recorded anywhere in this table and cannot be recovered from it.

## 4 — This is the real reason the drain closes 0, and the tickets are unclosable

The parent doc explained the drain's `closed: 0` as "all 12 are real defects". The actual mechanism
is the replay defeating the auto-close, in the sweeper's own logic:

```js
var recent = await env.QNFO_AUDIT.prepare(
  "SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2"
).bind(modelPart, t0 - 24*3600*1000).first();
if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");
```

Because every sweep re-inserts the same buckets with a fresh `ts`, `recent.c` is **always > 0**.
The auto-close can never fire. The 8 open `[gw-fail]` tickets (#678–#684) are **structurally
unclosable** — not because the defects persist, but because the replayed window keeps refreshing
the evidence. The drain's re-probe note, *"gateway failures CURRENT: 845/24h - real defect, root
fix pending"*, is reading duplicated rows and misattributing the reason it cannot close them.

**Consequence for triage: these 8 tickets should not be treated as 8 live defects.** The correct
action is to fix the sweep (RC-1), let the window stop refreshing, and then let the auto-close work.

## 5 — Independent confirmation of RC-1 from a different endpoint

RC-1 in `qnfo-ai-calibration/patches/2026-09-13-gw-sweep-replay-and-health-namespace.md` documented
this from a prior session, citing identical UUIDs. I did not read that patch before publishing my
own counts, and I have now re-derived the same conclusion from live data **and matched its four
UUIDs exactly** (`3319680e`, `4e9a2549`, `763b6fc6`, `d974d123`). Two sessions, two endpoints, same
evidence — this is the strongest result in the whole audit, and it was already known.

The fix is already written there (a `gw_sweep_last_sig` signature guard that suppresses a sweep
identical to the previous one, plus switching the auto-close to `DISTINCT ts`). It is staged and
**unapplied**.

## 6 — What I got right, for the record

- `content-shape` on `qwen2.5-coder-32b-instruct` really is a request-shape bug: the captured error
  is `oneOf at '/' not met, 0 matches: required properties at '/' are 'prompt'` — a caller sending
  `messages` to a model that requires `prompt`. That diagnosis stands.
- The `ai_model_health` two-row namespace split is real and is RC-2 (already documented).
- D17, D19, D20, D21 findings are unaffected — they come from `ops_jobs` and `ops_ai_log`, not from
  `ai_gateway_failures`.

## 7 — Limits

- `SUM(count)` divided by 47 assumes every sweep reports the same window. 46 vs 47 sweeps for the
  gemma row shows it is *nearly* constant, not exactly — so ~148 is an estimate, not a count.
- The 9 distinct `sample_detail` values include classes with no request UUID (e.g. bge-base's
  `"Rate limited"`), which the UUID grouping cannot see. The true distinct-event count is ≥ 9 and
  ≤ ~148; I cannot bound it more tightly from this table.
- I did not read the AI Gateway logs API to verify that `start_time` is ignored — I infer it from
  the replayed UUIDs. That inference is strong but it is an inference.
- This is the **fourth** correction I have issued against my own published figures in one session
  (3,000-byte cap, missing issue ledger, "routing-table entries", now the 47× replay). The pattern
  is constant: I published from a single aggregate without running the counter-query that would
  falsify it. Every number in the parent documents should be re-derived before it is relied on.
