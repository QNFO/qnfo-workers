# SPEC — `ai_model_health` dual-key split-brain

Date: 2026-09-13 (rev 2, source-verified) · Status: OPEN · Severity: high (silent, self-heal inert)
Evidence: live D1 `qnfo-audit` + `qnfo-ai-calibration/worker.js` sha `7a37a8ab74bb4aeaf70fc2438e3c7a48f20d685e` (VERSION 1.1.4)

> **rev 2 supersedes rev 1.** Rev 1 proposed a hypothesis (H1) and listed a falsifying test.
> The test was run against the writer's source; the mechanism is now confirmed, and it differs
> from rev 1's reasoning. Rev 1's H1/H2 framing is obsolete — see "Mechanism" below.

## Observation

`ai_model_health` holds 25 rows. 20 bare-name rows are ALL `status='ok'`. 5 rows with
`@cf/<org>/`-qualified ids are ALL `status='degraded'`:

| model_id | status | last_probe_ts | updated_at | gateway_failures |
|---|---|---|---|---|
| `@cf/qwen/qwen3.8-27b` | degraded | 1789280141458 | 13:31:01Z | 1371 |
| `@cf/zai-org/glm-5.2` | degraded | NULL | 13:31:09Z | 0 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | degraded | NULL | 13:31:08Z | 0 |
| `@cf/google/gemma-4-26b-a4b-it` | degraded | NULL | 13:31:11Z | 0 |
| `@cf/baai/bge-base-en-v1.5` | degraded | NULL | 13:31:12Z | 0 |

Bare-name twins: `qwen2.5-coder-32b` ok with `gateway_failures=10836`; `glm-5.2` ok/362;
`gemma-4-26b` ok/258; `bge-base-en-v1.5` ok/0; `qwen3.8-27b` ok/0.

## Mechanism (CONFIRMED in source, not inferred)

`gatewayFailureSweep()` writes the degraded status like this:

```js
var targetId = internalId(b.model);
var hrow = await env.QNFO_AUDIT.prepare(
  "SELECT model_id FROM ai_model_health WHERE model_id = ?1").bind(targetId).first();
if (recurring) {
  if (hrow) await ...("UPDATE ai_model_health SET status='degraded', updated_at=?1 WHERE model_id=?2")
  else      await ...("INSERT OR IGNORE INTO ai_model_health (model_id, status, updated_at) VALUES (?1,'degraded',?2)")
}
```

`internalId()` maps CF ids back to roster ids, but its map is incomplete:

```js
var CF_TO_INTERNAL = {};
(function(){ for (var k in TIER0_WA) { if (TIER0_WA[k]) CF_TO_INTERNAL[TIER0_WA[k]] = k; } })();
CF_TO_INTERNAL["@cf/baai/bge-base-en-v1.5"] = "bge-base-en-v1.5";
function internalId(m) {
  if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m];
  if (m && m.indexOf("@cf/") === 0) {
    for (var k in TIER0_WA) { if (TIER0_WA[k] && TIER0_WA[k].indexOf(m.slice(5)) >= 0) return k; }
  }
  return m;            // <-- unmapped id returned UNCHANGED
}
```

`TIER0_WA` holds 7 entries: `kimi-k2.6`, `glm-5.3-flash`, `gpt-oss-120b`,
`deepseek-v4-flash-wa`, `deepseek-v4-pro-wa`, `kimi-k2.7-code`, `glm-5.3`. Plus the single
explicit bge entry. **Note `glm-5.3` is mapped but `glm-5.2` is not.**

For an unmapped model, `internalId()` returns the raw CF id, the `SELECT` finds no row, and the
`INSERT OR IGNORE` branch runs. That INSERT supplies only `model_id, status, updated_at`, so
`last_probe_ts` stays NULL — which is exactly the observed shape for 4 of the 5 degraded rows.
That NULL is independent confirmation the phantom branch executed.

Simultaneously, the probe path calls `upsertHealth(env, m, "ok", ...)` with `m` taken from
`ALL_MODELS`, which is built from the **bare** roster keys. So every sweep:

1. probe path → `upsertHealth(bare_id, "ok")` → roster row reads `ok`
2. gateway path → `INSERT OR IGNORE (raw_cf_id, "degraded")` → phantom row reads `degraded`

**The two writers never touch the same row, so the degraded status never reaches the row the
router reads.** Rev 1 guessed the router might be reading the wrong namespace; the actual defect
is upstream of that — the *writer* mis-keys, and the write lands on a row nothing consumes.

### No reconciliation path exists
Nothing in this worker ever DELETEs from `ai_model_health`. Phantoms are permanent.
`clearOverrides`/`setOverrides` are keyed by bare drift ids, and the GW-DEGRADE self-clear
branch (`status='ok'`) is also keyed by `internalId(b.model)` — i.e. it clears the phantom,
never the roster row.

## Unresolved contradiction

`@cf/baai/bge-base-en-v1.5` **is** explicitly mapped, so `internalId()` should return
`bge-base-en-v1.5` and the code should UPDATE the bare row. Yet a `@cf/baai/bge-base-en-v1.5`
degraded row exists with `updated_at = 2026-09-13T13:31:12.569Z` (touched today). For that to
happen, `targetId` must have been the raw CF id.

Two live explanations, neither excluded:
1. **Deployed != repo.** Drift is already recorded (deployed `1.1.5` vs repo canonical `1.1.4`).
   The deployed build may lack the bge mapping.
2. The phantom predates the mapping and something else re-touches it.

**Therefore: the source above is evidence of intent, not proof of deployed behaviour.** Reconcile
the 1.1.4/1.1.5 drift before patching from this file.

## Required fix (order matters)

1. **Reconcile the 1.1.4 (repo) / 1.1.5 (deployed) drift first.** Do not patch from an
   unverified revision.
2. Replace `internalId()`'s substring fallback with an explicit total map covering every model
   that can appear in the gateway failure feed — or normalise to the roster key at write time.
3. Add a one-shot migration merging the phantom rows into the roster rows:
   `gateway_failures` SUM, `status` = worse of the two, `last_probe_ts` = MAX, then DELETE.
4. Ensure the degraded self-clear path targets the same key the probe path writes.

## Namespace inventory

| layer | key form | evidence |
|---|---|---|
| `qnfo-ai` MODELS registry / `spec` / `autoRoute` | bare | `MODELS["glm-5.3-flash"]` |
| `ai_calibration_config.vision_models` | bare | `kimi-k2.6,kimi-k2.7-code,glm-5.3-flash,gemma-4-26b,llama-3.2-11b-vision` |
| `ALL_MODELS` / probe path / `upsertHealth` | bare | source |
| `ai_gateway_failures.model` | qualified | `@cf/qwen/qwen2.5-coder-32b-instruct` |
| GW-DEGRADE target | `internalId(model)` → bare *if mapped*, else raw | source |
| `ai_model_health.model_id` | BOTH | 20 bare + 5 qualified |

## Non-goals

- No change to `fail_threshold=2` or the sweep cadence.
- No change to the frozen-clock / `run_code` path.
- This spec does not assert any model is healthy. It asserts only that the health table cannot
  be read as one verdict per model, and that the degraded flag currently lands on a row that
  nothing reads.
