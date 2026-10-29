# MODEL-FLOOR-1 - QNFO Fleet Minimum Model Standard

Status: MANDATORY (2026-09-11). Enforced by scripts/model-floor-guard.mjs.

## 1. Mandate

Every model that WRITES or EXECUTES code, or that produces reader-facing output,
MUST be frontier-class. No llama. No tiny or legacy base models. No sub-frontier
coder / distill / small-MoE models. No quantized fast/tiny variants, for any
purpose including diagnostics.

A code model's vocabulary need not be large - but it MUST write and relentlessly
iterate DEEP code at frontier performance. A 30B-class MoE (~3B active) cannot hold
that loop, and a 32B coder reliably regresses on hard code.

## 2. Why (measured, not assumed)

- llama-3.3-70b-instruct-fp8-fast, used by qnfo-paper-reviser to audit published
  research, INVENTED named living mathematicians as authors of work absent from the
  supplied source. Fabricated attribution is the single highest-cost failure in a
  publication pipeline, and in outreach email sent to real researchers.
- The router's primary code/tool path targeted qwen3-30b (30B MoE, ~3B active) while
  the frontier code model kimi-k2.7-code sat unused in the catalogue.

## 3. Banned classes (the floor)

- llama-2 / llama-3.1 / llama-3.2 / llama-3.3 / llama-4, meta-llama/*
- mistral-7b, gemma-2b, gemma-7b, gemma-3-12b
- qwen2.5-coder-32b, qwen3-30b-a3b, deepseek-r1-distill-qwen-32b, qwq-32b
- gemma-4-26b, glm-4.7-flash, glm-5.2
- any LoRA or quantized-fast variant of the above

## 4. Frontier floor (approved)

- Code: kimi-k2.7-code, deepseek-v4-pro, gpt-oss-120b, glm-5.3
- General: kimi-k2.6, deepseek-v4-flash, glm-5.3-flash
- Relay/upstream: the DeepSeek API family (deepseek-chat/reasoner) is frontier-scale.

Naming a banned model inside a COMMENT for historical documentation is allowed,
provided that line carries the MODEL-FLOOR-OK marker.

## 5. Enforcement

- scripts/model-floor-guard.mjs scans BOTH repo sources (qnfo-workers/*/worker.js)
  AND live deployed bundles (CF API /content/v2). Exit 0 = clean; exit 1 = code-level
  violation. It skips comment-only mentions and BANNED-list declarations.
- Wired into the guard cadence (same slot family as scheduler-guard / model_guard).
- Canonical: qnfo-ops/scripts/model-floor-guard.mjs (mirrored to .deepchat/scripts).

## 6. Canonical case

2026-09-11: audit found 10 workers with live code-level banned models. qnfo-ai routed
code to qwen3-30b; qnfo-agent-ws used qwen2.5-coder-32b as AGENT_MODEL; calibration /
idea-hub / intent-orchestrator / research-exec / skill-sync / ipatent / jnl-pipeline /
personal-api all carried banned models. Prior one-off purges had been reverted by
concurrent redeploys because nothing checked (this is the RECURRENCE-ZERO-1 gate).
