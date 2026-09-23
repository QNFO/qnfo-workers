# qnfo-artifact-agent

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Agents SDK agent (durable ArtifactAgent DO) that provisions and hands off Cloudflare Artifacts workspaces.
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: src/server.js VERSION + /health

Agent-scoped routes (Agents SDK routing):
  GET  /health
  GET  /agents/ArtifactAgent/:session/health
  GET  /agents/ArtifactAgent/:session/ledger
  GET  /agents/ArtifactAgent/:session/repos
  POST /agents/ArtifactAgent/:session/provision   { unit, kind }
  POST /agents/ArtifactAgent/:session/token       { repo, scope, ttl }
  GET  /agents/ArtifactAgent/:session/log?repo=:name

Bindings: ARTIFACTS (namespace qnfo), AI, Durable Object ArtifactAgent.

## Build / deploy requirement (IMPORTANT)

This worker imports the `agents` npm package (^0.22.0) and therefore MUST be bundled.
On the current Windows host the local esbuild toolchain does not bundle npm dependencies
(`wrangler deploy --dry-run` emits a 5.17 KiB bundle with `Agent`/`routeAgentRequest`
unresolved), so this worker is committed as source and deploys from a working build
environment (CI / GitHub Actions) — the same route used by `qnfo-fleet-advisor`.

Verify before deploying:
  npx wrangler deploy --dry-run --outdir dist
  grep -c "class Agent" dist/server.js   # must be > 0
