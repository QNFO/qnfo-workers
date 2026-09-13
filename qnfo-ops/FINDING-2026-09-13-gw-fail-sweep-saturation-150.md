# FINDING — the gw-fail sweep measures its own page cap (150), not failure volume

Date: 2026-09-13T14:12Z · Author: qnfo-ops / ops-exec
Method: read `qnfo-ai-calibration/deployed-current.worker.js` (sha `3624a4da`, VERSION **1.1.4**,
33,551 B — 32,768 readable, tail truncated) + live `qnfo-audit` counter-queries.

## 0. Two claims tested first

**(a) The `github_repo_read` cap is real and cannot be raised.**
Requested `maxChars: 100000` on a 33,551-byte file. The tool returned **32,768 chars** and appended
its own marker: `...(truncated to 32768 chars)`. The cap is therefore **empirical, not assumed**,
and `maxChars` does not lift it. There is no offset/range parameter, so bytes 32,769-33,551 of any
over-cap file are unreachable from this endpoint.

**(b) The gw-fail counts are not a volume measure.** Proven below.

## 1. The mechanism, read from source

`gatewayFailureSweep(env, t0)` in `qnfo-ai-calibration`:

```js
var limit = 3;
for (var page = 1; page <= limit; page++) {
  var r = await jfetch(env, CATALOG + "/ai-gateway/gateways/default/logs?per_page=50&page="
    + page + "&success=false&start_time=" + encodeURIComponent(startIso), {...});
  if (r.status !== 200 || !r.data || !Array.isArray(r.data.result)) break;
  var arr = r.data.result;
  if (!arr.length) break;
  for (var i = 0; i < arr.length; i++) { /* bucket by status + model, count++ */ }
  rows = rows.concat(arr);
  if (arr.length < 50) break;
}
```

**Hard ceiling: `per_page=50` x `limit=3` pages = 150 rows per sweep.** The bucket counts are a
census of *the first 150 failed rows the API returns*, not the number of failures that occurred.
`start_time` is passed but the result set does not advance (see §2).

## 2. Live confirmation: every bucket is frozen, and they sum to exactly 150

```sql
SELECT model, status, COUNT(*) sweeps, MIN(count) min_c, MAX(count) max_c
FROM ai_gateway_failures
WHERE ts > (CAST(strftime('%s','now') AS INTEGER)*1000 - 86400000)
GROUP BY model, status ORDER BY sweeps DESC;
```

| model | status | sweeps | min_c | max_c |
|---|---|---:|---:|---:|
| @cf/moonshotai/kimi-k2.6 | 429 | 47 | 6 | **6** |
| @cf/moonshotai/kimi-k2.7-code | 429 | 47 | 2 | **2** |
| @cf/qwen/qwen2.5-coder-32b-instruct | 400 | 47 | 42 | **42** |
| @cf/qwen/qwen3.8-27b | 400 | 47 | 18 | **18** |
| @cf/zai-org/glm-5.2 | 429 | 47 | 1 | **1** |
| @cf/baai/bge-base-en-v1.5 | 429 | 46 | 79 | **79** |
| @cf/google/gemma-4-26b-a4b-it | 400 | 46 | 1 | **1** |
| @cf/zai-org/glm-5.2 | 400 | 46 | 1 | **1** |

**`min_c == max_c` in all 8 buckets across 46-47 consecutive sweeps.** Not one bucket varied by a
single unit in ~23 hours.

Sum of `max_c` = 6+2+42+18+1+79+1+1 = **exactly 150** = `per_page(50) x limit(3)`.

That is the whole finding. The counts are **saturated at the page cap**, so:

1. The numbers cannot distinguish a burst of 200 failures from a steady 150 — both return 150 rows.
2. `SUM(count)` over sweeps is meaningless. The bge-base figure of **3,635** is `79 x 46 sweeps` —
   one frozen census re-inserted 46 times, not 3,635 failures.
3. `start_time` is passed and `gw_sweep_last_ts` **is** advanced at the end of each sweep
   (`INSERT INTO ai_calibration_config (key,value) VALUES ('gw_sweep_last_ts', ?1)
   ON CONFLICT(key) DO UPDATE SET value = ?1`), yet the result set is identical. **Leading
   hypothesis: the gateway logs endpoint ignores `start_time` for failed-request queries.**
   Not proven — the alternative (logs lag > 45 min) fits the same evidence. The saturation alone
   is proven; the cause of non-advancement is not.

## 3. Why the `[gw-fail]` tickets still never self-close (partially corrected)

The end-of-sweep close path:

```js
var recent = await env.QNFO_AUDIT.prepare(
  "SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2")
  .bind(modelPart, t0 - 24*3600*1e3).first();
if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");
```

Each sweep INSERTs rows stamped `ts = t0` (now). So for any model still present in the sweep, the
24 h count is never 0 and the close never fires.

**Correction to my own earlier phrasing ("immortal").** The close path *can* fire — for a model that
drops **out** of the 150-row window for >24 h, its rows age out and the count reaches 0. It cannot
fire for a model permanently inside the saturated window (`bge-base` at 79 x 46 sweeps is exactly
that case).

**Why the backlog is nonetheless clean.** Two other paths mask it:

1. A disposition guard skips re-filing:
   ```js
   var dispo = await env.QNFO_AUDIT.prepare(
     "SELECT id FROM agent_issues WHERE title LIKE ?1 AND status IN ('wontfix','closed','resolved') LIMIT 1")
     .bind("%" + b.model + "%").first();
   if (dispo) continue;
   ```
2. The backlog-exec ledger reconciler (`ledgerResolved: 183` in this session's drain).

Live `agent_issues` state for `%gw-fail%`: **resolved 21 · wontfix 15 · closed 2 · open 0.**
So the tickets are all disposed, and none can be re-filed — while the underlying condition
(the saturated sweep) is untouched.

## 4. Other source facts established while reading

- `qnfo-ai-calibration` probes this endpoint via a **service binding**:
  `probeEndpoint(env, "qnfo-ops/ops-exec", "https://qnfo-ops.internal/v1/chat/completions", env.OPS_KEY, {...}, "QNFO_OPS")`.
  `.internal` is correct **with** a binding — the failure mode is plain `fetch()` to `.internal`
  (CF 1016/530), not the hostname itself.
- `ai_model_health.status` is written by **this worker** (`upsertHealth` -> `ok` / `degraded` /
  `failing`), as are `ctx_override` / `vision_override` / `reasoning_override` (`setOverrides`).
  So the `ai_model_health` rows reflect *sweep outcomes*, not independent probes — which is why 25
  rows can share one `updated_at` while reporting `ok`.
- `auditRoster` diffs the advertised roster against the CF model catalog and files
  `[ai-cal] roster drift: <model>` tickets, applying live overrides in `ai_model_health`.

## 5. Fix

Two changes, both in `qnfo-ai-calibration`:

1. **Do not treat a saturated page as a count.** Detect `rows.length === per_page * limit` and mark
   the sweep `truncated: true`; store `null`/`">=150"` instead of a precise count. A precise number
   from a saturated page is worse than no number.
2. **Stop re-inserting an identical census.** Store a signature of the bucket map
   (`gw_sweep_last_sig`) and skip the insert when unchanged — the `gw_sweep_last_ts` guard already
   exists but tracks time, not content.

Neither is shippable from this endpoint: the canonical is 33,551 B against a 32,768-char read cap
(**783 bytes short**), and `github_file_write` requires full content.

## 6. Limits

- The `start_time`-ignored hypothesis is **not** proven; only the saturation is. Both hypotheses
  (ignored filter, lagging logs) predict identical data.
- The 150 ceiling is read from source and matched to data; I did not observe a sweep with
  `rows.length < 150` that would confirm the `if (arr.length < 50) break` exit.
- The tail 783 bytes of the canonical were unreadable, so the `fetch`/`scheduled` export and any
  later code are unverified. Everything quoted in §1 and §3 is from the readable 32,768 chars.
- This finding is derived from a file whose VERSION (1.1.4) is **behind** production (1.1.5), so the
  live sweep may already differ. The saturation is nonetheless observed live.
