# qnfo-tools-mcp

MCP server on Cloudflare Workers exposing QNFO tooling to any MCP client (Chatbox, Claude, etc.).
Two transports: HTTP (SSE) at `/mcp/sse?token=...` and streamable HTTP at `/mcp?token=...`.

## Tools

- `web_search` — DuckDuckGo search via the qnfo-ai router (title/url/snippet).
- `web_fetch` — readable text extraction from a URL (SSRF-guarded, routed through qnfo-ai).
- `papers_search` — semantic search over the QNFO research corpus (qwav-research-v2).
- `history_recall` — semantic recall of past research notes/queries (qnfo-ai-log).
- `personal_search` — personal-life index (notes, files, chat threads) - strictly personal side.

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
