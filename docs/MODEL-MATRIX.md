# MODEL-MATRIX-1: which Cloudflare model for which job

Status: audit + matrix 2026-10-28 (charter pillar: cost). Data: Workers AI catalog (`GET /ai/models/search`, 73 models),
`qnfo-audit.cf_model_catalog`, `ai_call_counters` (14 days to 2026-10-28), `cost_router_metrics`. Machine-readable twin:
`qnfo-audit.model_task_matrix` (migrations/2026-10-28-model-task-matrix.sql). Extends COST-OPTIMIZED-MODEL-CALLS.md (L2 capability gate,
L3 cascade) and ENSEMBLE-POLICY.md (disjoint families for outsider-facing prose); it replaces neither.

## What the audit found (measured, not assumed)

1. **The fleet already uses 25 models, not 3** (14 days, `ai_call_counters`). The premise holds in a narrower form: spend is concentrated.
   `gpt-oss-120b` is 47% of neurons (12.5M, 21k calls, ~595 neurons/call), `glm-5.3-flash` 24% (6.4M); two models carry 71%.
   Then kimi-k2.6 10%, kimi-k2.7-code 8%, glm-5.3 4%, deepseek-v4-flash-0731 4%. Heaviest consumer: qnfo-research-exec
   (review / revise / verify / complete / ensemble all on gpt-oss-120b), then qnfo-code-orchestrator (ladder).
2. **Whole classes of the catalog are unused**: decision models (Clef family), reranker, safety guard, sentiment classifier,
   multilingual embeddings, ASR / TTS, vision captioning, translation. Only `bge-base-en-v1.5` (embeddings) is used outside chat.
3. **JEV and Clef are decision models, not chat models** (System One API: `state` + typed `questions` -> a probability per answer,
   0 output tokens, 40-650 ms). qnfo-ops `/diag-wai-multi` sends JEV chat `messages` and gets `7003 User Input Error`, so JEV has
   never been exercised correctly (`typesafe/jev` has 1 call in 14 days). No worker calls Clef in production; only qnfo-model-eval does.
4. **Counter-evidence on Clef**: the fleet's own canary scored `clef-flash` agreement 0.1667 against the fleet's real labels
   (gate 0.7), so it is `candidate`, not `passed`, for the category task. Decision models are strong on benchmarks (BANKING77
   macro-F1 94 for Clef) and weak when the labels are the fleet's own taxonomy. They are a gate only after a per-question agreement check.
5. **Tool calling is not the constraint any more**: 14 mid-priced models all emitted the correct `ops_d1_query` call in a single-turn
   canary on 2026-10-28 (table below). That is single-turn evidence only; multi-turn ops-scale loops are unproven, so these rows are
   recorded under task class `tool-call-single`, never `agent-loop`.
6. **Attribution gaps**: gemma-4-26b (105 calls) and deepseek-v4-pro-0813 (1,132 calls) report ~0 neurons, so their cost is invisible to
   `ai_call_counters`. `nemotron-3-120b` is `rejected` in `cf_model_catalog` yet runs 3,128 calls (q08-signal-engine). Both are defects to fix.

## Price table (USD per million tokens, input / output; cached input where it exists)

| Model | In / Out | Cached in | Ctx | Notes |
|---|---|---|---|---|
| clef-flash | 0.038 / 0 | | 24K | decision, 39 ms median |
| clef | 0.24 / 0 | | 64K | decision, 209 ms |
| clef-omni | 0.15 / 0 | | 64K | decision, audio + video |
| clairic | 0.10 / 0 | | 64K | typed extraction (`{model, fields}`) |
| typesafe/jev | 0.042 / 0 | | 32K | decision, 524 ms, third party, binding only |
| llama-3.2-1b / 3b | 0.027 / 0.20 ; 0.051 / 0.335 | | 60K / 80K | trivial text only |
| qwen3-30b-a3b-fp8 | 0.051 / 0.335 | | 32K | tools; cheapest capable chat |
| glm-4.7-flash | 0.0605 / 0.40 | | 131K | tools |
| gemma-4-26b-a4b | 0.10 / 0.30 | 0.05 | 256K | tools |
| granite-4.0-h-micro | 0.017 / 0.112 | | 131K | tools; weakest (quality 50) |
| gpt-oss-20b | 0.20 / 0.30 | | 128K | tools, reasoning |
| gpt-oss-120b | 0.35 / 0.75 | | 128K | tools, reasoning; current workhorse |
| glm-5.3-flash | 0.15 / 0.50 | 0.03 | 1M | tools; current chat default |
| deepseek-v4.1-flash-1017 | 0.30 / 1.20 | **0.006** | 1M | tools; cheapest cached long context |
| deepseek-v4-flash-0731 | 0.44 / 1.32 | 0.014 | 1M | tools |
| nemotron-3-120b-a12b | 0.50 / 1.50 | | 256K | tools |
| qwen3.8-27b | 0.45 / 3.20 | 0.05 | 256K | tools |
| deepseek-v4-pro-0813 | 1.32 / 3.96 | 0.044 | 1M | tools |
| kimi-k2.6 / k2.7-code | 0.95 / 4.00 | 0.16 / 0.19 | 256K | tools |
| glm-5.3 / glm-5.2 | 1.40 / 4.40 | 0.26 | 1M / 256K | tools; top quality in catalog |
| bge-m3, qwen3-embedding-0.6b | 0.0118 | | | embeddings (multilingual) |
| bge-small / base / large | 0.0202 / 0.0666 / 0.204 | | | English embeddings |
| bge-reranker-base | 0.0031 | | | rerank |
| llama-guard-3-8b | 0.484 / 0.03 | | 131K | safety classification |
| whisper-large-v3-turbo | $0.000513 / audio min | | | ASR |
| melotts | $0.000205 / audio min | | | TTS |
| flux-1-schnell, SDXL-lightning | per step / free | | | images |

Not recommended as defaults: `unbiased/pareto` ($2.50 / $7.50, a blend of several models, so a paid ensemble inside one call, which the
L4 rule forbids), `openai/gpt-5.5` (T3), `deepseek-r1-distill-qwen-32b` ($4.88 output), `qwq-32b`, `llama-3.2-11b-vision` except for vision.

## Single-turn tool-call canary, 2026-10-28 (five-tool ops schema, task: count rows in agent_issues)

All PASS (right tool `ops_d1_query`, right arguments): gpt-oss-120b 2.2 s, gpt-oss-20b 1.1 s, deepseek-v4.1-flash-1017 1.1 s,
deepseek-v4-flash-0731 2.8 s, glm-4.7-flash 2.5 s, qwen3-30b-a3b 2.6 s, nemotron-3-120b 3.2 s, mistral-small-3.1 3.4 s, llama-4-scout 4.4 s,
qwen3.8-27b 4.5 s, glm-5.3-flash 5.4 s, kimi-k2.6 5.8 s, granite-4.0-h-micro 5.5 s (arguments double-encoded: needs the JSON-repair
shim), gemma-4-26b 19.5 s (too slow for a loop). Limitation: one sample each; a pass says the model can emit a call, not that it holds up
over 20 turns. Promotion to `agent-loop` needs the ops-scale canary.

## The matrix (cheapest capable first; escalate only on a measured failure signal)

`P` primary, `F` fallback (different family where possible), `E` escalation, `V` verifier. "Gate" = capability gate (routing_capability /
cf_model_catalog status `passed`) must hold before the row is used. Rows marked **H** are hypotheses until the A/B harness
(qnfo-model-eval `model_ab_runs`, threshold 0.40) clears them; no row marked H is wired without that.

| Task class | P | F | E | V (deterministic first) | Note |
|---|---|---|---|---|---|
| **gate-decision** (route, triage, tier choice, tool-needed, intent, dedup verdict, quality yes/no) | clef-flash **H** | clef | glm-4.7-flash (chat JSON) | agreement with fleet labels >= 0.7 | 0 output tokens; only after per-question agreement check (finding 4) |
| gate-decision, audio / video input | clef-omni **H** | clef | - | same | |
| extraction to typed fields | clairic **H** | qwen3-30b-a3b JSON | gpt-oss-20b | schema validation | typed-input lane, not chat |
| second-opinion gate (disjoint family) | typesafe/jev **H** | clef | - | - | call with System One body via `env.AI.run`, not chat |
| embed (new indexes) | bge-m3 | qwen3-embedding-0.6b | bge-base | dimension check | existing Vectorize indexes keep bge-base: changing model means reindex |
| rerank (RAG top-k) | bge-reranker-base **H** | - | - | recall@k on golden set | 0.0031/M, add to qnfo-ai-search and personal-api |
| safety / policy screen of outbound text | clef-flash noul **H** | llama-guard-3-8b | - | - | |
| sentiment / coarse class | distilbert-sst-2 | clef-flash | - | - | |
| utility text (title, tag, rewrite, extract) | qwen3-30b-a3b | glm-4.7-flash | gpt-oss-20b | JSON schema | cheapest capable chat |
| fleet-control advisor proposal | @cf/google/gemma-4-26b-a4b-it | @cf/zai-org/glm-5.3-flash | - | non-empty proposal; separate gpt-oss-120b review | Same quality as control at 67% of its input price; fallback on errors or empty replies |
| chat (default) | glm-5.3-flash | gpt-oss-120b | glm-5.3 | empty-content check | unchanged |
| background bulk (batch scoring, summaries) | gpt-oss-20b **H** | qwen3-30b-a3b | glm-5.3-flash | schema | |
| agent loop (tools, multi-turn) | deepseek-v4.1-flash-1017 **H** (gateway deepseek-v4-flash today) | gpt-oss-120b **H** | deepseek-v4-pro | tool_calls valid + ops-scale canary | cached input 0.006 makes long loops cheapest |
| reasoning / science / review | gpt-oss-120b | nemotron-3-120b (fix catalog row) | glm-5.3 | claim check | |
| code draft | qwen3.8-27b / gpt-oss-120b **H** | kimi-k2.7-code | glm-5.3 | tests, `node --check` | kimi-k2.7-code is 4x the output price of gpt-oss-120b |
| long context (>128K) | deepseek-v4.1-flash-1017 **H** | glm-5.3-flash | deepseek-v4-pro | - | all 1M |
| outsider-facing prose (ENSEMBLE-POLICY-1) | glm-5.3 | gpt-oss-120b | kimi-k2.6 | deterministic gate + reader votes | disjoint families: zai, openai, moonshot, deepseek |
| vision / captioning | llama-3.2-11b-vision | moondream3.1 | - | - | |
| multilingual | mistral-small-3.1 | gemma-sea-lion (SEA), eurollm-9b (EU) | - | - | translate: m2m100, indictrans2 |
| ASR | whisper-large-v3-turbo | nova-3 (streaming) | - | - | smart-turn-v2 for turn end |
| TTS | melotts | aura-2-en | - | - | |
| image | flux-1-schnell | flux-2-klein-4b | flux-2-dev | - | |

## How it is implemented

1. **Data**: `model_task_matrix` in qnfo-audit holds the rows above (task class, rank, role, model, prices, gate, evidence); every worker can
   read it. `routing_capability` gets the 14 single-turn rows.
2. **Change path**: no worker is switched by this document. Each H row is a filed `agent_issues` code-task (MODEL-MATRIX-1) with a
   prediction; the code loop makes the change, `scripts/model-policy.json` declares the new model so the A/B harness judges it, and a
   regression reopens the old order (`model-floor-guard` already bans unlisted pins).
3. **Measure**: keep a swap only if `cost_router_metrics` cost per successful task falls and `v_output_quality_by_surface` does not worsen.

## Failure modes

- Clef/JEV agreement on the fleet's own labels is low (0.17 measured). A gate that confidently mislabels is worse than a larger model.
- A cheaper model that fails a step costs more through retries (L2 rule); the cascade escalates on empty content, invalid JSON or tool-call parse failure.
- Prices are list prices; `ai_call_counters.neurons` uses fleet-held rates and is blind to gemma-4 and deepseek-v4-pro.
- Mid-tier models share training lineage with the incumbents, so an ensemble of them is not independent (ENSEMBLE-POLICY-1).
