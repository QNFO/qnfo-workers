# qnfo-agent-ws

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Agent websocket workspace (durable QnfoAgent)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js
