# ADDENDUM 3 — live re-verification, 2026-09-13 (qnfo-ops)

Read after `README-2026-09-13-model-depth.md`. This addendum **corrects five claims** in that set
and adds live measurements taken 2026-09-13T13:00-13:16Z.

## 1. The gw-fail burst RECURRED — the guard question is OPEN again

The README records the 09-11T13:30:46Z burst (ids 654-660, 9.972 s). A **second burst fired today**:

| burst | ids | n | span | first (UTC) |
|---|---|---|---|---|
| 1 | 478-484 | 7 | 4.0 s + 3.9 s | 2026-09-06 |
| 2 | 654-660 | 7 | 9.972 s | 2026-09-11T13:30:46.488Z |
| 3 | 670 | 1 | - | 2026-09-12T12:00:53.581Z |
| 4 | **678-684** | **7** | **12.301 s** | **2026-09-13T07:31:00.954Z** |

Burst 4 is **42.00 h** after burst 2 and is not explained by the README's "nothing in ~21 h across
~42 sweeps" — that was true when written and is now false. Rows 678-684 are `status=open`; ids
654-660 and 670 are now `status=resolved`. The previous batch was resolved and a near-identical
batch was re-filed. Whether the live guard is present, absent, or present-but-defeated by the
auto-close (resolution removes the row from the guard's disposition set) is **unresolved** — the
live bundle sits past the 32,768-char read cap.

## 2. The self-rewrite loop has NEVER deployed anything — refutes the regression vector

The prior session's P0 "find the regression vector" named `qnfo-autopilot`'s self-rewrite loop.
`self_rewrite_state` refutes it: **every recorded attempt is `reverted-or-rejected`.**

- 2026-09-10, five attempts (obsidian-writer, qnfo-lifecycle, qnfo-citation-watch, qnfo-email,
  qnfo-ai-search): `PUT 400 10021:Uncaught TypeError: "" is not a function at worker.js:1:3`,
  and `PUT 400 100329:Binding '<X>' of type '<y>' requires a Worker written in ES module`.
- 2026-09-13, `jnl-referee`, hourly at :05:59, **10 consecutive failures** 04:05:40Z to 13:06:00Z,
  all `snapshot read 404`.

A loop that cannot deploy cannot have caused a deploy regression.

## 3. The 71.2% flash share is a LIFETIME average, not current routing

`ai_queries`, `domain='code'`, 253 rows: `deepseek-v4-flash` 180 (71.2%), `ensemble` 46,
`glm-5.2` 8, `qwen2.5-coder-32b` 5, `qwen3-30b` 4, `deepseek-v4-pro-wa` 4, `kimi-k2.7-code` 2,
`gpt-oss-120b` 2, `glm-5.3-flash` 2.

Flash's **last** code query is `2026-09-09T15:45:51.134Z`. Every code row after that is `ensemble`
or `kimi-k2.7-code` (both depth tier; last 2026-09-12T08:14Z). The 71.2% is historical
accumulation and is consistent with `ROUTE_POOLS.code` excluding flash. Do not quote 71.2% as
present-tense routing.

## 4. `ai_queries` has no `out_tok` / `avg_lat` columns

Live schema: `id, ts, model, strategy, complexity, domain, prompt, response, prompt_tokens,
completion_tokens, cost_usd, latency_ms, rag_sources, streamed, source, ua`.
`SELECT out_tok ...` fails with `D1_ERROR: no such column: out_tok`. Any figure derived from those
names (including a "zero-output" percentage) must be re-derived from `completion_tokens`.

## 5. No model is currently degraded — but the roster has 5 duplicate rows

`ai_model_health`: 25 rows, **all `status=ok`, all `consecutive_failures=0`**, 7 distinct
`last_probe_ts`, max `updated_at=2026-09-13T13:15:57.855Z` — the probe is live. The "`degraded`
with no evidence" finding is not observable right now.

The `internalId()` fallthrough is. Five models appear twice, once internal and once CF-qualified,
and every CF-qualified twin is unprobed (`last_latency_ms=null`):

`glm-5.2` / `@cf/zai-org/glm-5.2`; `qwen2.5-coder-32b` / `@cf/qwen/qwen2.5-coder-32b-instruct`;
`gemma-4-26b` / `@cf/google/gemma-4-26b-a4b-it`; `bge-base-en-v1.5` / `@cf/baai/bge-base-en-v1.5`;
`qwen3.8-27b` / `@cf/qwen/qwen3.8-27b`. Issue 685 files the CF ids; the health table uses the
internal ids. 20% of the roster is duplicated and half of each pair is never measured.

## 6. Gateway failures: separate probe artifacts from real load

`ai_gateway_failures`: 2,611 rows, 2026-09-05T07:30:52.537Z to 2026-09-13T13:00:57.836Z (8.229 d),
one row per 30-min sweep. Per-sweep rate is the diagnostic:

| model | status | class | total | buckets | per sweep |
|---|---|---|---|---|---|
| bge-base-en-v1.5 | 429 | rate-capacity | 36,591 | 390 | **93.823** |
| qwen2.5-coder-32b-instruct | 400 | content-shape | 16,464 | 392 | **42.000** |
| qwen3.8-27b | 400 | upstream | 3,423 | 328 | 10.436 |
| kimi-k2.6 | 429 | rate-capacity | 986 | 393 | 2.509 |
| gemma-4-26b | 400 | image-input | 393 | 393 | **1.000** |
| glm-5.2 | 400 | tool-args-json | 390 | 390 | **1.000** |
| glm-5.2 | 429 | rate-capacity | 240 | 240 | 1.000 |
| kimi-k2.7-code | 429 | rate-capacity | 100 | 50 | 2.000 |

**`image-input` (393/393), `tool-args-json` (390/390) and `glm-5.2` 429 (240/240) are exactly one
failure per sweep** — the calibration probe re-issues a request shape those models reject. They are
self-inflicted and will never clear by changing models. The real defects are the top two: bge 429 at
93.8/sweep (sustained ~3.1/min) and the coder model's 42/sweep content-shape 400.

## 7. Confirmed live: `latency_max_ms=8000`

`ai_calibration_config`: `fail_threshold=2`, **`latency_max_ms=8000`**,
`vision_models=kimi-k2.6,kimi-k2.7-code,glm-5.3-flash,gemma-4-26b,llama-3.2-11b-vision`,
`gw_sweep_last_ts=1789304457836` (2026-09-13T13:00:57.836Z). The mandate-blocking setting is real.

## 8. The calibration suite reports a failure it cannot name

Latest runs: `total=28, pass=27, fail=1, drifts=0` every 30 min, duration 43-62 s, with
`digest={"failing":[],"drift_models":[]}`. A failing probe exists and the record does not identify it.

## 9. Ops-endpoint state

- `ops_issues_list` **works now** (10 open rows returned) — the prior "returns 0 for all statuses"
  claim is stale. Ordering is still wrong: id 688 (`created_at` text `2026-09-13 09:45:59`) is
  returned *after* id 686 (text `2026-09-13T08:00:57.838Z`). `created_at` mixes integer epoch
  (gw-fail rows) with two text formats — ORDER BY across them is unreliable.
- `qnfo-backlog-exec` v1.2.7, `openBacklog=12`; `ops_issues_list` reports 10 open. Unreconciled by 2.
- `ops_jobs`: `job-2dfc803ca4a243` **exists**, `status=continuing`,
  `updated_at=2026-09-13T07:25:54.606Z` — stalled **5.83 h**. Five of the ten most recent jobs are
  `continuing` (07:18:46Z to 07:24:45Z). `GET /v1/jobs/job-2dfc803ca4a243` returns **HTTP 404**
  despite the row existing. Payloads are 449 KB to 820 KB (full conversation retained).
- `deployment_history` records a **concurrent** session: `deepchat-session` deployed `qnfo-ops`
  three times on 2026-09-11 — 10:22:24.744Z **failed** (stray brace at worker.js:1119),
  10:25:57.506Z success *"Convert agent_issues writers -> issue_ledger (patch #449)"*,
  10:34:07.744Z success (43 bindings; "Live: 0 agent_issues writes, 7 issue_ledger refs").
  No `qnfo-ai-calibration` deploy appears in the 09-10 to 09-13 window.
- `issue_ledger` is a fingerprint+occurrences dedupe ledger (`fingerprint, source, level, category,
  title, status, first_seen, last_seen, occurrences, last_detail, updated_at, resolved_at,
  resolution_note`); it has no `id` column. The fleet now runs two issue stores:
  dedupe-by-fingerprint (`issue_ledger`) and per-sweep-per-model (`agent_issues`). The gw-fail
  emitter writes the second.

## 10. P0-2 is already satisfied

`gemma-2b`, `granite-h-micro` and `llama-3.2-1b` are **absent** from the 25-row live roster —
already removed. `llama-3.2-11b-vision` remains (latency 420 ms) and is 1 of 5 `vision_models`, so
removing it is safe only if the other four cover vision.

## What I did not do

No PR (no ref-creation tool: 404 on every branch name, 422 on `github_pr`). No deploy.
No `ops_issue_run` — the gate correctly refused because the authorising message carried no
affirmation. No credential object read (`credentials/` is still 9 objects, unrotated).
