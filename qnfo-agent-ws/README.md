# qnfo-agent-ws

Archived source; the Worker is absent from the live fleet. The `RETIRED` marker
prevents canonical deployment from recreating it.

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Agent websocket workspace (durable QnfoAgent)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

The source and `deployed-current.worker.js` are retained as an archival snapshot,
not as a live deployment target.

Runtime contract:
- `GET /health` reports `capabilities`, `limitations`, and non-secret binding availability.
- `POST` routes and `/agents/*` require `X-Sync-Token` or bearer authentication; the Worker fails closed when `SYNC_TOKEN` is unset.
- Public debug probes are intentionally not exposed. Do not restore them; use authenticated observability instead.
- Chat history and agent state persist, but model responses are buffered before delivery. The OpenAI-compatible SSE route emits one content chunk rather than token-by-token output.
- Cloudflare API MCP tools require `CF_API_TOKEN`. Inbound email is routed to the agent but does not generate an automatic reply.
