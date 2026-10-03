# qnfo-tools-mcp

MCP server on Cloudflare Workers exposing QNFO tooling to any MCP client (Chatbox, Claude, etc.).
Two transports: HTTP (SSE) at `/mcp/sse?token=...` and streamable HTTP at `/mcp?token=...`.

## Tools

- `web_search` — DuckDuckGo search via the qnfo-ai router (title/url/snippet).
- `web_fetch` — readable text extraction from a URL (SSRF-guarded, routed through qnfo-ai).
- `papers_search` — semantic search over the QNFO research corpus (qwav-research-v2).
- `history_recall` — semantic recall of past research notes/queries (qnfo-ai-log).
- `personal_search` — personal-life index (notes, files, chat threads) - strictly personal side.
- `owner_queue` — what the fleet is waiting on the owner to do (the open cards on fleet.qnfo.org; read-only, public data).
- `owner_code` — emails the owner a 6-digit code (write scope). The dashboard fixes the destination; this worker cannot choose it.
- `owner_act` — done / dismiss / snooze / note on owner cards (write scope). Takes the code the owner reads from their inbox;
  one code covers a batch of up to 10 actions. This worker holds no dashboard secret: it calls the dashboard's public
  `/api/cmd/verify` and `/api/cmd/run`, so the dashboard's rules (12 h session, 15 min step-up for done/dismiss, `ha:` keys
  only for done/dismiss) stay the only gate. The code is redacted from `mcp_log`. Offline suite: `owner-queue.test.mjs`.

## Deploy

Secrets (both set to the qnfo-ai router key, `tokens/qnfo-ai`):
- `MCP_TOKEN` — token clients present (`?token=` or `Authorization: Bearer`)
- `RT` — router key used for outbound web_search/history_recall calls

```bash
cd qnfo-tools-mcp
wrangler secret put MCP_TOKEN
wrangler secret put RT
wrangler deploy
```

## Verify

```bash
curl -s https://qnfo-tools-mcp.q08.workers.dev/health
curl -s -X POST "https://qnfo-tools-mcp.q08.workers.dev/mcp?token=$KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

Client setup: see `../qnfo-ai/CHATBOX-SETUP.md`.
