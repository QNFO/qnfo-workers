# COST-OPTIMIZED MODEL-CALL STRATEGY (fleet v1)

Status: strategy, grounded in live telemetry, 2026-09-26.
Evidence: qnfo-audit D1 — llm_gateway_log, model_ladder_tiers/models/routes/budget, chat_canary, ai_model_health.

## 0. Thesis (one line)
A cheap/free model matches a frontier model on a task only when (a) the task is routed to the
cheapest model that passes a CAPABILITY GATE for that task class, (b) a DETERMINISTIC VERIFIER
catches its failures and triggers escalation, and (c) CONTEXT COST is controlled. Without (b)/(c),
"cheap" is a trap that costs more in retries and context than the frontier call it replaced.

## 1. Live evidence (2026-09-26)
- Gateway-path spend (llm_gateway_log) 30d: $3.98. Consolidated AI-Gateway burn Sept 2026: $188.10
  (model_ladder_budget) — the ops agent path is a small fraction; context/other traffic dominates.
- Input:output ratio ~34:1 (ops-exec 6.93M in / 0.20M out over 138 calls = ~50K in/call;
  ops-frontier-mini ~100K in/call). Input tokens are the cost surface.
- cache_read_tokens = 0 across ALL rows -> prompt/prefix caching is NOT realized, although every
  catalog row carries a cache_in price. This is the single largest unclaimed lever.
- A 3-tier ladder already exists: T1 free $0, T2 low-cost frontier $120/mo, T3 top-cost $30/mo;
  18-model catalog with quality scores + per-tier documented failure modes; task-class routing.
- BUT model_ladder_routes was last calibrated 2026-09-15; canary_passes=0 and fail_count_24h=0
  everywhere -> the adaptive routing layer is dormant, not learning from live outcomes.
- chat_canary: ensemble 294/294, deepseek-v4-flash 147/157, ops-exec 4/10, ops-frontier 2/6
  (stale) -> tool-call validity is the discriminating capability for agent loops.

## 2. Definitions (fix the common confusion)
- Mixture-of-Experts (MoE) is an ARCHITECTURE inside one model (sparse expert sub-networks). It is
  NOT a cross-model routing strategy. "Send each query to the right model" is MODEL ROUTING.
- Ensemble / Mixture-of-Agents (MoA) = several models per query. Self-consistency = several samples
  of one model. Both are N x inference -> economical only on free or cached models.

## 3. The layered strategy (cheapest lever first)
L0 DETERMINISTIC-FIRST — answer without a model: SQL/regex/probe handlers, templates, cached facts.
   Biggest lever: removes the call entirely.
L1 CONTEXT ECONOMICS — prompt/prefix caching; history compaction/summarization; retrieval instead of
   full-context; bounded tool outputs; structured state in D1 instead of re-injected prose.
   (Fleet gap: 0% cache reads at ~50-100K input tokens/call.)
L2 CACHE — exact KV cache; SEMANTIC cache (embed query -> Vectorize -> serve above a cosine threshold).
L3 CAPABILITY GATE, THEN PRICE — route only to models that pass the tool-call / schema canary for the
   task class; a cheap model that fails tool_calls costs MORE via retries.
L4 CASCADE (FrugalGPT) — cheap first; escalate ONLY on verifier failure (tests, schema, lint,
   re-probe). The verifier is what makes cheap safe; for code, tests are the verifier.
L5 CONSISTENCY ESCALATION — sample the cheap model k times; disagreement = uncertainty -> escalate.
   Cheaper than always-frontier; a cheap uncertainty signal.
L6 MoA / ENSEMBLE — only with FREE (@cf) or cached models. Correlated failure is real (shared training
   data) -> still verify. Never an ensemble of paid models.
L7 DRAFT-VERIFY (agent-level speculative) — cheap drafts, frontier verifies/repairs; or frontier plans,
   cheap executes.
L8 DISTILLATION — frontier generates labeled trajectories -> small specialist (Workers AI LoRA) or a
   few-shot exemplar bank; amortizes frontier cost across many cheap inferences.
L9 BUDGET-AWARE SCHEDULING — off-peak pricing (deepseek peak x2), batch APIs 50% off, per-tier caps,
   free-fallback on cap hit (BUDGET-CAP-FREE-FALLBACK-1).

## 4. Fleet status: have vs missing
HAVE: L0 (partial), L3 (catalog + tiers), L4 (free-first + budget downgrade), L6 (research ensemble),
      L9 (tier caps + budget.blocked).
MISSING: L1 (the big one), L2 (no semantic cache), L5, L7, L8; and L3/L4 are not fed by live outcomes.

## 5. Concrete next actions
1. CONTEXT-ECONOMICS PASS (highest $): find the top input-token callers; add prefix caching /
   compaction / bounded outputs; instrument cache_read_tokens as a first-class metric.
2. REVIVE ADAPTIVE ROUTING: feed chat_canary + llm_gateway_log outcomes into model_ladder_routes
   nightly (canary_passes, fail_count_24h, demote current_tier on 2+ fails).
3. SEMANTIC CACHE in qnfo-ai: embed -> Vectorize -> serve above threshold; measure hit rate.
4. CONSISTENCY ESCALATION for code: k cheap samples, escalate on disagreement.
5. DISTILLATION PILOT: one recurring task -> frontier trajectories -> few-shot exemplar bank.

## 6. Anti-patterns
Price-only routing; paid ensembles; re-sending full history; unbounded tool output; capability-agnostic
cheap routing; caching without invalidation; treating a cheap model's config as its capability.
