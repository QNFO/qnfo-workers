# qnfo-ops — OPS/INFRASTRUCTURE AI EXECUTION ENDPOINT

Separate OpenAI-compatible AI endpoint (DeepChat + ChatBox) for QNFO cloud-native
fleet operations. Deliberately SEPARATE from qnfo-ai (research) and personal-api
(personal): ops commands ("check my email", "audit/fix this issue", "execute this
research", "list open issues", fleet status) belong HERE, not in the research feed.

Advertised capabilities (see /health + /v1/models): chat, agent (server tool loop),
code (code-shaped ops via typed tools), streaming, tool_use.

## Endpoint
- Base URL: https://qnfo-ops.q08.workers.dev/v1  (workers_dev subdomain)
- Health:   https://qnfo-ops.q08.workers.dev/health
- Fleet:    https://qnfo-ops.q08.workers.dev/fleet (service-binding probes)
- Models:   ops-exec (default; agent + tools), deepseek-v4-flash
- Auth:     POST /v1/chat/completions with Bearer OPS_ROUTER_AUTH_KEY
  (secret; mirror in ~/.env. ChatBox/DeepChat store it as the provider API key.)

## Upstream
api.deepseek.com direct (DEEPSEEK_API_KEY secret). Tool calling verified live.
Daily soft cap: OPS_DAILY_CAP env (default 5000 for DeepChat main-agent traffic;
fallback 250) chats per UTC day (from ops_ai_log audit trail).

## Deploy
```
cd qnfo-workers/qnfo-ops
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=edb167b78c9fb901ea5bca3ce58ccc4b wrangler deploy
```
worker.js is the canonical source AND the deployed artifact (no build step).
deployed-current.worker.js mirrors it byte-for-byte after every deploy.

## Key rotation (OPS_ROUTER_AUTH_KEY)
1. Generate: node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
2. Update worker secret: PUT /accounts/{acct}/workers/scripts/qnfo-ops/secrets (type secret_text)
3. Mirror to ~/.env (OPS_ROUTER_AUTH_KEY=...)
4. Update DeepChat provider QNFO-OPS api_key + ChatBox qnfo-ops provider apiKey
5. Verify: an authorized chat probe returns 200; an old-key probe returns 401

## Bindings (wrangler.toml)
- D1 QNFO_AUDIT -> qnfo-audit (ops_ai_log, cloud_ops_events, agent_issues)
- 12 service bindings: LIFECYCLE EMAIL ORCH INDEXER KAIZEN GATEWAY ARCHIVE AI
  AISEARCH MEMORY SKILLSYNC (preserved from v0.4 stub) + BACKLOG (qnfo-backlog-exec)
- Secrets: OPS_ROUTER_AUTH_KEY, DEEPSEEK_API_KEY, EMAIL_API_KEY (preserved)

## Feed isolation (HARD property)
qnfo-ops NEVER writes ai_queries / chatbox_conversations / intent_express_log and
never calls the intent orchestrator. Its full audit trail is qnfo-audit.ops_ai_log
(one row per chat) + cloud_ops_events (kind=ops_ai_tool, job=qnfo-ops). Companion
guard on the research side: qnfo-ai v5.16.6+ skips auto-express for ops phrasing.

## Constraints (honest, verified)
- Workers runtime disallows request-time eval/new Function, so pure-compute code runs
  via the run_code tool on the Dynamic Workers LOADER binding (isolated: no network,
  filesystem, secrets or bindings). SQL/objects/keys/fleet/mailbox run via the typed
  tools (ops_d1_query, r2_list/r2_get, kv_get, fleet_status, email_check/email_stats).
- ops_d1_query is strictly read-only: SELECT/WITH only; mutation keywords are
  rejected anywhere in the statement (audit HARD-1 2026-09-03). Consequence: text
  searches for words like "delete" inside titles need LIKE with the word split.
- No second upstream fallback (deliberate: single-upstream simplicity; failures are
  visible and logged; revisit if DeepSeek outages become frequent).

## Version history
- v1.0.0 2026-09-03 — ops AI gateway + tools + isolation (replaces v0.4 fleet-probe stub)
- v1.0.1 2026-09-03 — drop new Function sandbox (runtime constraint); add ops_fleet_log tool; final-answer round
- v1.0.2 2026-09-03 — user-affirmation gate for ops_issue_run + DATA-ONLY tool-result boundary (red-team HARD-1)
- v1.0.3 2026-09-03 — d1 read-only guard hardened (audit HARD-1); daily cap 250/UTC day; /v1/models capability advertisement
- v1.0.4 2026-09-03 — /cost route (utc-day + 30d spend from ops_ai_log) + guarded email_mark / email_respond tools (reply-to-inbound only; user-affirmation + negation-aware; spam-token subject rejection)

## Hybrid mode (HYBRID-MODEL-1, v1.9.0+)
Tool-carrying clients (DeepChat main agent) get MERGED tools: client-native tools
(client wins on name collision) + server ops tools. Server tools execute server-side
inside the loop; pure client-tool rounds hand back to the client with
finish_reason=tool_calls so the client's native toolchain (subagents/skills/files/
code mode) keeps working. ChatBox keeps the pure server loop. The client's system
prompt is preserved; a compact ops-tool context is appended to it.

## Environment knobs (PARAM-TUNE-1)
- OPS_ANSWER_CAP (16384) - final-answer token cap (hard cap DEFAULT_MAX_OUT)
- OPS_TOOL_ROUND_MAX (2000) - per-tool-round token budget
- OPS_LOOP_DEADLINE_MS (30000) - agent-tool loop wall budget
- OPS_MAX_TOOL_ITERS (8) - max tool rounds per request
- OPS_TOOL_RESULT_CAP (16000) - tool-result text cap (chars)
- OPS_TEMPERATURE (0.5) / OPS_TOP_P (0.9) - defaults when the client sends none
- OPS_DAILY_CAP (5000) - chats per UTC day

## Version history (continued)
- v1.9.0 2026-09-04 — HYBRID-MODEL-1 merged tool loop; ANSWER-ROUND-1 no-tools answer
  round at full cap (fleet truncation fix); STREAM-FINAL-1 token-streamed final answers
  + heartbeats (first_byte 0.14s); FLEET-COMPACT-1 parallel probes + handler-type
  compaction (fleet 13.0s->6.1s); RELAY-COST-1 relay cost tracking via include_usage
  tee; PARAM-TUNE-1 env knobs; relay honors client temperature/top_p.
