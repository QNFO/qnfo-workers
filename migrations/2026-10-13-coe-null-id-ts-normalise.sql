-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261013_coe_null_id
-- spof-review: the replaced triggers keep their tables and events; the id-keyed normalisers are one D1 path, and the second is on the read side: the dedupes and views here compare through datetime(), which reads both formats, and fm-coe-null-id reports a lapse within the hour
-- Rollback: recreate the triggers and views from the rows of bak_20261013_coe_null_id with obj = 'sql'; restore ids and ts with UPDATE cloud_ops_events SET id = NULL, ts = b.ts FROM bak_20261013_coe_null_id b WHERE b.obj = 'row' AND cloud_ops_events.rowid = b.rid
--
-- COE-NULL-ID-1 / TS-FORMAT-MIX-1 (GHA-AUDIT-1 follow-up, 2026-10-13; charter pillar autonomy). Root cause of the mixed
-- timestamp formats that FM-PROBE-ISO-COMPARE-1 (#1192) worked around in three probes:
--   * cloud_ops_events.id is TEXT PRIMARY KEY, which SQLite lets be NULL. 2,247 of 104,913 rows have no id (read 21:40Z):
--     1,469 from trg_metric_write_audit (a D1 trigger that inserts without an id), 636 from qnfo-fleet-control obs-ingest,
--     obs-reassert and dispose-blocked, 142 older qnfo-research-exec rows.
--   * cloud_ops_events_ts_norm_ins / _upd / _epoch_ins rewrite a 'YYYY-MM-DD HH:MM:SS' or epoch ts to ISO with
--     WHERE id = NEW.id, which never matches NULL, so every id-less row kept its space-format ts (636 rows). Readers that
--     window cloud_ops_events against strftime('%Y-%m-%dT...') then treat those same-day rows as older than they are
--     (v_stuck_summary, tick_driver_roster_tick, the goal-review and probe-review metrics).
--   * alerts.created_at holds both formats (907 space, 90 ISO from qnfo-deploy-guard); alerts_dedup_count compared it with
--     datetime('now', '-60 minutes') as text, so an ISO alert from earlier the same day swallowed a new one as a "repeat".
--   * views that window ISO columns with datetime() as text: v_cost_fleet_30d (llm_gateway_log, cost_router_metrics,
--     ai_queries), issue_ledger_exclusion_aware (cloud_ops_events), v_closeouts_no_verdict (handoffs.timestamp), and the
--     worker_removals_from_live_audit dedupe (6 of 90 rows ISO).
-- Fix: the id-keyed normalisers stay (D1 refused rowid-keyed ones for depth); the audit trigger writes an id (qnfo-fleet-control: COE-NULL-ID-WRITER-1); the
-- existing rows are backfilled; the dedupe and the views compare through datetime(), which reads both formats.

CREATE TABLE IF NOT EXISTS bak_20261013_coe_null_id AS
  SELECT 'row' AS obj, rowid AS rid, id, ts, NULL AS name, NULL AS sql FROM cloud_ops_events
    WHERE id IS NULL OR (length(ts) = 19 AND substr(ts, 11, 1) = ' ') OR (length(ts) = 10 AND ts GLOB '[0-9]*')
  UNION ALL
  SELECT 'sql', NULL, NULL, NULL, name, sql FROM sqlite_master
    WHERE name IN ('cloud_ops_events_ts_norm_ins', 'cloud_ops_events_ts_norm_upd', 'cloud_ops_events_ts_norm_epoch_ins',
                   'trg_metric_write_audit', 'alerts_dedup_count', 'worker_removals_from_live_audit',
                   'v_cost_fleet_30d', 'issue_ledger_exclusion_aware', 'v_closeouts_no_verdict');

-- 1. No id-fill trigger: an UPDATE of cloud_ops_events inside its own INSERT trigger pulls the table's whole UPDATE-trigger
--    tree into every insert, and D1 refused it as "triggers nested too deep" (migration_runs 224, 2026-10-13 21:49Z; the
--    runner's D1-TRIGGER-DEPTH-1 canary dropped it at once). Ids are written by the writers instead: trg_metric_write_audit
--    below, and qnfo-fleet-control by COE-NULL-ID-WRITER-1. The id-keyed normalisers then reach those rows.
DROP TRIGGER IF EXISTS cloud_ops_events_id_fill_ins;

-- 2. The id-keyed timestamp normalisers stay as they are. Rewritten to match rowid, D1 refused them as "triggers nested too
--    deep" (migration_runs 225, 2026-10-13 21:56Z; the runner's D1-TRIGGER-DEPTH-1 canary restored the old ones at once),
--    while the id-keyed text passes the same canary. With ids from the writers and the backfill below they reach every row.

-- 3. The metric write audit writes its own id.
DROP TRIGGER IF EXISTS trg_metric_write_audit;
CREATE TRIGGER trg_metric_write_audit AFTER UPDATE OF last_value ON metric_registry
WHEN NEW.metric IN ('pageviews_30d', 'referral_30d', 'subscribers_growth_monthly', 'worker_count', 'open_agent_issues')
BEGIN
  INSERT INTO cloud_ops_events (id, ts, kind, status, text)
  VALUES ('mwa-' || lower(hex(randomblob(8))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'metric-write-audit', 'audit',
    'metric=' || NEW.metric || ' last_value=' || CAST(NEW.last_value AS TEXT) || ' state=' || COALESCE(NEW.state, '') || ' prev=' || COALESCE(OLD.last_value, ''));
END;

-- 4. Backfill the existing rows (the backup above holds their previous id and ts).
UPDATE cloud_ops_events SET id = 'coe-' || lower(hex(randomblob(8))) WHERE id IS NULL;
UPDATE cloud_ops_events SET ts = replace(ts, ' ', 'T') || '.000Z' WHERE length(ts) = 19 AND substr(ts, 11, 1) = ' ';

-- 5. Readers compare through datetime(), which reads both formats.
DROP TRIGGER IF EXISTS alerts_dedup_count;
CREATE TRIGGER alerts_dedup_count BEFORE INSERT ON alerts
WHEN EXISTS (SELECT 1 FROM alerts WHERE source = NEW.source AND message = NEW.message AND datetime(created_at) > datetime('now', '-60 minutes'))
BEGIN
  UPDATE alerts SET repeats = repeats + 1
  WHERE id = (SELECT id FROM alerts WHERE source = NEW.source AND message = NEW.message AND datetime(created_at) > datetime('now', '-60 minutes') ORDER BY id DESC LIMIT 1);
  SELECT RAISE(IGNORE);
END;

DROP TRIGGER IF EXISTS worker_removals_from_live_audit;
CREATE TRIGGER worker_removals_from_live_audit
AFTER UPDATE OF note ON worker_live_audit
WHEN NEW.note = 'NOT_DEPLOYED' AND OLD.note IN ('SYNC','DRIFT','CRON_ONLY')
 AND NOT EXISTS (SELECT 1 FROM worker_removals r WHERE r.worker = NEW.worker AND datetime(r.removed_at) > datetime('now','-1 day'))
BEGIN
  INSERT INTO worker_removals (worker, removed_at, action, target, rationale, evidence, source)
  VALUES (NEW.worker, COALESCE(NEW.probed_at, datetime('now')), 'OBSERVED-REMOVED', NULL,
          'live audit saw the worker go from ' || OLD.note || ' to NOT_DEPLOYED',
          'worker_live_audit http=' || COALESCE(NEW.http,'') || ' last live_version=' || COALESCE(OLD.live_version,''),
          'trigger:worker_live_audit');
END;

DROP VIEW IF EXISTS v_cost_fleet_30d;
CREATE VIEW v_cost_fleet_30d AS
    SELECT 'llm_gateway_log' AS source, ROUND(COALESCE(SUM(cost_usd),0),6) AS usd, COUNT(*) AS requests FROM llm_gateway_log WHERE datetime(ts) >= datetime('now','-30 day')
    UNION ALL SELECT 'cost_router_metrics', ROUND(COALESCE(SUM(cost_usd),0),6), COUNT(*) FROM cost_router_metrics WHERE datetime(ts) >= datetime('now','-30 day')
    UNION ALL SELECT 'ai_queries', ROUND(COALESCE(SUM(cost_usd),0),6), COUNT(*) FROM ai_queries WHERE datetime(ts) >= datetime('now','-30 day');

DROP VIEW IF EXISTS issue_ledger_exclusion_aware;
CREATE VIEW issue_ledger_exclusion_aware AS SELECT l.fingerprint, l.source, l.level, l.title, l.status, l.first_seen, l.last_seen, l.occurrences, (SELECT COUNT(*) FROM cloud_ops_events e WHERE e.kind='ops_ai_tool' AND e.status='error' AND e.ts >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days') AND instr(l.title, e.text) > 0 AND NOT EXISTS (SELECT 1 FROM tool_error_exclusions x WHERE instr(COALESCE(e.meta,''), x.pattern) > 0 OR instr(COALESCE(e.text,''), x.pattern) > 0)) AS nonexcluded_errs_7d FROM issue_ledger l;

DROP VIEW IF EXISTS v_closeouts_no_verdict;
CREATE VIEW v_closeouts_no_verdict AS SELECT id, session_id, project_id, wbs_code, timestamp, CASE WHEN dod_verdict IS NULL OR dod_verdict='' THEN 1 ELSE 0 END AS missing_verdict, CASE WHEN claim_sheet IS NULL OR claim_sheet='' THEN 1 ELSE 0 END AS missing_claim_sheet FROM handoffs WHERE ((dod_verdict IS NULL OR dod_verdict='') OR (claim_sheet IS NULL OR claim_sheet='')) AND datetime(timestamp) >= datetime('now','-7 days');

-- 6. Registers.
INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('coe-null-id',
 'cloud_ops_events rows without an id keep a space-format ts and are invisible to every id-keyed trigger and reader',
 'id is TEXT PRIMARY KEY, which SQLite allows to be NULL; trg_metric_write_audit and qnfo-fleet-control insert without an id, and the ts normalisers matched WHERE id = NEW.id',
 'ids reach every row, so the id-keyed normalisers apply; trg_metric_write_audit writes an id; qnfo-fleet-control writes ids (COE-NULL-ID-WRITER-1); existing rows backfilled (COE-NULL-ID-1)',
 'no id-less row outside the three qnfo-fleet-control kinds that COE-NULL-ID-WRITER-1 fixes, and no space-format ts since yesterday on the formerly id-less kinds',
 'fm-coe-null-id', '2026-10-13', NULL,
 'any writer that omits the id column', '2,247 id-less rows; 636 kept a space ts; same-day windows against ISO cutoffs undercounted them',
 'v_stuck_summary, tick_runs, review-refusal metrics, tool-error filers and every reader keyed on cloud_ops_events.id'),
('ts-format-mix',
 'a column holds both ISO and space timestamps, so a text comparison with datetime() or strftime() is wrong for one of them',
 'writers use datetime(''now'') or strftime(''%Y-%m-%dT...'') or JavaScript toISOString() on the same column; readers compare as text',
 'readers compare through datetime() (alerts dedupe, worker_removals dedupe, v_cost_fleet_30d, v_closeouts_no_verdict); cloud_ops_events is normalised at write',
 'see fm-iso-text-compare and fm-coe-null-id', NULL, '2026-10-13', NULL,
 'a second writer with a different clock format', 'alerts_dedup_count swallowed new alerts behind an ISO alert from earlier the same day',
 'every windowed metric, view, dedupe and probe on a mixed-format column');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-coe-null-id', NULL, 'COE-NULL-ID-1', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cloud_ops_events WHERE id IS NULL AND COALESCE(kind, '''') NOT IN (''obs-ingest'', ''obs-reassert'', ''dispose-blocked'')) + (SELECT COUNT(*) FROM cloud_ops_events WHERE kind IN (''obs-ingest'', ''obs-reassert'', ''dispose-blocked'', ''metric-write-audit'') AND ts >= strftime(''%Y-%m-%d'', ''now'', ''-1 day'') AND substr(ts, 11, 1) = '' '') AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state,
  alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
('cloud_ops_events_ts_norm_ins', 'qnfo-audit trigger (migrations/2026-10-13-coe-null-id-ts-normalise.sql)', 'guard',
 'a space-format or epoch ts in cloud_ops_events, which ISO-windowed readers miscount', 0, 'replace', 'applied',
 'readers compare through datetime(), which reads both formats; fm-coe-null-id reports a space ts or a new id-less writer within the hour',
 datetime('now'), 'the id-keyed normalisers no-oped on 2,247 id-less rows; ids now come from the writers and the backfill (rowid-keyed ones exceed D1 trigger depth)', NULL, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain,
  predicted_outcome, reach_gain, surfaces_tested) VALUES
('session_018gmMjMgWAuzVh7gHPBcosA',
 'a normaliser keyed on a nullable primary key is a no-op for exactly the rows it exists to fix',
 'COE-NULL-ID-1: id in trg_metric_write_audit, backfill; datetime() in the alerts and worker_removals dedupes and three views',
 'read 2026-10-13 21:40Z: 2,247 NULL ids (1,469 metric-write-audit, 636 fleet-control), 636 space-format ts; alerts 907 space / 90 ISO',
 'applied by apply-migrations', 'cloud_ops_events writes, two dedupe triggers, three views', 'see the Rollback header',
 'every cloud_ops_events row is addressable and ISO-stamped; windows read mixed-format columns correctly',
 'fm-coe-null-id = 0 within 2 h', 'none', 'D1 trigger chain, offline replay (scripts/coe_null_id_test.py)');
