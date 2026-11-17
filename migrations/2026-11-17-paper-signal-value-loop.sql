-- IDA-SIGNAL-1 consumer (2026-11-17, charter pillar reach, cost): the first migration (2026-11-17-paper-signal-value.sql, already applied, never edited) added v_paper_signal_value and the metric; its consumer commit missed the squash merge.
-- signal-value-loop (hourly at :50, SQL only, zero AI calls) refreshes paper_zero_reader_share_30d, demotes queued research of any source with 30 or more papers and a zero-reader share of 0.9 or more to score 0.5 (ops_config signal_value_demote_score; signal_value_loop = off stops it), records each action in signal_value_actions and settles it after 8 days against the next reading.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET enabled = 0 WHERE name = 'signal-value-loop-hourly'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'signal-value-loop';

CREATE TABLE IF NOT EXISTS signal_value_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  idea_source TEXT NOT NULL,
  papers INTEGER, zero_ext_share REAL,
  demoted INTEGER, to_score REAL,
  observed_share REAL, verdict TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(day, idea_source)
);

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('signal-value-loop', 'IDA-SIGNAL-1: demote queued research of sources readers do not reach, settle against the next reading (SQL only)', 'workflow', '{"steps": [{"type": "sql", "name": "refresh_metric", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = (SELECT ROUND(1.0 * SUM(papers * zero_ext_share) / NULLIF(SUM(papers), 0), 3) FROM v_paper_signal_value), last_refreshed = datetime(''now'') WHERE metric = ''paper_zero_reader_share_30d''"}, {"type": "sql", "name": "record", "db": "AUDIT", "sql": "INSERT OR IGNORE INTO signal_value_actions (day, idea_source, papers, zero_ext_share, demoted, to_score, created_at) SELECT date(''now''), v.idea_source, v.papers, v.zero_ext_share, (SELECT COUNT(*) FROM research_queue r WHERE r.source = v.idea_source AND r.status = ''queued'' AND r.score > CAST(COALESCE((SELECT value FROM ops_config WHERE key = ''signal_value_demote_score''), ''0.5'') AS REAL)), CAST(COALESCE((SELECT value FROM ops_config WHERE key = ''signal_value_demote_score''), ''0.5'') AS REAL), datetime(''now'') FROM v_paper_signal_value v WHERE v.papers >= 30 AND v.zero_ext_share >= 0.9 AND COALESCE((SELECT value FROM ops_config WHERE key = ''signal_value_loop''), ''on'') = ''on''"}, {"type": "sql", "name": "act_demote", "db": "AUDIT", "sql": "UPDATE research_queue SET score = CAST(COALESCE((SELECT value FROM ops_config WHERE key = ''signal_value_demote_score''), ''0.5'') AS REAL) WHERE status = ''queued'' AND score > CAST(COALESCE((SELECT value FROM ops_config WHERE key = ''signal_value_demote_score''), ''0.5'') AS REAL) AND source IN (SELECT idea_source FROM signal_value_actions WHERE day = date(''now'') AND demoted > 0) AND COALESCE((SELECT value FROM ops_config WHERE key = ''signal_value_loop''), ''on'') = ''on''"}, {"type": "sql", "name": "settle", "db": "AUDIT", "sql": "UPDATE signal_value_actions SET observed_share = (SELECT v.zero_ext_share FROM v_paper_signal_value v WHERE v.idea_source = signal_value_actions.idea_source), verdict = CASE WHEN (SELECT v.zero_ext_share FROM v_paper_signal_value v WHERE v.idea_source = signal_value_actions.idea_source) IS NULL THEN ''no-data'' WHEN (SELECT v.zero_ext_share FROM v_paper_signal_value v WHERE v.idea_source = signal_value_actions.idea_source) < zero_ext_share THEN ''improved'' ELSE ''not-improved'' END WHERE verdict IS NULL AND day <= date(''now'', ''-8 days'')"}]}', 60000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('signal-value-loop-hourly', '50 * * * *', 'signal-value-loop', 1, 'UTC', strftime('%Y-%m-%dT%H:%M:%SZ','now'));
