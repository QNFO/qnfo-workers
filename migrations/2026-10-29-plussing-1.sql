-- PLUSSING-1 (2026-10-29, charter pillar autonomy). Owner prompt 2026-10-29: products should keep improving automatically, without the owner prompting; plussing as a fleet philosophy.
-- Adds the product register, the plus ledger and the due view that the manager tick reads (docs/PLUSSING.md); roadmap rows PLUS-1..6.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_product_plus_due; DROP TABLE IF EXISTS plus_ledger; DROP TABLE IF EXISTS product_registry; DELETE FROM roadmap_implementation WHERE source = 'plussing-2026' AND item IN ('PLUS-1','PLUS-2','PLUS-3','PLUS-4','PLUS-5','PLUS-6');

CREATE TABLE IF NOT EXISTS product_registry (
  product TEXT PRIMARY KEY,
  host TEXT,
  worker TEXT,
  program_code TEXT NOT NULL,
  what_for TEXT,
  usage_metric TEXT,
  quality_measure TEXT,
  plus_cadence_h INTEGER NOT NULL DEFAULT 168,
  last_plus_at TEXT,
  rest_until TEXT,
  misses_in_row INTEGER NOT NULL DEFAULT 0,
  pluses_since_simplify INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS plus_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'plus',
  title TEXT,
  evidence TEXT,
  predicted_outcome TEXT,
  metric TEXT,
  issue_id INTEGER,
  pr_url TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  outcome TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  decided_at TEXT
);

CREATE VIEW IF NOT EXISTS v_product_plus_due AS
SELECT p.product, p.host, p.program_code, p.last_plus_at,
  CAST((julianday('now') - julianday(COALESCE(p.last_plus_at, p.created_at))) * 24 AS INTEGER) AS hours_since_plus,
  p.plus_cadence_h, p.misses_in_row, p.pluses_since_simplify,
  CASE WHEN p.pluses_since_simplify >= 4 THEN 'simplify' ELSE 'plus' END AS next_kind,
  (SELECT COUNT(*) FROM plus_ledger l WHERE l.product = p.product AND l.status IN ('proposed','building')) AS in_flight
FROM product_registry p
WHERE p.state = 'active'
  AND (p.rest_until IS NULL OR p.rest_until <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  AND (julianday('now') - julianday(COALESCE(p.last_plus_at, p.created_at))) * 24 >= p.plus_cadence_h
ORDER BY hours_since_plus DESC;

INSERT OR IGNORE INTO product_registry (product, host, worker, program_code, what_for) VALUES
 ('companion-today', 'me.q08.org', 'personal-api', 'QNFO.PERSONAL', 'the owner''s day: agenda, to-do, coming up, inbox, worth a look'),
 ('jobs', 'jobs.q08.org', 'qnfo-jobsearch', 'QNFO.PERSONAL', 'live job matcher with tailored applications'),
 ('travel', 'travel.q08.org', 'personal-companion', 'QNFO.PERSONAL', 'trip planning and travel schema'),
 ('fleet-dashboard', 'fleet.qnfo.org', 'qnfo-fleet-dashboard', 'QNFO.OPS', 'open view of the fleet, its queues and metrics'),
 ('research-gateway', 'ai.qnfo.org', 'qnfo-router', 'QNFO.RSCH', 'research gateway: reasoning, ensemble, RAG'),
 ('ops-executor', 'ops.qnfo.org', 'qnfo-ops', 'QNFO.OPS', 'server-side executor for fleet control and tools'),
 ('qnfo-site', 'qnfo.org', 'qnfo-gateway', 'QNFO.REACH', 'landing, papers and email capture'),
 ('shorts-channel', 'youtube', 'qnfo-youtube-shorts', 'QNFO.REACH', 'plain-language research Shorts');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'PLUS-1', 'plussing-2026', 'product_registry, plus_ledger and v_product_plus_due with eight seeded products', 'migration', 'migrations/2026-10-29-plussing-1.sql', 'built', 'this migration; migration_runs row once applied' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'PLUS-1' AND source = 'plussing-2026');
INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'PLUS-2', 'plussing-2026', 'Usage signal per product host from Worker logs, written daily to product_registry', 'doc', 'docs/PLUSSING.md', 'planned', 'no product has a usage signal today' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'PLUS-2' AND source = 'plussing-2026');
INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'PLUS-3', 'plussing-2026', 'Plus step in the manager tick: pick from v_product_plus_due, gather evidence, file the ROADMAP-1 issue with its prediction, write plus_ledger', 'doc', 'docs/PLUSSING.md', 'planned', 'managers originate per program only; 0 proposed, 1 in build on 2026-10-29' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'PLUS-3' AND source = 'plussing-2026');
INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'PLUS-4', 'plussing-2026', 'Verify-and-keep step: read the metric after its window, mark kept or reverted, set last_plus_at', 'doc', 'docs/PLUSSING.md', 'planned', 'depends on PLUS-3' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'PLUS-4' AND source = 'plussing-2026');
INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'PLUS-5', 'plussing-2026', 'Weekly what-got-better digest from plus_ledger and a /plus page on the fleet dashboard', 'doc', 'docs/PLUSSING.md', 'planned', 'depends on PLUS-4' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'PLUS-5' AND source = 'plussing-2026');
INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'PLUS-6', 'plussing-2026', 'Plus-the-plus, rest after three misses, simplify every fifth cycle', 'doc', 'docs/PLUSSING.md', 'planned', 'depends on PLUS-4' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'PLUS-6' AND source = 'plussing-2026');
