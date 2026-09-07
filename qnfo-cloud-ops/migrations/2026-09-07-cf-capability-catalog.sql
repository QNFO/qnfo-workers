-- ============================================================================
-- QNFO Cloudflare capability catalog (need -> product map)
-- Source: https://github.com/cloudflare/skills (skills/cloudflare/SKILL.md) 2026-09-07
-- Target DB: QNFO_AUDIT (D1, database qnfo-audit). Apply via the qnfo-ops migration
-- runner / /registry/refresh extension or qnfo-infra cron (db binding AUDIT).
-- Gives ops-exec/back-end a machine-readable "what Cloudflare can do" universe so the
-- fleet can recommend Cloudflare products/optimizations against real workload state.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cloudflare_capability_catalog (
  slug          TEXT PRIMARY KEY,
  need          TEXT NOT NULL,                -- "what you need to do"
  product       TEXT NOT NULL,                -- product/tool to consider
  when_to_choose TEXT,                        -- deciding requirement
  skill         TEXT,                         -- cloudflare/skills folder if any
  reference     TEXT,                         -- docs/reference path or URL
  status        TEXT NOT NULL DEFAULT 'not_considered',
                -- not_considered | proposed | approved | in_use | reviewing | rejected
  source        TEXT NOT NULL DEFAULT 'cloudflare-skills',
  source_sha    TEXT,
  linked_issue  INTEGER,                      -- agent_issues.id
  metric_ref    TEXT,                         -- before/after metric key
  first_seen    TEXT DEFAULT (datetime('now')),
  last_synced   TEXT DEFAULT (datetime('now'))
);

-- Seed: QNFO-relevant rows from the need->product map (full map in SKILL.md).
INSERT OR IGNORE INTO cloudflare_capability_catalog
  (slug, need, product, when_to_choose, skill, reference) VALUES
('app-hosting','Host a new static site, SPA, or full-stack app','Workers + Workers Static Assets','Serve site files and add server-side logic where needed','workers-best-practices','https://developers.cloudflare.com/workers/static-assets/'),
('api-webhooks','Build an API or handle webhooks','Workers','Run request handlers with access to Cloudflare services','workers-best-practices','https://developers.cloudflare.com/workers/'),
('stateful-coordination','Coordinate chat rooms, documents, bookings or per-entity state','Durable Objects','Operations need shared state and coordination per room/document/entity','durable-objects','https://developers.cloudflare.com/durable-objects/'),
('relational-sql','Store application records and query with SQL','D1','Managed relational database from Workers','wrangler','https://developers.cloudflare.com/d1/'),
('kv-config','Distribute config or key-value data','KV','Read-heavy key-value access fits the consistency requirements','wrangler','https://developers.cloudflare.com/kv/'),
('object-storage','Store uploads, downloads, or large objects','R2','Store files by object key; pair with D1 for searchable metadata','wrangler','https://developers.cloudflare.com/r2/'),
('app-caching','Cache application responses','Workers Cache','Default for application caching (HTTP cache + Cache API)','workers-best-practices','https://developers.cloudflare.com/workers/cache/'),
('cdn-caching','Accelerate an existing website and control cached content','Cache/CDN (Cache Rules, TTL, purge)','Configure caching for a proxied origin','','https://developers.cloudflare.com/cache/'),
('durable-cache','Keep origin content in a persistent cache','Cache Reserve','Reduce origin fetches with persistent CDN cache storage','','https://developers.cloudflare.com/cache/cache-reserve/'),
('async-jobs','Process jobs asynchronously or buffer bursts of work','Queues','Decouple producers and consumers','wrangler','https://developers.cloudflare.com/queues/'),
('durable-steps','Run a job that retries, waits, resumes across steps','Workflows','Coordinate durable multi-step processes','wrangler','https://developers.cloudflare.com/workflows/'),
('scheduled','Start a Worker on a recurring schedule','Cron Triggers','Trigger scheduled work; combine with Queues/Workflows for the work','wrangler','https://developers.cloudflare.com/workers/configuration/triggers/cron-triggers/'),
('managed-inference','Run language, embedding, image, or speech models','Workers AI','Use managed inference; verify model capabilities and pricing','wrangler','https://developers.cloudflare.com/workers-ai/'),
('managed-rag','Add managed search or answers over your content','AI Search','Managed retrieval-augmented generation pipeline','','https://developers.cloudflare.com/ai-search/'),
('semantic-search','Build custom semantic search or retrieval','Vectorize + Workers AI','Control embeddings, indexing, retrieval','wrangler','https://developers.cloudflare.com/vectorize/'),
('ai-observability','Observe and control requests to AI providers','AI Gateway','Add inference analytics, caching, request controls, fallbacks','','https://developers.cloudflare.com/ai-gateway/'),
('agents','Build stateful agents with tools, scheduling, chat','Agents SDK','Implement agent behavior on Cloudflare','agents-sdk','https://developers.cloudflare.com/agents/'),
('untrusted-code','Execute generated or untrusted code / Code Mode tools','Dynamic Workers','Load code at runtime in isolated Workers','','https://developers.cloudflare.com/dynamic-workers/'),
('sandbox','Give an agent a shell/filesystem/IDE','Sandbox SDK','Code execution needs Linux or container tools','sandbox-stable','https://developers.cloudflare.com/sandbox/'),
('containers','Run containerized services or Linux software','Containers','Workload needs a container image outside Workers runtime','','https://developers.cloudflare.com/containers/'),
('mcp','Expose tools through a remote MCP server','Workers + Agents SDK','Publish tools for MCP clients with auth','agents-sdk','https://developers.cloudflare.com/agents/model-context-protocol/'),
('browser-automation','Automate browsers, screenshots, rendered pages','Browser Run','Task requires a browser rather than plain HTTP','','https://developers.cloudflare.com/browser-rendering/'),
('dns','Connect a domain, configure DNS, troubleshoot resolution','DNS','Manage authoritative records / proxied traffic','','https://developers.cloudflare.com/dns/'),
('tls','Configure HTTPS and certificates','SSL/TLS','Secure visitor->CF and CF->origin connections','','https://developers.cloudflare.com/ssl/'),
('load-balancing','Distribute traffic across origins, fail over unhealthy servers','Load Balancing','Use health checks and steering for multiple origins','','https://developers.cloudflare.com/load-balancing/'),
('tunnel','Connect an existing server to Cloudflare','Cloudflare Tunnel','Reach an origin without a public routable IP','','https://developers.cloudflare.com/tunnels/'),
('rules','Redirect URLs, rewrite paths/headers, origin routing','Rules','Redirect/Transform/Origin Rules can express the behavior','','https://developers.cloudflare.com/rules/'),
('waf','Filter malicious web requests','WAF','Apply application-layer rules and managed protections','','https://developers.cloudflare.com/waf/'),
('ddos','Protect services from denial-of-service','DDoS Protection','Mitigate attacks at network or application layer','','https://developers.cloudflare.com/ddos-protection/'),
('bot-mgmt','Detect and control automated traffic','Bot Management','Make request decisions based on bot detection','','https://developers.cloudflare.com/bot-management/'),
('observability','Observe Workers: logs, traces, exceptions','Workers Observability + Tail Workers','Debug runtime errors and monitor health','','https://developers.cloudflare.com/workers/observability/'),
('analytics','Query account/HTTP analytics','Cloudflare Analytics (GraphQL)','Account-wide usage, invocations, cost','','https://developers.cloudflare.com/analytics/graphql-api/'),
('data-localization','Control where data is processed/stored','Data Localization Suite','Regional processing/storage controls required','','https://developers.cloudflare.com/data-localization/');

-- Apply issue-linked adoption recommendations (2026-09-07 audit pass).
UPDATE cloudflare_capability_catalog SET
  status='proposed', linked_issue=498, metric_ref='papers.qnfo.org edge 5xx/hr',
  when_to_choose='Chronic ~18-22/hr 504s on /papers/* D1-backed listing: cache listing responses, reduce origin/D1 pressure'
WHERE slug='app-caching';
UPDATE cloudflare_capability_catalog SET
  status='proposed', linked_issue=498, metric_ref='papers.qnfo.org origin fetch ratio',
  when_to_choose='Crawler/first-visitor bursts hit origin; cache + cache rules smooth cold-D1'
WHERE slug='cdn-caching';
UPDATE cloudflare_capability_catalog SET
  status='proposed', linked_issue=489, metric_ref='qnfo-ai /v1/models error rate',
  when_to_choose='Model-router 400s (qwen3.8-27b): route through AI Gateway for model availability checks, analytics and fallbacks'
WHERE slug='ai-observability';
UPDATE cloudflare_capability_catalog SET
  status='in_use', linked_issue=506, metric_ref='tool failure rate',
  when_to_choose='Already used for Workers AI inference on the fleet'
WHERE slug='managed-inference';
UPDATE cloudflare_capability_catalog SET
  status='proposed', linked_issue=502, metric_ref='container-executor exception rate',
  when_to_choose='Container workloads (qnfo-containers-pilot) map to Containers/Sandbox; evaluate managed containers to reduce custom executor churn'
WHERE slug='containers';
UPDATE cloudflare_capability_catalog SET
  status='proposed', linked_issue=490, metric_ref='worker exception MTTA',
  when_to_choose='Worker exceptions (personal-api, calendar-api): enable Workers Observability + Tail Workers for stack traces instead of alert storms'
WHERE slug='observability';
UPDATE cloudflare_capability_catalog SET
  status='proposed', linked_issue=497, metric_ref='orphan probes count',
  when_to_choose='530 orphan probe on removed/renamed worker -> DNS/registry hygiene; tie registry rows to DNS records'
WHERE slug='dns';
