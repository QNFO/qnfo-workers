-- SKILL-SEARCH-1 (2026-11-09, issue 9675 / agent_issues 1002678; charter pillar: autonomy).
-- The searchable skill repository of the command line (qnfo-agents skill_search / skill_get tools and GET /skills) logs every search and every skill read here,
-- so a search that ends in a used skill is countable (v_skill_discovery: skill_discovery_success_rate).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_skill_discovery; DROP TABLE IF EXISTS agent_skill_events;
-- CAUSE-MAPPED: registers no metric_registry row; the rate is a view read by the issue's closing probe.

CREATE TABLE IF NOT EXISTS agent_skill_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  query TEXT,
  hit TEXT,
  hits INTEGER,
  caller TEXT,
  created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_skill_events_ts ON agent_skill_events (created_ms);

-- A search is successful when a skill_get/GET /skills/<name> of one of its hits follows it from the same caller within 30 minutes.
CREATE VIEW IF NOT EXISTS v_skill_discovery AS
  SELECT COUNT(*) AS searches_7d,
         SUM(CASE WHEN EXISTS (SELECT 1 FROM agent_skill_events u WHERE u.kind = 'use' AND u.caller = s.caller AND u.created_ms BETWEEN s.created_ms AND s.created_ms + 1800000) THEN 1 ELSE 0 END) AS searches_used_7d
    FROM agent_skill_events s
   WHERE s.kind = 'search' AND s.created_ms > (strftime('%s','now') - 7 * 86400) * 1000;
