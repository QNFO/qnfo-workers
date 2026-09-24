# qnfo-artifact-agent

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Agents SDK agent (durable ArtifactAgent DO) that provisions and hands off Cloudflare Artifacts workspaces.
> Canonical source: this directory (QNFO/qnfo-workers)
> Deployed: qnfo-artifact-agent.q08.workers.dev (v1.0.2)
> Version: src/server.js VERSION + /health

## Auth (I1 — fail-closed)

Every route except `/health` and `/` requires `Authorization: Bearer <ARTIFACTS_TOKEN>`.

| condition | result |
|---|---|
| `ARTIFACTS_TOKEN` secret unset | **503** `auth_unconfigured` (never degrades to open) |
| missing / incorrect bearer | **401** `unauthorized` |
| correct bearer | normal response |

The gate is enforced twice — in the worker `fetch` (before `routeAgentRequest`) and
again in the DO's `onRequest` — so a future direct binding/RPC path cannot bypass it.
Comparison is constant-time (`safeEqual`). `/health` stays open so the
`registryRefresh` version sweep can read `version`.

Set the secret (value is never committed):

```
printf '%s' "$TOKEN" | npx wrangler secret put ARTIFACTS_TOKEN --name qnfo-artifact-agent
```

## Routes (Agent scope)

The Agents SDK **kebab-cases the Durable Object binding name** when it builds the URL.
Binding `ArtifactAgent` therefore appears as the path segment `artifact-agent`:

```
GET  /health                                        worker liveness (OPEN)
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
npm install                      # agents ^0.22.0 -> ~166 packages
npx wrangler deploy --dry-run --outdir dist
grep -c "class Agent" dist/server.js   # must be > 0  (expect ~2055 KiB upload)
python ../scripts/deploy_guard.py with-lock qnfo-artifact-agent <from> <to> -- \
  "C:/Program Files/nodejs/node.exe" "C:/Users/LENOVO/npm-global/node_modules/wrangler/bin/wrangler.js" deploy
```

Two operational hazards, both observed on this host:

1. **Do not dry-run before `npm install` finishes.** With a partial `node_modules`,
   esbuild silently externalizes `agents` and emits a ~5 KiB bundle whose
   `class Agent` count is 0. Confirm the bundle is ~2 MiB before deploying.
2. **Verify `src/server.js` is non-zero before editing.** The working copy was once
   found truncated to 0 bytes while `HEAD` and the live worker were intact; restore
   with `git restore` and re-check `wc -c` after every edit session.
