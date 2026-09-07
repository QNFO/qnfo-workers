-- 2026-09-07b-machine-self-description.sql
-- Additive D1 migration (QNFO_AUDIT) for machine-readable self-description & self-documentation.
-- Companion to 2026-09-07-cf-capability-catalog.sql (cloudflare_capability_catalog + issue links).
-- Safe one-time migration: ALTERs run once; tables/indexes use IF NOT EXISTS.

-- 1. Extend service_registry with machine-doc pointers + product usage summary.
ALTER TABLE service_registry ADD COLUMN self_description_url TEXT;
ALTER TABLE service_registry ADD COLUMN llms_url TEXT;
ALTER TABLE service_registry ADD COLUMN skills_url TEXT;
ALTER TABLE service_registry ADD COLUMN cloudflare_products TEXT; -- JSON array summary
ALTER TABLE service_registry ADD COLUMN schema_version TEXT DEFAULT 'self-description-2026-09-07';

-- 2. service_self_descriptions: crawled copy of each service's /.well-known/self.json
--    (validated against machine-readability/service-self-description.schema.json).
CREATE TABLE IF NOT EXISTS service_self_descriptions (
  service            TEXT PRIMARY KEY,
  kind               TEXT,
  version            TEXT,
  purpose            TEXT,
  purpose_keywords   TEXT,               -- JSON array
  capabilities       TEXT,               -- JSON array
  routes             TEXT,               -- JSON array
  bindings           TEXT,               -- JSON array
  cloudflare_products TEXT,              -- JSON array (advisor input: what is already in use)
  health_status      TEXT DEFAULT 'unknown',
  self_url           TEXT,
  llms_url           TEXT,
  skills_url         TEXT,
  prompt_urls        TEXT,               -- JSON array
  schema_version     TEXT DEFAULT 'self-description-2026-09-07',
  source             TEXT DEFAULT 'registry-refresh',
  updated_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_ssd_kind ON service_self_descriptions(kind);
CREATE INDEX IF NOT EXISTS idx_ssd_updated ON service_self_descriptions(updated_at);

-- 3. cf_advisory_decisions: decision-gate log for Cloudflare product/feature recommendations.
--    Feedback loop: proposed -> approved -> applied (record outcome_before/after) -> kaizen
--    re-evaluates -> reverted if benefit did not materialize.
CREATE TABLE IF NOT EXISTS cf_advisory_decisions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_issue_id     INTEGER,            -- linked agent_issues.id when issue-driven
  catalog_product    TEXT,               -- slug from cloudflare_capability_catalog
  feature            TEXT,
  recommendation     TEXT,
  rationale          TEXT,
  decision           TEXT DEFAULT 'proposed'
                     CHECK (decision IN ('proposed','approved','applied','rejected','reverted')),
  outcome_metric     TEXT,               -- e.g. error-rate, p95-latency, cost/1M-invocations
  outcome_before     TEXT,
  outcome_after      TEXT,
  created_at         TEXT,
  decided_at         TEXT,
  reverted_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON cf_advisory_decisions(decision);
CREATE INDEX IF NOT EXISTS idx_decisions_issue ON cf_advisory_decisions(agent_issue_id);
CREATE INDEX IF NOT EXISTS idx_decisions_product ON cf_advisory_decisions(catalog_product);

-- Read path for the advisor: join catalog <- issue <- decisions:
--   SELECT c.product_slug, i.title, d.decision, d.outcome_metric
--   FROM cloudflare_capability_catalog c
--   LEFT JOIN cf_advisory_decisions d ON d.catalog_product = c.product_slug
--   LEFT JOIN agent_issues i ON i.id = d.agent_issue_id;
