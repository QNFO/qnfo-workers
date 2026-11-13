-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_cf_resource_findings; DROP TABLE IF EXISTS cf_resource_registry;
-- CF-RESOURCE-REGISTRY-1 (charter pillar cost; owner 2026-11-13: the fleet must find its own Cloudflare resources, not be told them).
-- qnfo-cloud-ops (hourly step jobResourceRegistry) enumerates the account it discovers from the token (GET /accounts): workers, D1, KV, R2,
-- queues, Vectorize. One row per resource, with 7-day usage (D1 rows read/written from d1AnalyticsAdaptiveGroups, worker requests from
-- workersInvocationsAdaptive) and an estimated monthly cost, a verdict (ok | hot | unused | gone | orphan) and a note.
-- qnfo-audit read 17.6B rows in 12 days (2026-11-01..12); this table is how the next hot database is seen within an hour.
CREATE TABLE IF NOT EXISTS cf_resource_registry (
  id TEXT PRIMARY KEY,            -- '<type>:<id>'
  rtype TEXT NOT NULL,            -- worker | d1 | kv | r2 | queue | vectorize
  rid TEXT NOT NULL,
  name TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  present INTEGER NOT NULL DEFAULT 1,
  rows_read_7d INTEGER,
  rows_written_7d INTEGER,
  requests_7d INTEGER,
  size_bytes INTEGER,
  est_monthly_usd REAL,
  verdict TEXT NOT NULL DEFAULT 'ok',
  note TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cf_resource_registry_verdict ON cf_resource_registry(verdict, rtype);
CREATE VIEW IF NOT EXISTS v_cf_resource_findings AS
  SELECT rtype, name, rid, verdict, est_monthly_usd, rows_read_7d, requests_7d, size_bytes, note, last_seen
  FROM cf_resource_registry WHERE verdict != 'ok' ORDER BY est_monthly_usd DESC, rows_read_7d DESC;
