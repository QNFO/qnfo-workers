# qnfo-ai-calibration — audit + fix patch (2026-09-13)

Source: qnfo-ops audit session 2026-09-13, driven from live qnfo-audit D1 + AI Gateway
logs + the deployed bundle. Every claim below has a live-data citation.

## Evidence base

| Observation | Source |
|---|---|
| 24 open `agent_issues`; drain closed **0/24** (`action:"recheck", note:"no probe target"`) | `ops_issue_run` 2026-09-13 |
| `ai_gateway_failures`: glm-5.2 = **611 rows**, qwen2.5-coder = 383, kimi-k2.6 = 383, gemma-4-26b = 382, bge-base = 382, qwen3.8-27b = 322, kimi-k2.7-code = 36 | `GROUP BY model` |
| Same 6 models share `first_ts=1788593452537`; all share `last_ts=1789279252538` | same query |
| 3 consecutive sweeps (ts 1789275646641 / 1789277443832 / 1789279252538) contain **byte-identical** bucket counts and **identical AiError request UUIDs** (`d974d123-…`, `4e9a2549-…`, `763b6fc6-…`, `3319680e-…`) | `ai_gateway_failures` rows |
| `ai_model_health` holds **both** `@cf/…` and short-name rows for the same model, `@cf/…` permanently `degraded`, `last_probe_ts NULL` | `ai_model_health` |
| Vision probes **pass** for all 5 vision models (`ok Red`) incl. llama-3.2-11b-vision, gemma-4-26b | `ai_calibration_results` run `cal-1789279252538-41c75c` |
| `probeEndpoint("deepseek-direct/models")` → `status=fail, detail="http=200"` | same run |
| `issue_ledger`: 270 open / 18 resolved; `agent_issues`: 24 open / 672 total — **two live stores** | D1 |

## RC-1 — gateway sweep replays the same window forever (severity: high)

`gatewayFailureSweep` pages `…/ai-gateway/gateways/default/logs?success=false&start_time=<lastTs>`
and advances `lastTs` from `ai_calibration_config.gw_sweep_last_ts`. Three sweeps 30 min
apart returned **identical failure buckets with identical request UUIDs** — impossible for
fresh traffic. `start_time` is not being honoured, so every sweep re-reads the same page.

Consequences, all live:
1. `ai_gateway_failures` grows by one duplicate row per model per sweep (611 rows for one model).
2. The 24h auto-close is defeated — `COUNT(*) WHERE model=? AND ts > t0-24h` is **always > 0**
   because the sweep just re-inserted the same buckets. **The 8 open `[gw-fail]` tickets
   (#654–#660, #670) are structurally unclosable.**
3. `ai_model_health.gateway_failures` inflates monotonically (qwen2.5-coder-32b = 10836).

### Fix — add a sweep signature guard

```js
// in ai_calibration_config: new key gw_sweep_last_sig
var sigParts = [];
for (var si = 0; si < cls.length; si++) sigParts.push(buckets[cls[si]].status + "|" + buckets[cls[si]].model + "|" + buckets[cls[si]].count);
sigParts.sort();
var sig = fnv32(sigParts.join(";"));
var lastSig = await cfgGet(env, "gw_sweep_last_sig", "");
var replay = (sig === lastSig && cls.length > 0);
if (replay) {
  // do NOT insert rows, do NOT file/degrade, do NOT inflate counters
  out.summary = "identical to previous sweep (start_time not honoured by gateway logs API) - suppressed " + cls.length + " classes";
  return out;
}
```
Then persist `gw_sweep_last_sig = sig` alongside `gw_sweep_last_ts`. Also make the auto-close
check use `DISTINCT ts` (or the signature) rather than raw row counts, so a replayed window
cannot hold a ticket open.

## RC-2 — `ai_model_health` namespace split → permanent MODEL-DEGRADED false positives (severity: high)

`internalId()` maps `@cf/…` → short id via `CF_TO_INTERNAL`, built **only** from `TIER0_WA`.
Any model absent from `TIER0_WA` falls through `return m` and is written to
`ai_model_health` under its **qualified** id — a second row that nothing ever probes
(`last_probe_ts NULL`, `consecutive_failures 0`) and nothing ever clears. Live examples:
`@cf/baai/bge-base-en-v1.5`, `@cf/qwen/qwen3.8-27b`, `@cf/zai-org/glm-5.2`,
`@cf/qwen/qwen2.5-coder-32b-instruct`, `@cf/google/gemma-4-26b-a4b-it` — all `degraded`,
while the short-name twin is `ok`. `qnfo-fleet-advisor` reads the qualified row and files
`MODEL-DEGRADED @cf/…` — **12 of the 24 open issues are this artifact**
(#645, #652, #653, #663, #668, #669, #671, #672, #673, #674).

### Fix

```js
// BEFORE
function internalId(m) { if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m]; if (m && m.indexOf("@cf/") === 0) { for (var k in TIER0_WA) { if (TIER0_WA[k] && TIER0_WA[k].indexOf(m.slice(5)) >= 0) return k; } } return m; }

// AFTER
function internalId(m) {
  if (!m) return null;
  if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m];
  if (m.indexOf("@cf/") === 0) {
    var tail = m.slice(4);
    for (var k in TIER0_WA) {
      if (TIER0_WA[k] === m) return k;
      if (TIER0_WA[k] && TIER0_WA[k].slice(4) === tail) return k;
    }
    return m.split("/").pop();          // canonical short form, never "@cf/..."
  }
  return m;
}
```

Add a hard guard at every `ai_model_health` write: **never persist a `model_id` starting with `@cf/`**.

## RC-3 — `probeCompletion` strict model echo → false fail (severity: medium)

`var echo = r.data && r.data.model === model;` and `pass` requires `echo`. The router
legitimately normalises aliases to canonical ids, so a **correct** reply is scored fail.
Live proof: issue **#664** `llama-3.2-11b-vision` — `consecutive_failures=2`,
`detail=http=200 echo=false "OK"` (the model answered `OK`, i.e. the probe's own expected
string, and was still marked failing).

### Fix

```js
var ret = r.data && r.data.model;
var echo = !ret || ret === model || internalId(ret) === internalId(model);
```

## RC-4 — `probeEndpoint` non-body branch can never pass for DeepSeek direct (severity: medium)

```js
pass = r.status === 200 && r.text.indexOf("deepseek-v4-flash") >= 0;
```
DeepSeek's own `/v1/models` lists DeepSeek ids and can never contain the CF-internal alias
`deepseek-v4-flash`. Live result: `target=deepseek-direct/models, status=fail, detail="http=200"`.

### Fix

```js
pass = r.status === 200 && !!(r.data && Array.isArray(r.data.data) && r.data.data.length > 0);
```

## RC-5 — vision probe results are never persisted (severity: medium)

`runPool(visionModels, 2, …)` pushes to `results` but never calls `upsertHealth`. Vision
health is therefore never published — `llama-3.2-11b-vision` is frozen at
`last_probe_ts=1789145063740` (2026-09-11T16:44) while its vision probe has been passing.

### Fix

```js
await runPool(visionModels, 2, async function (m) {
  var res = await probeVision(env, m);
  results.push(Object.assign({ probe: "vision", target: m }, res));
  await upsertHealth(env, m + ":vision", res.status === "pass" ? "ok" : "degraded", res.latency_ms, res.status === "pass" ? 0 : 1);
  return res;
});
```
Use a distinct `:vision` key so the vision row does not fight the completion row.

## RC-6 — source/deploy divergence (severity: medium, process)

`qnfo-ai-calibration/worker.js` (sha `7a37a8ab`) and `deployed-current.worker.js`
(sha `3624a4da`) disagree on three things that matter:

| | `worker.js` | `deployed-current.worker.js` |
|---|---|---|
| `TIER0_WA` | 7 entries | 15 entries |
| issue store | `issue_ledger` | `agent_issues` |
| `DEFAULT_VISION` | 4 entries | 5 entries |
| bge alias | explicit `CF_TO_INTERNAL` line | absent |

Live data shows **both stores being written** (`agent_issues` newest gw-fail = #670,
`issue_ledger` 270 open), so at least one path is stale. The 8 models whose
`ai_model_health` rows froze at `1789145063740` (2026-09-11T16:44) —
`llama-3.2-11b-vision`, `qwq-32b`, `glm-4.7-flash`, `deepseek-r1-qwen-32b`,
`qwen2.5-coder-32b`, `glm-5.2`, `gemma-4-26b`, `qwen3-30b` — are consistent with a
deploy that **shrank the probed model set**, leaving them unprobed for ~2 days.
Reconcile `worker.js` → build → deploy, and delete `deployed-current.worker.js` or
regenerate it from the build so it cannot drift again.

## One-time data repair (needs a D1 **write** path — qnfo-ops is read-only)

Not executed by the audit; proposed for review before running:

```sql
-- 1. drop phantom qualified-id health rows (re-key anything real first)
DELETE FROM ai_model_health WHERE model_id LIKE '@cf/%';

-- 2. collapse the duplicated gateway-failure log to one row per (model,status,class)
DELETE FROM ai_gateway_failures WHERE id NOT IN (
  SELECT MAX(id) FROM ai_gateway_failures GROUP BY model, status, error_class
);

-- 3. review (do NOT blind-close) the MODEL-DEGRADED tickets produced by RC-2
SELECT id, title, created_at FROM agent_issues
 WHERE status='open' AND source='qnfo-fleet-advisor' AND title LIKE 'MODEL-DEGRADED%'
 ORDER BY id;
```

Step 3 is deliberately a SELECT: closing tickets is a judgement call, and RC-2's fix must
land before the advisor stops re-filing them.

## Not fixed here

- `ops_issue_run` closed **0/24** — every row is `no probe target`. The drain is
  structurally incapable of remediating this backlog; it only auto-closes
  health-availability rows whose re-probe passes.
- `worker-health` reports `qnfo-ai status 530` (issue_ledger `coe:e4e241fd`, 11 occurrences)
  while the service-binding probe returns `200 v5.25.1`. Consistent with the
  SVC-BINDING-1 note in this worker (same-account workers.dev fetches fail at the edge from
  inside a Worker) — a probe-method false negative, not an outage. Needs the health probe
  switched to a service binding.
