# SPEC — `ai_model_health` dual-key split-brain

Date: 2026-09-13 · Status: OPEN · Severity: high (silent, self-heal guard inert)
Evidence: live D1 `qnfo-audit`, 2026-09-13T13:45Z

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

**Status lands on the qualified key. The failure counter lands on the bare key.** The same
model therefore carries two contradictory rows, and 4 of the 5 degraded rows have
`last_probe_ts = NULL` — the flag is not backed by a probe of that key at all.

## Namespace inventory (which layer uses which key)

| layer | key form | evidence |
|---|---|---|
| `qnfo-ai` MODELS registry / `spec` / `autoRoute` | bare (`glm-5.3-flash`) | `MODELS["glm-5.3-flash"]` read verbatim in `qnfo-ai/worker.js` |
| `ai_calibration_config.vision_models` | bare | `kimi-k2.6,kimi-k2.7-code,glm-5.3-flash,gemma-4-26b,llama-3.2-11b-vision` |
| `ai_gateway_failures.model` | qualified | `@cf/qwen/qwen2.5-coder-32b-instruct` |
| `ai_model_health.model_id` | BOTH | 20 bare + 5 qualified |
| `agent_issues` gw-fail titles | qualified | `[gw-fail] 429 @cf/baai/bge-base-en-v1.5` |

## Hypothesis H1 (leading)

`autoRoute`'s degraded-exclusion (FLEET-SELF-AWARE-1, v5.21.2) resolves roster ids through
the bare-keyed MODELS map. It therefore reads the 20 `ok` rows and never sees the 5
`degraded` rows -> **deprioritization is inert for exactly the models it targets.**

GW-DEGRADE-2 (commit 2b645606, 2026-09-08) was scoped to "map gateway CF ids to internal
roster ids". The observed outcome is a *duplicate row* rather than an update of the roster
row, which is consistent with H1.

## Alternative H2 (not excluded)

If `loadModelHealth` maps `@cf/<org>/<name>` -> roster id, the guard fires correctly on
those 5 and the bare rows are vestigial. This cannot be excluded from D1 alone.

## Falsifying test (must be run before any patch)

Read `qnfo-ai/worker.js` and determine the exact lookup key used by `autoRoute` /
`loadModelHealth` against `ai_model_health`:

```bash
# locate both functions and the health lookup
grep -n "loadModelHealth\|autoRoute\|ai_model_health\|degraded" qnfo-ai/worker.js
# then: does the lookup strip the "@cf/<org>/" prefix, or use the bare roster id directly?
```

`qnfo-ai/worker.js` is 148,613 B (sha b8d053229afb92c982641841d680228418a2206a), which is
past the 32,768-char read cap available to the ops endpoint — the test needs a runner with
file access, not an API read.

**Prediction if H1:** the lookup uses bare ids and no `@cf/` row is ever consulted.
**Prediction if H2:** the lookup normalizes and `@cf/` rows are authoritative.

## Required fix (either hypothesis)

1. Choose ONE canonical key namespace for `ai_model_health` (recommend the bare roster id,
   since that is what `MODELS` and `autoRoute` already use).
2. Migrate: `UPDATE ai_model_health SET model_id = <bare> WHERE model_id LIKE '@cf/%'`
   after merging counters, then drop the duplicate. Merge rule must be explicit:
   `gateway_failures` sums, `status` takes the worse of the two, `last_probe_ts` takes MAX.
3. Re-key the writer side so `ai_gateway_failures.model` and the health writer agree.
4. Backfill: 4 of 5 degraded rows have `last_probe_ts = NULL` — a degraded flag with no
   probe behind it must either be re-probed or cleared.

## Non-goals

- No change to the degraded *threshold* (`fail_threshold=2`) or the calibration sweep.
- No change to the frozen-clock / `run_code` path.
- This spec does not assert that any model is healthy; it asserts only that the health
  table cannot currently be read as a single verdict per model.
