# qnfo-ops — OPS/INFRASTRUCTURE AI EXECUTION ENDPOINT

Separate OpenAI-compatible AI endpoint (DeepChat + ChatBox) for QNFO cloud-native
fleet operations. Deliberately SEPARATE from qnfo-ai (research) and personal-api
(personal): ops commands ("check my email", "audit/fix this issue", "execute this
research", "list open issues", fleet status) belong HERE, not in the research feed.

## Endpoint
- Base URL: https://qnfo-ops.q08.workers.dev/v1  (workers_dev subdomain)
- Health:   https://qnfo-ops.q08.workers.dev/health
- Fleet:    https://qnfo-ops.q08.workers.dev/fleet (service-binding probes)
- Models:   ops-exec (default, agent + tools), deepseek-v4-flash
- Auth:     POST /v1/chat/completions with `Authorization: Bearer <OPS_ROUTER_AUTH_KEY>`
  (secret; mirror in ~/.env. ChatBox/DeepChat store it as the provider API key.)

## Upstream
api.deepseek.com direct (DEEPSEEK_API_KEY secret) — same key DeepChat uses for the
native deepseek provider. Tool calling verified live (function calls + tool_choice auto).

## Deploy
```
cd qnfo-workers/qnfo-ops
CLOUDFLARE_API_TOKEN=$(...) CLOUDFLARE_ACCOUNT_ID=edb167b78c9fb901ea5bca3ce58ccc4b wrangler deploy
```
worker.js is the canonical source AND the deployed artifact (no build step).
deployed-current.worker.js mirrors it byte-for-byte after every deploy.

## Bindings (wrangler.toml)
- D1 QNFO_AUDIT -> qnfo-audit (ops_ai_log, cloud_ops_events, agent_issues)
- 12 service bindings: LIFECYCLE EMAIL ORCH INDEXER KAIZEN GATEWAY ARCHIVE AI
  AISEARCH MEMORY SKILLSYNC (preserved from v0.4 stub) + BACKLOG (qnfo-backlog-exec)
- Secrets: OPS_ROUTER_AUTH_KEY, DEEPSEEK_API_KEY, EMAIL_API_KEY (preserved)

## Feed isolation (HARD property)
qnfo-ops NEVER writes ai_queries / chatbox_conversations / intent_express_log and
never calls the intent orchestrator. Its full audit trail is qnfo-audit.ops_ai_log
(one row per chat) + cloud_ops_events (kind=ops_ai_tool, job=qnfo-ops). Verified live
2026-09-03: ops probes produced zero rows in the research stores while ops_ai_log
grew. Companion guard on the research side: qnfo-ai v5.16.6 skips auto-express for
ops-command phrasing (QNFO.OPS.015), so even commands typed at the research endpoint
do not clutter the ideas stream.

## Constraints (honest, verified)
- Workers runtime disallows dynamic code generation (eval/new Function):
  arbitrary JS snippets CANNOT run inside the worker. Code-shaped ops execute via the
  typed tools (ops_d1_query SQL, ops_issue_run drains, fleet_status probes,
  email_check/email_stats). The endpoint states this plainly when asked for raw JS.

## Version history
- v1.0.0 2026-09-03 — ops AI gateway + tools + isolation (replaces v0.4 fleet-probe stub)
- v1.0.1 2026-09-03 — drop new Function sandbox (runtime constraint); add ops_fleet_log
  tool (own audit log reader); final-answer round after tool-call cap
