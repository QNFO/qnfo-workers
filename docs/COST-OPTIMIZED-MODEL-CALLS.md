# COST-OPTIMIZED MODEL-CALL STACK (fleet v2 — IMPLEMENTED)

Status: **IMPLEMENTED FLEETWIDE** 2026-09-26 (COST-ROUTING-STACK-1). This document is the
permanent reference: what we built, where it lives, how it is measured, and what future
updates must preserve. Skill twin: `cost-optimized-routing` (qnfo-skills + DeepChat).

Live implementation: qnfo-ops **v2.37.x** (deployed, verified) · qnfo-ai **v5.29.0** (deployed, verified)
· AI Gateway `default` + `ops` cache-tuned · D1 qnfo-audit routing_capability / routing_policy /
model_ladder_* / cost_router_metrics.

Thesis (one line): a cheap/free model matches a frontier model on a task only when (a) the task is
routed to the cheapest model that passes a CAPABILITY GATE for that task class, (b) a DETERMINISTIC
VERIFIER catches its failures and triggers escalation, and (c) CONTEXT COST is controlled. Without
(b)/(c), "cheap" is a trap that costs more in retries and context than the frontier call it replaced.

## The layered stack (cheapest lever first)

| Layer | Mechanism | Where it lives (2026-09-26) | Status |
|---|---|---|---|
| **L0** deterministic-first | answer without a model: SQL/regex/probe handlers, templates | qnfo-ops `deterministicOpsAnswer()` in handleChat (cost / version / health / models / `run tools.exec: A*B` probe); zero tokens, `_router.deterministic:true` | **LIVE** (verified) |
| **L1** cache (exact + semantic) | AI Gateway response cache; KV exact-match; Vectorize semantic (embed query → nearest cache; serve above cosine threshold); context economics (prefix reuse, compaction, bounded tool outputs, never re-send full history) | Gateway `cache_ttl=86400` + `cache_invalidate_on_update=true` on `default`+`ops`; qnfo-ops exact KV `qnfo-ops-cache` (1h TTL) + semantic `qnfo-ops-semcache` (cosine≥0.93); qnfo-ai semantic cache over `qnfo-ai-log` LOG_VZ (cosine≥0.95, same-model, 30d); context economics: `OPS_PROMPT_CTX=262144` + `truncateToContext` + bounded tool results | **LIVE** (exact-KV hit verified: $0, hit rate 1.0) |
| **L2** capability gate before price gate | a cheap model that fails tool_calls costs MORE via retries → route only to models passing the canary for that class | qnfo-ops `agentLoopIncapable()` reads `routing_capability` (D1, 5-min cache); free-first @cf restricted to the CHAT class (tools-bearing calls skip the free tier); capability matrix canary-refreshed (below) | **LIVE** |
| **L3** cascade / router | free @cf → cheap paid → frontier; escalate ONLY on measured failure signals (empty content, tool-call parse failure, validation failure, 429); a deterministic verifier makes cascades cheap | qnfo-ops ladder `deepseek/deepseek-v4-flash` → `deepseek/deepseek-v4-pro` → free last-resort (`budgetFallback`); tool-call validator (unknown names / unparseable args = escalation), provider tool-array repair, relay tools cap 64, 429→free; every escalation row → `model_ladder_escalations` | **LIVE** |
| **L4** ensemble / MoA | N× cost — only when components are FREE or CACHED; correlated failure is real, verification still required | qnfo-ai research ensemble is all-@cf free models with bounded stage budget (ENSEMBLE-BUDGET-1); no paid-model ensembles anywhere | **LIVE** |
| **L5** distillation / tiny-specialist | frontier generates labeled trajectories offline → LoRA / exemplar bank for recurring tasks | deferred: approach + schema documented; no code yet | ABSENT (documented) |
| **L6** speculative draft-verify | draft with cheap model, verify/repair with frontier only when checks fail | partial: code class drafts on free `kimi-k2.7-code` with paid repair; tests-as-verifier agent pattern | PARTIAL |
| **L7** budget scheduler + per-tier caps | A9 ceiling, per-tier daily caps, graceful degradation order, free fallback on cap hit | `model_ladder_daily` per-tier ledger (T2 default $2/day `OPS_T2_DAILY_CAP`, T3 $0.5) → degrade to free tier, never terminate (BUDGET-CAP-FREE-FALLBACK-1); gateway `monthly-200` on both gateways; OPS-JOB-COST-CAP-1 per-job ceiling | **LIVE** |
| **CTX** context economics (cross-cutting, the #1 observed lever) | 130–270K-token repeated contexts dominate input cost: prefix caching, compaction, structured D1 state, retrieval, bounded tool output | `OPS_PROMPT_CTX` + truncation live; prompt/prefix-cache realization (cache_read_tokens=0) is the documented next lever | PARTIAL |
| **MEA** measurement | cost per SUCCESSFUL task by task class (not per token), escalation rate, cache hit rate, tool-call validity rate — cost-per-outcome | `cost_router_metrics` written by qnfo-ops (finalize + deterministic path) and qnfo-ai (logQuery); `GET /cost-router/stats` aggregates | **LIVE** (verified with real traffic) |

## Capability matrix (canary-refreshed 2026-09-26)

Canary protocol: prompt = "call <tool> with no args and reply with the exact returned value";
tool schema = realistic ops tools (fleet_status / ops_d1_query / r2_list / web_fetch / email_check);
PASS = model emits a syntactically valid tool_calls block for the right tool.

| Model | agent-loop (ops-scale) | chat | Evidence |
|---|---|---|---|
| deepseek/deepseek-v4-flash | **PASS** | PASS | live canary 2026-09-26; production default |
| deepseek/deepseek-v4-pro | **PASS** | PASS | live canary 2026-09-26; T2 escalation |
| openai/gpt-5.5 | **PASS** | PASS | live canary 2026-09-26 — **REFUTES the 2026-09-19 pin**; prior no-tool_calls failures were a `max_tokens`-vs-`max_completion_tokens` parameter artifact |
| openai/gpt-5-mini | **PASS** | PASS | live canary 2026-09-26 |
| @cf free tier (glm-5.3-flash, kimi-k2.7-code, llama-3.3-70b, deepseek-v4-flash/pro-0813, glm-5.3) | unproven at full 60-tool scale | PASS (simple canary) | free-first restricted to chat class by the L2 gate; free tier remains the last-resort fallback |

Ruling for future changes: **any upstream change MUST re-run the ops-scale tool canary and update
`routing_capability` BEFORE deploy** (AGENTIC-CANARY-1). Deploying a non-tool-calling upstream for
agent loops is a REGRESSION. The recurrence-guard row: `fleet_loop_meta.model_pin` (v2, 2026-09-26).

## Measurement (cost-per-outcome)

- `cost_router_metrics` (qnfo-audit): ts, worker, task_class, tier, model, in/out tokens, cost_usd,
  latency_ms, cache_hit, escalations, tool_calls, tool_calls_ok, success.
- `GET https://ops.qnfo.org/cost-router/stats` → by_task_class (calls/ok/cost/cache_hit_rate/
  escalation count/tool-call validity) for 24h (or `?hours=N`), daily per-tier budget, tier caps,
  recent escalations.
- Per-tier daily ledger: `model_ladder_daily`; monthly: `model_ladder_budget`.
- Live first-day sample (2026-09-26): deterministic $0 · chat-cache-exact-kv $0 (hit rate 1.0) ·
  agent-tools validity 1.0 · T2 spend $0.008 across 5 paid calls.

## Anti-patterns (do not reintroduce)

Price-only routing (retries cost more) · paid ensembles · re-sending full history · unbounded tool
outputs · capability-agnostic cheap routing · caching without invalidation · treating a model's
config/catalog row as its capability (canary it).

## Maintenance gates (checked on EVERY future AI-calling worker update)

1. L2 gate intact: free-first fires only when `!(tools && tools.length)`; agent loops consult
   `routing_capability`.
2. Ladder is cheapest-capable-first: T2 flash → T2 pro → free last-resort; no T3 default.
3. Escalations are logged (`model_ladder_escalations`), not silent.
4. Metrics written in every completion path (`cost_router_metrics`); `/cost-router/stats` green.
5. Caches invalidate: gateway `cache_invalidate_on_update=true`; KV TTL; semantic threshold ≥0.93 (ops) / ≥0.95 (ai).
6. Registry drift zero after deploy; R2 `qnfo-canonical/<worker>.js` refreshed.
7. `routing_policy` rows in D1 stay truthful (LIVE/PARTIAL/ABSENT + evidence).

## Follow-ups (registered in routing_policy)

1. L5 distillation: exemplar bank / Workers-AI LoRA for recurring task classes.
2. L6 formal draft-verify pipeline (cheap draft + deterministic check → repair on fail).
3. Prefix-cache realization: instrument `cache_read_tokens` per call; move system prompt + tools to a
   stable prefix so provider prefix caches actually hit (currently 0% across all rows).
