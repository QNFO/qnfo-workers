# qnfo-artifact-agent

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Agents SDK agent (durable ArtifactAgent DO) that provisions and hands off Cloudflare Artifacts workspaces.
> Canonical source: this directory (QNFO/qnfo-workers)
> Deployed: qnfo-artifact-agent.q08.workers.dev (v1.0.1)
> Version: src/server.js VERSION + /health

## Routes (Agent scope)

The Agents SDK **kebab-cases the Durable Object binding name** when it builds the URL.
Binding `ArtifactAgent` therefore appears as the path segment `artifact-agent`:

```
GET  /health                                        worker liveness
GET  /agents/artifact-agent/:session/health         agent session identity
GET  /agents/artifact-agent/:session/ledger         durable workspace ledger
GET  /agents/artifact-agent/:session/repos          repos in the qnfo namespace
POST /agents/artifact-agent/:session/provision      { unit, kind } -> create an isolated repo
POST /agents/artifact-agent/:session/token          { repo, scope, ttl }
GET  /agents/artifact-agent/:session/log?repo=:name
```

Requesting `/agents/ArtifactAgent/:session/...` returns HTTP 400 `Invalid request`
(`routeAgentRequest` logs "does not match any Durable Object binding").

Bindings: `ARTIFACTS` (namespace qnfo), `AI`, Durable Object `ArtifactAgent`
(`new_sqlite_classes` migration tag `v1`).

## Build / deploy

```
npm install                      # agents ^0.22.0 -> ~166 packages, ~2 min
npx wrangler deploy --dry-run --outdir dist
grep -c "class Agent" dist/server.js   # must be > 0  (expect 2053 KiB upload)
python ../scripts/deploy_guard.py with-lock qnfo-artifact-agent <from> <to> -- \
  "C:/Program Files/nodejs/node.exe" "C:/Users/LENOVO/npm-global/node_modules/wrangler/bin/wrangler.js" deploy
```

Do **not** dry-run before `npm install` finishes: with a partial `node_modules`
esbuild silently externalizes `agents` and emits a ~5 KiB bundle whose
`class Agent` count is 0. Wait for install completion, then confirm the bundle
size (~2 MiB) before deploying.
