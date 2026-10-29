# COST-OPTIMIZED MODEL-ROUTING STACK (QNFO fleet)

**Status:** CANONICAL · **Owner:** qnfo-fleet-control · **Created:** 2026-09-26
**Maintenance clause:** this document is part of every holistic self-improvement cycle. It MUST be
read and, if the fleet's routing behaviour changed, updated in the SAME cycle. Do not let it drift from
the live worker behaviour (qnfo-ops / qnfo-ai / personal-api).

## 0. Purpose & objective

Minimise **cost per successful task** (not cost per token) toward zero, without degrading agent/coding
quality. This is the cost dimension of objective `external-impact-per-dollar` (goals #50) and the A9
cost ceiling (objectives #329/#330). Every routing decision is measured by outcomes.

**Core principle — the cheapest token is the one you never spend.** Descend from L0; escalate only when
a lower layer is exhausted or a *measured* failure occurs.

## 1. The stack (L0–L7)

### L0 — Do not call a model at all (deterministic-first). BIGGEST LEVER.
Use deterministic handlers before any inference: SQL, regex, probes, static lookups, template fills.
If a fact is in D1/R2/KV, query it — do not ask a model. Rule: *if the answer is computable, compute it.*
Evidence: most "agent" turns in the fleet are lookups, not reasoning.

### L1 — Cache (exact + semantic + prefix).
- **Exact/response cache (AI Gateway):** `cache_ttl` (currently 30d). MUST pair with
  `cache_invalidate_on_update` so stale answers are not served after a source change (a cache without
  invalidation is a correctness bug, not an optimisation).
- **KV exact-match:** deterministic key → stored answer for idempotent queries.
- **Semantic cache (Vectorize):** embed the query; if nearest cached query has cosine ≥ threshold,
  serve the cached answer. Threshold + TTL owned, invalidated on knowledge-base change.
- **Prefix/prompt caching (context economics):** reuse stable prefixes so repeated context is billed
  as cached input.

### L2 — Capability gate BEFORE price gate. **KEY NON-OBVIOUS LESSON.**
The hard requirement for agent/coding loops is **valid `tool_calls` emission**. A cheaper model that
fails the tool-call contract costs *more* through retries and truncation than the expensive model it
replaced. So maintain a **capability matrix**: (model × task_class) → pass/fail on the relevant canary
(tool-call validity, schema conformance, context size). Route ONLY to models that pass the canary for
that task class; price is the tiebreaker, never the gate.
Canonical evidence: `fleet_loop_meta.model_pin` — gpt-5.5 / gpt-5-mini / dynamic-opsdynamic /
glm-5.3-flash do **not** emit tool_calls for the ops agent loop; `deepseek-v4-flash` does. Routing by
price alone silently breaks the agent loop.

### L3 — Cascade / router (FrugalGPT / RouteLLM analog).
Order: **free `@cf` tier → cheap paid (`deepseek-v4-flash`) → frontier (`gpt-5.5`)**. Escalate ONLY on a
*measured* failure signal: validation failure, tool-call parse failure, empty content, length
truncation, low confidence. **A deterministic verifier is what makes the cascade cheap** — you do not
need a model to verify code when tests, schema validators, and unit checks can. Implemented today as
`OPS-STREAM-FREE-FIRST-1` (free `@cf/zai-org/glm-5.3-flash` served first for the ops path).

### L4 — Ensemble / Mixture-of-Agents — ONLY when components are free or cached.
MoA (cheap models propose, an aggregator synthesises) and self-consistency (sample N, majority vote)
can approach frontier quality on reasoning — **but they multiply cost N×**. Economical ONLY with free
`@cf` components or heavy cache hits. **Correlated failure warning:** cheap models share training data,
so an ensemble cannot fix a *shared* blind spot; verification (L3) is still required.

### L5 — Distillation / tiny-specialist.
Use a frontier model **offline** to generate labelled trajectories for recurring tasks; fine-tune a
small model (Workers AI LoRA) or build a retrieval-based exemplar bank. One-time cost, permanent saving.
Candidates: classification, extraction, routing decisions, digest synthesis.

### L6 — Speculative / draft-verify (agent level).
Draft with a cheap model; verify/repair with the frontier model only when the deterministic checks
fail — the agent-level analog of speculative decoding. Pairs with L3's verifier.

### L7 — Budget-aware scheduler + per-tier caps.
Hard A9 ceiling + per-tier daily caps + an explicit **graceful-degradation order**, with a **free
fallback on cap hit** (`BUDGET-CAP-FREE-FALLBACK-1`): a paid-path failure or spend-cap must never
terminate work while a free path exists. Platform enforcement: AI Gateway `spend_limit`
(`monthly-200`). Actor: `fleet-control 0.4.27-costimpact` (daily cost-per-impact guard, detect→act→verify).

## 2. Cross-cutting: CONTEXT ECONOMICS (the #1 observed lever)

Observed live: **130–270K-token repeated contexts dominate input cost** (some 400–540K).
Levers, in order:
1. **Prefix / prompt caching** (stable prefix → cached-input billing).
2. **Context compaction / summarisation** of old turns instead of re-sending.
3. **Structured state in D1** — store conversation state, re-inject a summary, not the raw history.
4. **Retrieval instead of full-context** — fetch only relevant slices.
5. **Bounded tool outputs** — cap every tool result (fleet uses `MAX_TOOL_RESULT_CHARS`).

## 3. Anti-patterns (each has cost a real incident)

- **Price-only routing** → cheap model fails tool_calls → retries cost more (L2).
- **Paid ensembles** → N× spend for marginal quality (L4).
- **Re-sending full history** → dominates input cost (ctx economics).
- **Unbounded tool outputs** → context bloat every round.
- **Capability-agnostic cheap routing** → silent quality/loop breakage (L2).
- **Caching without invalidation** → stale answers, correctness bug (L1).
- **Cost guard with a target more expensive than the status quo** → the 2026-09-26 A9-gate incident:
  a gate that "downgraded" a free path to a paid model would have RAISED cost. Verify the current
  resolved upstream before adding a cost guard.

## 4. Measurement — cost per OUTCOME

Track, by task class (join on `llm_gateway_log`):
- **cost per successful task** (not per token) — `cost_usd / ok`.
- **escalation rate** (fraction reaching L3+ / frontier).
- **cache hit rate** (L1).
- **tool-call validity rate** (L2 canary).
Data: `llm_gateway_log` now carries `upstream_model` (resolved upstream) + `job_id` (task-level join,
OPS-TRACE-1 v2.36.75). `ai_model_health` carries per-model probe status.

## 5. Fleet implementation status (honest)

| Layer | State | Evidence / gap |
|---|---|---|
| L0 | PARTIAL | ops tool surface (SQL/regex/probes) exists; expand deterministic handlers |
| L1 | PARTIAL | gateway `cache_ttl` set; semantic cache + invalidation not yet wired |
| L2 | PARTIAL | `ai_model_health` + chat-canary exist; **capability MATRIX not persisted** — GAP |
| L3 | PARTIAL | free-first (OPS-STREAM-FREE-FIRST-1) live; verifier-driven escalation not formalised |
| L4 | PARTIAL | qnfo-ai ensemble exists; no cost guard on paid ensembles |
| L5 | ABSENT | no distillation/exemplar bank yet |
| L6 | ABSENT | no agent-level draft-verify yet |
| L7 | PARTIAL | gateway `spend_limit monthly-200` + fleet-control cost-impact guard live |
| Ctx econ | PARTIAL | `MAX_TOOL_RESULT_CHARS` cap; no compaction/prefix-cache policy yet |
| Measurement | PARTIAL | `upstream_model`+`job_id` now logged; cost-per-task view not yet built |

## 6. Maintenance clause (binding)

Every holistic cycle MUST: (a) confirm this doc matches live behaviour; (b) update §5 status when a
layer changes; (c) never ship a routing/cost change without a same-turn live probe of the **resolved
upstream** (`llm_gateway_log.upstream_model`), not the model constant.
