-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_external_properties
-- Rollback: DROP VIEW IF EXISTS v_content_stage_summary; then run the sql column of bak_20261014_external_properties (the view as it was); DROP VIEW IF EXISTS v_content_external; DROP TABLE IF EXISTS content_external_items
-- spof-review: no new single point of failure; each property's own worker writes its rows, and a missed write leaves the other properties untouched
--
-- EXTERNAL-PROPERTIES-1 (2026-10-14, pillars reach and personal). Owner directive 2026-10-14, verbatim: '"By property" SHALL ALSO INCLUDE
-- Q08.ORG AND READING.Q08.ORG'. The content page (fleet.qnfo.org/content, CONTENT-PIPELINE-1) builds "By property", "The line" and the flow
-- totals from v_content_stage_summary, which reads only the content tables in qnfo-audit: papers.qnfo.org, idea-hub and social. q08.org
-- keeps its runs in the q08-signal database and reading.q08.org in the personal plane, so neither had a row.
--   content_external_items  one row per finished item of a property whose data lives in another database: a q08.org run (essay or
--                           forecast, published or rejected at the gate) and a reading.q08.org compose attempt (published or rejected).
--                           Written by each property's own worker (q08-signal-engine 0.28.0, personal-companion 1.28.0) from its run
--                           log at the end of each tick, the last 7 days, public fields only (the topic or signal title, the stage).
--   v_content_external      the same columns as v_content_pipeline, with age and the stage SLA.
--   v_content_stage_summary now aggregates v_content_pipeline and v_content_external (aliases unique, SLA-120M-VIEW-ALIAS-1).

CREATE TABLE IF NOT EXISTS bak_20261014_external_properties AS
  SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'view' AND name = 'v_content_stage_summary';

CREATE TABLE IF NOT EXISTS content_external_items (
  property TEXT NOT NULL,
  flow TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT,
  raw_status TEXT,
  stage TEXT NOT NULL,
  state TEXT NOT NULL,
  since TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (property, item_id)
);
CREATE INDEX IF NOT EXISTS idx_content_external_items_since ON content_external_items (property, since);

DROP VIEW IF EXISTS v_content_external;
CREATE VIEW v_content_external AS
SELECT vce_e.property, vce_e.flow, vce_e.item_id, vce_e.title, vce_e.raw_status, vce_e.stage, vce_e.state, vce_e.since,
  ROUND((julianday('now') - julianday(vce_e.since)) * 24, 1) AS age_h, vce_s.sla_min,
  CASE WHEN vce_e.state IN ('waiting', 'active', 'held', 'blocked') AND vce_s.sla_min IS NOT NULL
        AND (julianday('now') - julianday(vce_e.since)) * 1440 > vce_s.sla_min THEN 1 ELSE 0 END AS over_sla
FROM content_external_items vce_e LEFT JOIN content_stages vce_s ON vce_s.stage = vce_e.stage;

DROP VIEW IF EXISTS v_content_stage_summary;
CREATE VIEW v_content_stage_summary AS
SELECT vcs_u.property, vcs_u.stage, vcs_s.ord, vcs_s.label, vcs_s.sla_min, vcs_s.enforced_by,
  SUM(CASE WHEN vcs_u.state IN ('waiting', 'active', 'held', 'blocked') THEN 1 ELSE 0 END) AS in_flight,
  SUM(CASE WHEN vcs_u.state = 'waiting' THEN 1 ELSE 0 END) AS waiting,
  SUM(CASE WHEN vcs_u.state = 'active' THEN 1 ELSE 0 END) AS active,
  SUM(CASE WHEN vcs_u.state = 'held' THEN 1 ELSE 0 END) AS held,
  SUM(CASE WHEN vcs_u.state = 'blocked' THEN 1 ELSE 0 END) AS blocked,
  SUM(CASE WHEN vcs_u.state = 'parked' THEN 1 ELSE 0 END) AS parked,
  SUM(vcs_u.over_sla) AS over_sla,
  MAX(CASE WHEN vcs_u.state IN ('waiting', 'active', 'held', 'blocked') THEN vcs_u.age_h END) AS oldest_age_h,
  SUM(CASE WHEN vcs_u.state IN ('done', 'rejected') AND vcs_u.since > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day') THEN 1 ELSE 0 END) AS finished_24h,
  SUM(CASE WHEN vcs_u.state IN ('done', 'rejected') AND vcs_u.since > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') THEN 1 ELSE 0 END) AS finished_7d,
  SUM(CASE WHEN vcs_u.state IN ('done', 'rejected', 'parked') THEN 1 ELSE 0 END) AS finished_all
FROM (SELECT property, stage, state, over_sla, age_h, since FROM v_content_pipeline
      UNION ALL SELECT property, stage, state, over_sla, age_h, since FROM v_content_external) vcs_u
  LEFT JOIN content_stages vcs_s ON vcs_s.stage = vcs_u.stage
GROUP BY vcs_u.property, vcs_u.stage;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'the content page shows every QNFO/Q08 property only when each property''s worker puts its finished items where the page reads; a worker mirroring its own run log keeps the personal plane and q08-signal out of the shared database except for public stage rows',
  'EXTERNAL-PROPERTIES-1: content_external_items, v_content_external and v_content_stage_summary over both; q08-signal-engine 0.28.0 and personal-companion 1.28.0 mirror their last 7 days of runs each tick',
  'owner 2026-10-14: "By property" SHALL ALSO INCLUDE Q08.ORG AND READING.Q08.ORG; v_content_stage_summary listed idea-hub, papers.qnfo.org and social only',
  'migration merged', 'one view replaced (backup holds it), one table and one view added', 'see the Rollback header',
  'the content page shows q08.org and reading.q08.org per stage, with their published and rejected counts',
  'within 60 minutes of the deploy, v_content_stage_summary has rows for q08.org and reading.q08.org', 'the owner sees the two publishing properties on the same line as the others',
  'd1:qnfo-audit v_content_stage_summary, content_external_items; q08-signal engine_runs; personal-life companion_runs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'EXTERNAL-PROPERTIES-1:') = 1);
