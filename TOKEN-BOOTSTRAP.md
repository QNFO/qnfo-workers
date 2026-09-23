# QNFO Worker Token Bootstrap

Every QNFO Worker that gates on a shared-secret token (`MCP_TOKEN`, `SYNC_TOKEN`, `INTENT_TOKEN`, `INFRA_TOKEN`, `SOCIAL_TOKEN`, ...) needs manual secret provisioning on first deploy. Secrets are one-way — they cannot be read back via the API.

## Provisioning

1. Generate: `python -c "import secrets; print(secrets.token_urlsafe(32))"` (43 chars, URL-safe).
2. Set (wrangler is canonical; the raw API PATCH returns 10405 for account tokens):
   ```bash
   printf '%s' "$TOKEN" | wrangler secret put <NAME> --name <worker>
   ```
3. Verify: the gated endpoint accepts it (e.g. `POST /mcp` with `Authorization: Bearer <token>` returns a JSON-RPC initialize, not 401; `POST /task` with `X-Sync-Token` returns 202, not 401).
4. Wire clients: MCP clients hold the value locally (e.g. Chatbox `config.json` -> `settings.mcp.servers[].transport.headers.Authorization`).

## Current QNFO agent tokens (re-issued 2026-08-28, CLOUD-SYNC P2)

| Worker | Secret | Client |
|---|---|---|
| qnfo-tools-mcp | MCP_TOKEN | Chatbox (http transport, Bearer) |
| qnfo-agent-orchestrator | SYNC_TOKEN | direct API callers |

Local copy (operational dir, never committed): `C:\Users\LENOVO\.deepchat\secrets\qnfo-agent-tokens.json`

## Rules

- NEVER commit a secret value.
- NEVER attempt to read a secret via the API (impossible) — re-issue instead, but only when no client depends on the old value (a zero-caller tier is safe to re-issue).
- `wrangler deploy` preserves secrets not listed in the config (verified 2026-08-28).
- Account API tokens cannot call `/user/*` endpoints (1000) — use account-scoped calls; the `execute` tool's embedded token is invalid — use `wrangler` or `$CLOUDFLARE_API_TOKEN` in exec.
