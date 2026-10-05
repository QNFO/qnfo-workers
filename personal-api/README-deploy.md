# personal-api deploy

worker.js is the canonical source AND the deployed bundle (no build step). `deployed-current.worker.js` is a byte-identical
mirror (mirror-guard).

## The one authoritative path (DEPLOY-PATH-CANARY-1, agent_issues #1880, recorded 2026-10-05)

1. Edit `personal-api/worker.js`, bump `var VERSION` above main and every open PR (version-bump-guard), copy it to
   `deployed-current.worker.js`, run the suites (`node personal-api/*.test.mjs`, `node --test personal-api/msgraph/msgraph.test.mjs`).
2. Open a PR in QNFO/qnfo-workers and merge it to main.
3. `.github/workflows/canonical-deploy.yml` deploys every worker whose `worker.js` or `wrangler.toml` changed by calling
   qnfo-ops `/ops/deploy`. That path takes the deploy lock, writes the ledger (`qnfo-audit.fleet_deploys`, actor
   `qnfo-ops/ops-deploy`), keeps the worker's secrets, and installs the bindings declared in `wrangler.toml` (including the
   `PERSONAL_TWIN_AGENT` Durable Object and service-binding props).
4. Verify `GET https://personal-api.q08.workers.dev/health` reports the new version.

Evidence that this path deploys personal-api: `fleet_deploys` ids 3443 and 3449 (2026-10-04T13:07Z and 13:11Z, ok=1,
actor qnfo-ops/ops-deploy) brought 4.7.0-gcal-ics live with its Durable Object and MCP capabilities intact.

Do not deploy with `wrangler deploy` from a laptop or from another repository. The QNFO/personal-life-workers repository is
not a deploy path: its repository secrets are empty, its deploy workflow was turned into a tripwire (its PR 2, 2026-10-04),
and its bundles are older than live (its PR 1 carried 4.4.0 while 4.5.1 was live).

Secrets (set with `wrangler secret put ... --name personal-api` after taking the secret lease, never committed):
API_KEY, API_KEY_2, CAL_TOKEN, CF_TOKEN, INFRA_TOKEN; MS_CLIENT_ID and MS_CLIENT_SECRET once the owner has a Microsoft app
(see msgraph/README.md).

Endpoints: `/health`, `/v1/chat/completions` (bearer key), `/v1/media`, `/mcp` (bearer key or OAuth 2.1), `/oauth/*`,
`/google/*`, `/microsoft/*`.
