# Cloudflare Self-Knowledge Integration for QNFO

Date: 2026-09-07 · Status: design + seed shipped · Owner: qnfo-cloud-ops / qnfo-ops

Goal: let the QNFO fleet "apply Cloudflare to Cloudflare" — know the full Cloudflare product
universe, map it onto real fleet state (workloads, issues, resources, metrics), and use that to
recommend — and when policy allows, adopt — Cloudflare products/optimizations in response to
requests and issues. Feedback loops so the system knows more about itself and about what
Cloudflare offers over time.

## Two feedback loops (separate on purpose)

### Loop 1 — Product universe (what Cloudflare CAN do)
Maintained by Cloudflare as first-party assets:
- Need→product map: `cloudflare/skills` repo → `skills/cloudflare/SKILL.md` (extracted 2026-09-07)
- Managed remote MCP servers: docs.mcp.cloudflare.com, mcp.cloudflare.com (API+docs),
  observability.mcp.cloudflare.com, logs.mcp.cloudflare.com, ai-gateway.mcp.cloudflare.com,
  auditlogs.mcp.cloudflare.com
- Skill folders per product (agents-sdk, durable-objects, wrangler, workers-best-practices,
  cloudflare-one, web-perf, turnstile-spin, sandbox-*, nextjs-on-cloudflare, cloudflare-email-service)
- developers.cloudflare.com + changelog for feature-level deltas

### Loop 2 — Actual workload state (what QNFO DOES run / what is broken)
Already partially present:
- `service_registry` in QNFO_AUDIT (76 workers; qnfo-ops fully described; most others blank)
- `agent_issues` backlog + qnfo-error-selfheal + qnfo-backlog-exec drain
- qnfo-cloud-ops weekly visibility digest; cf_analytics (Workers AI neurons/cost, invocations)
- qnfo-kaizen (session-log mining), qnfo-skill-sync, skills-discovery (.well-known/agent-skills in R2)
- Telemetry: 24h 685 tool calls / 69 failures (10%); top failures ops_d1_query(27), run_code(12), web_fetch(9)

**Missing bridge**: a machine-readable catalog joining the product universe to the workload
state, plus a decision gate and outcome metrics. This package adds it.

## Components

### 1. cloudflare_capability_catalog table (SEEDED — qnfo-cloud-ops/migrations/2026-09-07-cf-capability-catalog.sql)
Columns: slug, need, product, when_to_choose, skill, reference, status, source, source_sha,
linked_issue, metric_ref, first_seen, last_synced.
Status lifecycle: not_considered → proposed → approved → in_use → reviewing (→ rejected/reverted).
Seed links real open issues to candidate products (504s → Workers Cache/CDN, model-router 400s →
AI Gateway, container-executor → Containers, worker exceptions → Observability, orphan probe →
DNS/registry hygiene).

### 2. Sync watcher (extension of qnfo-cloud-ops; suggested cron Mon 04:00 UTC)
- Fetch `cloudflare/skills` (git ref/API) → upsert catalog rows (new products = status not_considered)
- Read SKILL.md need→product map (parse table) and update when_to_choose on change
- Fetch Cloudflare changelog feed → feature-level deltas into catalog.last_synced / delta table
- Record source_sha for provenance
Anchor points in qnfo-cloud-ops/worker.js (v1.13.4, single-file scheduler):
- AMS_SCHEDULE object — add entry: `"cf-capability-sync": { times: ["04:00"], days: "1", fixed: null },`
- Job dispatcher — add a handler that (a) ghGet('/repos/cloudflare/skills/contents/skills/cloudflare/SKILL.md')
  to refresh rows (reuse ghHeaders/ghGet helpers), (b) upserts via env.AUDIT.prepare, (c) recordEvent
  for the delta digest. All helpers (ghGet, recordEvent, stateGet/stateSet, logRun) already exist.
Outcome: catalog never drifts from Cloudflare's own map.

### 3. Registry enrichment (Loop 2 completion — qnfo-ops worker.js v2.5.1)
- Extend /registry/refresh (registryRefresh) to also pull purpose/capabilities/routes from workers
  that expose /manifest or .well-known/agent-skills. Workers with placeholder rows (empty
  capabilities) need self-registration or manifest harvesting.
- Add `products` join (service_registry ↔ capability_catalog): which products each worker already
  uses → adoption map (in_use vs available-but-unused). registryRefresh already does add-if-missing
  (REGISTRY-PRESERVE-1), so enrichment must be additive.

### 4. Cloudflare advisor (decision gate — qnfo-ops endpoint or small worker)
When a request or agent_issue arrives:
1. Classify the concrete failure/need (error code, repeatable pattern, metric).
2. Load matching catalog rows (need LIKE / product relevance) + fleet state from registry.
3. Policy gate:
   - ALLOW if it fixes a concrete [ERROR]/[5xx]/confirmed cost or perf problem with a metric_ref
   - ALLOW if it is a drop-in config change (cache rule, route, binding)
   - DEFAULT proposed for new products/features; never auto-adopt "shiny".
4. Emit recommendation row: source=cloudflare-advisor, product, linked_issue, proposed action,
   expected metric. Manual/semi-auto applies via qnfo-ops; low-risk auto via MCP/API.
5. After adoption, write before/after metric back to catalog.metric_ref.

### 5. Kaizen feedback (close the loop)
- qnfo-kaizen re-evaluates adopted recommendations at cadence: benefit materialized → in_use;
  not materialized → reviewing then rejected + revert action.
- qnfo-cloud-ops weekly digest gains a "Cloudflare capability digest": catalog deltas, adoption
  status by product, accepted/rejected recommendations with metric deltas.

### 6. Skill distribution for agents
- Mirror relevant cloudflare/skills folders (cloudflare, wrangler, workers-best-practices,
  agents-sdk, durable-objects, web-perf, sandbox-stable) into the existing skills-discovery R2
  bucket and .well-known/agent-skills so fleet agents auto-load them per task.
- Agents needing live docs/API answers use the managed docs/API MCP servers rather than stale copies.

## Immediate issue→product recommendations (2026-09-07 audit; rows in seed)
| Issue | Class | Candidate product | Action | Metric |
|---|---|---|---|---|
| 498/499 | 504/5xx papers.qnfo.org /papers/* | Workers Cache + Cache Rules/Crawler Hints | Cache D1-backed listing; smooth crawler bursts | edge 5xx/hr |
| 489 | model-router 400 qwen3.8-27b | AI Gateway (or Workers AI catalog check) | Verify model availability; add fallback + analytics | /v1/models error rate |
| 497 | triage-probe 530 orphan | DNS + registry hygiene | Remove/point orphan probe; tie registry to DNS records | orphan probe count |
| 490/503 | worker exceptions | Workers Observability + Tail Workers | Stack traces instead of alert storms | exception MTTA |
| 502 | container-executor churn | Containers / Sandbox | Evaluate managed containers for pilot | exception rate |
| blank registry rows | ~60 workers empty capabilities | Self-registration/manifest harvest | Adopt registry self-registration | % registry rows with capabilities |

## Phases
- P0 (done 2026-09-07): audit doc, catalog DDL+seed, design, mapping, backlog drain, telemetry self-heal run.
- P1 (this commit): migration SQL landed at qnfo-cloud-ops/migrations/2026-09-07-cf-capability-catalog.sql.
  Backend apply steps remaining: run the migration against QNFO_AUDIT (qnfo-ops deploy/migration runner),
  add the sync-watcher cron + handler (anchor points above), registry-refresh enrichment, advisor endpoint.
- P2: skills mirror into skills-discovery; kaizen outcome re-evaluation; weekly capability digest.
- P3: policy-gated auto-adoption for low-risk config changes (cache rules, routes, bindings) with
  before/after metrics; quarterly catalog prune (rejected/reverted rows).
