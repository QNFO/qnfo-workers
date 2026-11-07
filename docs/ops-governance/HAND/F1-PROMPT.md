# TASK: Repoint all Fleet AI consumers to Cloudflare AI Gateway dynamic routes

## Context
Our AI cost audit (Oct 2026) found Workers AI spend of ~$215/month, driven mainly by the
`qnfo-agents` worker calling `@cf/moonshotai/kimi-k2.7-code` directly in tight loops
(64k+ requests/month, 16–34k input tokens each). To fix this, three dynamic routes were
deployed and verified ACTIVE on the `default` AI Gateway. Your job: migrate every consumer
from hardcoded model IDs to these routes.

## Environment facts (do not re-discover, use as-is)
- Cloudflare account: `quniverse` (ID: edb167b78c9fb901ea5bca3ce58ccc4b)
- Gateway ID: `default`
- Gateway endpoint (OpenAI-compatible):
  https://gateway.ai.cloudflare.com/v1/edb167b78c9fb901ea5bca3ce58ccc4b/default/compat/chat/completions
- From inside a Worker, use the AI binding:
  `env.AI.run("dynamic/<route>", { messages }, { gateway: { id: "default" } })`

## The routes (already live — do NOT create or modify them)
| Route name          | Fallback chain                                        | Cost in/out per 1M tok | Use for                              |
|---------------------|-------------------------------------------------------|------------------------|--------------------------------------|
| `dynamic/value`     | glm-4.7-flash → qwen3-30b-a3b → llama-3.2-3b          | $0.06 / $0.40          | bulk, summaries, classification, glue |
| `dynamic/standard`  | deepseek-v4.1-flash-1017 → gemma-4-26b → gpt-oss-120b | $0.30 / $1.20          | DEFAULT for all general workloads    |
| `dynamic/premium`   | kimi-k2.6 → glm-5.2 → anthropic/claude-sonnet-5.5     | $0.95 / $4.00          | hard reasoning/coding ONLY           |

Routes accept the OpenAI chat completions request shape only. The response headers
`cf-aig-model` and `cf-aig-provider` tell you which model actually served the request.

## Scope of work
1. Search the codebase(s) for direct model references, including but not limited to:
   - `@cf/moonshotai/kimi-k2.7-code`, `@cf/moonshotai/kimi-k2.6`
   - `@cf/zai-org/glm-5.3`, `@cf/zai-org/glm-5.2`, `@cf/deepseek-ai/deepseek-v4-pro-0813`
   - any `model:` / `model =` / env var (e.g. `MODEL`, `AI_MODEL`) holding a direct model ID
2. Apply this mapping unless a call site is explicitly documented as premium-critical:
   - Default replacement: `dynamic/standard`
   - Background/batch/cleanup/summary/health-check workloads: `dynamic/value`
   - Call sites doing multi-step agentic coding or complex reasoning: `dynamic/premium`
3. The `qnfo-agents` worker is the top priority — it must default to `dynamic/standard`.
4. Keep provider/base-URL configuration pointing at the gateway; only model strings change.
5. If a consumer hardcodes fallback logic of its own, remove it — the routes handle
   fallback server-side now.
6. Add a short note to each touched README/config header: "models routed via AI Gateway
   dynamic routes — see qnfo-ops issue #7".

## Constraints
- Do not change gateway configuration, spend limits, or the routes themselves.
- Do not introduce new dependencies; use existing AI binding / fetch patterns.
- Preserve request/response handling — dynamic routes answer in chat-completions format.
- Do not touch Anthropic-specific client code paths beyond pointing them at
  `dynamic/premium` (tracked separately in qnfo-ops issue #8).

## Acceptance criteria
- [ ] `grep -r "kimi-k2.7-code" .` returns nothing outside docs/changelog
- [ ] `qnfo-agents` worker defaults to `dynamic/standard`
- [ ] Bulk/background jobs use `dynamic/value`
- [ ] All touched services pass existing tests / smoke checks
- [ ] A summary table of old model → new route per call site is included in the PR

Reference: QNFO/qnfo-ops issue #7. Est. savings: $150–190/month.
