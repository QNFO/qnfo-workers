-- CALIBRATION-RECHECK-COLUMN-1 (2026-10-02, pillars core + autonomy). Idempotent. NOT YET APPLIED: written read-only by the
-- runtime-errors session (no D1 writes); apply with `wrangler d1 execute qnfo-audit --remote --file <this file>`.
--
-- Defect: fleet_tasks 'calibration-recheck' (cron calibration-recheck-daily, 0 6 * * *, run by fleet-exec) fails on every
-- run with "D1_ERROR: no such column: last_checked at offset 111" (fleet_runs 2026-10-01T06:00Z and 2026-10-02T06:01Z,
-- status failed). Its first step filters on calibration_register.last_checked, a column the table has never had (columns:
-- id, project, prediction_id, claim, check_date, status DEFAULT 'PENDING', disconfirmation, rationale, source_repo,
-- created_at, updated_at). fleet-exec runs steps in order and stops at the first throw, so the two later steps (the warn
-- event per due prediction, and the due count) have never run either.
--
-- Fix: "not yet checked" is status = 'PENDING' in this table, so every step filters on that instead. That also stops the
-- second step from re-flagging a prediction that was already resolved. Nothing is due today (10 PENDING rows, earliest
-- check_date 2027-12-31), so the first successful run writes no event; it reads ok with three steps run.
--
-- Proof after applying: SELECT status, error FROM fleet_runs WHERE task_id = 'calibration-recheck' ORDER BY id DESC LIMIT 1
-- reads status 'ok' after the next 06:00Z tick (was 'failed' with the last_checked error).

UPDATE fleet_tasks
SET definition = json_object('steps', json_array(
      json_object('type', 'sql', 'db', 'AUDIT', 'sql',
        'SELECT id, substr(claim,1,80) claim, check_date FROM calibration_register WHERE check_date <= date(''now'') AND COALESCE(status,''PENDING'') = ''PENDING'''),
      json_object('type', 'sql', 'db', 'AUDIT', 'sql',
        'INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''calib-recheck-''||id||''-''||strftime(''%Y%m%d'',''now''), datetime(''now''), ''calibration-recheck'', ''CALIBRATION-REGISTER-RECHECK-1: prediction #''||id||'' reached its check_date (''||check_date||'')'', NULL, ''calibration-recheck'', ''warn'' FROM calibration_register WHERE check_date <= date(''now'') AND COALESCE(status,''PENDING'') = ''PENDING'''),
      json_object('type', 'sql', 'db', 'AUDIT', 'sql',
        'SELECT COUNT(*) due FROM calibration_register WHERE check_date <= date(''now'') AND COALESCE(status,''PENDING'') = ''PENDING''')
    )),
    version = version + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'calibration-recheck'
  AND instr(definition, 'last_checked') > 0;
