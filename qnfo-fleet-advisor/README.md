# qnfo-fleet-advisor

**Cloudflare AI Agent (Agents SDK Think harness) — the fleet's AI Gateway + Workers AI advisor.**
100% server-side, 100% autonomous audit -> optimize -> fix -> upgrade loop.

## Capabilities
- **Deterministic audit** (Worker cron 17 */4 * * * + POST /run): live AI Gateway config
  (spend guard, caching, rate limits, retries, logging) + last-50 gateway logs -> metrics
  (cache hit ratio, per-model cost/latency/failures) -> findings -> Tier-1 autonomous fixes
  (spend-limit mandate parity $90/30d; capped 2 mutations/cycle, 24h-deduped) ->
  Tier-2 agent_issues filing (open-title deduped).
- **LLM advisory turns** (Think scheduled task every 8h + interactive RPC): adversarial
  evidence-first review of the latest snapshot with D1-backed tools
  (advisor_snapshot / advisor_insight / run_deterministic_audit).
- **Ledgers**: ai_advisor_runs, ai_advisor_insights, ai_advisor_actions in qnfo-audit D1;
  improvement candidates flow into kaizen_candidates (self-improvement feed).

## Endpoints
- GET /health - version + self-doc
- POST /run (Authorization: Bearer ADVISOR_TOKEN) - deterministic audit now
- GET /init - ensure the advisor Durable Object exists (arms Think schedules)
- /agent/* - Think agent RPC/chat

## Deploy
npm install
wrangler secret put CF_API_TOKEN
wrangler secret put ADVISOR_TOKEN
wrangler deploy

## Safety tiers
Tier 1 (auto-applied, reversible, capped): gateway config mutations aligned to fleet mandates.
Tier 2 (auto-filed, deduped): agent_issues tickets.
Tier 3 (proposed only): kaizen_candidates -> review disposition.
Self-improvement: the advisor's own metrics/version are part of every run digest.
