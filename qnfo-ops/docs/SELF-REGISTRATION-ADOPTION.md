# SELF-REGISTRATION ADOPTION RUNBOOK (SELF-REGISTER-1)

Canonical: qnfo-workers/qnfo-ops/docs/SELF-REGISTRATION-ADOPTION.md
Status: ACTIVE — pattern proven on 2 workers; rollout continues per this runbook.
Claim: every adopted worker self-documents its machine-readable manifest into the
qnfo-ops D1 service_registry (cross-service discovery, never "from memory").
Evidence: registry entries qnfo-intent-orchestrator v1.3.4 + qnfo-tools-mcp v1.1.1 went
metadata-only -> rich (verified 2026-09-04). Confidence: HIGH. Status: ACTIVE.

## Why
A Worker cannot fetch a sibling's workers.dev /health from inside a Worker (404,
same-account subrequest limitation) - so the pull-based sweep (CF API + 12
service-bound /health) leaves the long tail metadata-only. Push-based
self-registration closes that: each worker POSTs its own manifest to
https://qnfo-ops.q08.workers.dev/registry/register.

## HARD GATE (run BEFORE touching any worker)
WORKER-EDIT-BASE-VERIFY-1 / DEPLOY-LAST-WINS-RECONCILE-1:
1. Compare repo VERSION (grep the worker's VERSION const) vs DEPLOYED version
   (curl https://<worker>.q08.workers.dev/health).
2. If repo < deployed: the repo is stale (API-managed deploys outran it). DO NOT
   edit+deploy from the repo - you would REGRESS the live worker. Reconcile first:
   fetch the deployed bundle (workers_get_worker_code), adopt as canonical per
   DEPLOY-LAST-WINS-RECONCILE-1, commit, THEN adopt.
   Known drifted (2026-09-04): qnfo-infra (repo 1.2.1 vs deployed 1.5.1),
   qnfo-kaizen, qnfo-lifecycle, qnfo-archive, qnfo-paper-indexer.
3. Only repo-current workers are safe adoption targets.

## Adoption recipe (4 parts, proven on qnfo-intent-orchestrator + qnfo-tools-mcp)
1. wrangler.toml: add
   [[services]]
   binding = "QNFO_OPS"
   service = "qnfo-ops"
   environment = "production"
2. Secret: echo "$REGISTRY_TOKEN" | npx wrangler secret put REGISTRY_TOKEN
   (REGISTRY_TOKEN = shared value mirrored in ~/.env; qnfo-ops /registry/register
   accepts it via regAuthOk - constant-time compare, decoupled from the OPS key.)
3. worker.js: module-scope selfRegister(env) BEFORE 'export default' (never an
   object method - methods are not in lexical scope inside the fetch handler):
   async function selfRegister(env) { const manifest = { service: '<name>',
     kind: 'worker', version: VERSION, base_url: 'https://<name>.q08.workers.dev',
     purpose: '...', capabilities: [...], routes: [...],
     tools: <TOOLS.map(t => ({name, description})) or []>, models: [...], deps: [...] };
     return (await env.QNFO_OPS.fetch('https://qnfo-ops.internal/registry/register',
     { method: 'POST', headers: { 'Content-Type': 'application/json',
     'Authorization': 'Bearer ' + (env.REGISTRY_TOKEN || '') }, body:
     JSON.stringify(manifest) })).ok; }
4. fetch handler: signature needs ctx ('async fetch(request, env, ctx)') + on /health:
   if (ctx && ctx.waitUntil && env.QNFO_OPS && env.REGISTRY_TOKEN) {
     ctx.waitUntil(selfRegister(env).catch(e => console.log('self-register err', e && e.message || e))); }
   Then bump VERSION with a SELF-REGISTER-1 comment, dry-run, deploy, verify:
   curl https://<worker>.q08.workers.dev/health  -> triggers registration
   curl https://qnfo-ops.q08.workers.dev/registry/<name> -> entry must show
   version/capabilities/routes/tools (rich, not metadata-only).

## Status (2026-09-04)
- ADOPTED (rich registry entries): qnfo-intent-orchestrator v1.3.4,
  qnfo-tools-mcp v1.1.1 (full 15-tool MCP catalog machine-discoverable).
- SWEEP-RICH (12 service-bound workers self-doc via qnfo-ops cron /health sweep;
  no per-worker change needed): qnfo-ai, qnfo-ai-search, qnfo-archive,
  qnfo-backlog-exec, qnfo-email, qnfo-email-orchestrator, qnfo-gateway,
  qnfo-kaizen, qnfo-lifecycle, qnfo-memory-mcp, qnfo-paper-indexer, qnfo-skill-sync.
- DRIFT-BLOCKED (repo behind deployed; reconcile before adopting): qnfo-infra,
  qnfo-cloud-ops (verify), personal-api (verify), + the remaining long tail.
- NEXT TARGETS (after reconciliation): qnfo-infra, personal-api, qnfo-cloud-ops.

## Telemetry note
qnfo-ops v1.7.0 TELEMETRY-SELF-HEAL-1 auto-files agent_issues for persistent tool
failures (>=2 errors, no success since last error) - if a self-registration breaks,
the registry refresh cron + telemetry loop will surface it. The registry is
self-healing: qnfo-ops /registry/refresh runs every 30 min (cron */30).
