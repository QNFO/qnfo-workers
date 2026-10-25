# qnfo-agent-ws

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Agent websocket workspace (durable QnfoAgent)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

Runtime contract:
- `GET /health` reports `capabilities`, `limitations`, and non-secret binding availability.
- `POST` routes and `/agents/*` require `X-Sync-Token` or bearer authentication; the Worker fails closed when `SYNC_TOKEN` is unset.
- Public debug probes are intentionally not exposed. Do not restore them; use authenticated observability instead.
- Chat history and agent state persist, but model responses are buffered before delivery. The OpenAI-compatible SSE route emits one content chunk rather than token-by-token output.
- Cloudflare API MCP tools require `CF_API_TOKEN`. Inbound email is routed to the agent but does not generate an automatic reply.
