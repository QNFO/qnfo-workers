-- SCHEMA-INDEX-ONE-REFRESH-1 (2026-10-19, charter pillar: autonomy; owner directive 2026-10-19: "audit, resolve and remediate all failure modes and their root causes systemwide").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: INSERT INTO d1_schema_index SELECT * FROM bak_20261019_schema_index_old; DELETE FROM remediation_contracts WHERE class = 'fm-schema-index-mixed-refresh'; DELETE FROM failure_modes WHERE fm_key = 'schema-index-mixed-refresh';
-- BACKUP: bak_20261019_schema_index_old
--
-- WHY (measured 2026-10-19 10:50Z with qnfo-audit read-only queries)
-- SCHEMA-INDEX-REFRESH-1 (qnfo-ops 2.50.0) rebuilds a plane as one batch, DELETE WHERE db = ? then INSERT, so a plane carries exactly one
-- refreshed_at. The graph and portfolio planes carried two: a one-off load at 07:40Z / 07:43Z inserted fresh per-table rows next to the 2026-09-30 rows
-- without deleting them. 21 tables were indexed twice (a reader that groups by table, as the ops_d1_query "no such column" hint does with
-- group_concat, got the column list doubled), and 6 tables that no longer exist (_cf_KV, incoming, outgoing, sqlite_sequence in graph; _cf_KV and
-- sqlite_sequence in portfolio) stayed listed. The plane-age check reads MAX(refreshed_at), so the fm-schema-index-stale probe passed on both planes.
-- The cron will not touch them for 23 h, so the 09-30 rows go now, which is what its own delete would have done. The invariant "one refresh stamp per plane" gets
-- its own failure mode and detector: a plane whose rows carry more than one refreshed_at was written by something other than the batch rebuild.

CREATE TABLE IF NOT EXISTS bak_20261019_schema_index_old AS
  SELECT * FROM d1_schema_index WHERE db IN ('graph', 'portfolio') AND refreshed_at < '2026-10-19';

DELETE FROM d1_schema_index WHERE db IN ('graph', 'portfolio') AND refreshed_at < '2026-10-19';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('schema-index-mixed-refresh',
   'a d1_schema_index plane holds rows from more than one refresh, so a table is listed twice or a dropped table stays listed',
   'a plane was loaded by a one-off insert that did not delete the plane''s earlier rows; the plane-age check reads MAX(refreshed_at), so the newest row hid the 19-day-old ones, and the cron rebuild skips a plane younger than 23 h',
   'SCHEMA-INDEX-ONE-REFRESH-1: the old rows removed (backup bak_20261019_schema_index_old) and a detector on the invariant that a plane carries one refreshed_at, which the batch rebuild guarantees',
   'SELECT count of d1_schema_index planes whose MIN(refreshed_at) differs from MAX(refreshed_at)',
   'fm-schema-index-mixed-refresh', '2026-10-19', NULL,
   'a d1_schema_index plane is written other than by the qnfo-ops batch rebuild (delete then insert in one batch)',
   'an agent reads each column list twice, or a table that was dropped months ago, when it asks which columns exist',
   'every agent or loop that reads d1_schema_index before writing SQL (the ops_d1_query column hint, sessions)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-schema-index-mixed-refresh', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT db FROM d1_schema_index GROUP BY db HAVING MIN(refreshed_at) <> MAX(refreshed_at))) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'SCHEMA-INDEX-ONE-REFRESH-1', 'failure-mode detector', 'qnfo-ops');
