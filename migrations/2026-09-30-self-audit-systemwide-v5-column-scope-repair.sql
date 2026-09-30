-- SELF-AUDIT-SYSTEMWIDE-1 — v5 column-scope repair
-- Applied live 2026-09-30T19:59:26Z by qnfo-ops; verified same turn.
--
-- SYMPTOM
--   fleet_runs recorded FOUR consecutive failures of task_id='self-audit-systemwide'
--   (cron 'self-audit-systemwide-every-6h') on 2026-09-30 at 00:01:42Z, 06:01:51Z,
--   12:00:36Z and 18:00:38Z, every one with the identical error:
--     D1_ERROR: no such column: cloud_ops_events.text at offset 949: SQLITE_ERROR
--   The fleet's own self-audit — the detector for tool-error-rate breaches, sub-daily
--   cron staleness, NULL-timestamp regressions and missing guard triggers — was
--   therefore blind for at least 24h, and would have stayed blind indefinitely.
--
-- ROOT CAUSE (out-of-scope correlated subquery)
--   Step 1 of the stored workflow definition reads, in outline:
--     INSERT INTO agent_issues (...) SELECT 'SELF-AUDIT-TOOLERR: ' || text, ...
--     FROM tool_error_rate_24h WHERE ts > ... GROUP BY text HAVING ...
--     AND NOT EXISTS (SELECT 1 FROM agent_issues a
--                     WHERE a.title = 'SELF-AUDIT-TOOLERR: ' || cloud_ops_events.text
--                       AND a.status='open')
--   The source table was switched from cloud_ops_events (as originally written in
--   migrations/2026-09-29-self-audit-systemwide.sql, which is CORRECT) to
--   tool_error_rate_24h, but the correlated subquery was not updated with it.
--   cloud_ops_events is not in scope for that statement, so SQLite resolves
--   cloud_ops_events.text as an unknown column. It is the ONLY out-of-scope
--   reference in the definition, and it sits inside the final NOT EXISTS — which is
--   why the error offset (949) lands near the end of the first step's SQL.
--
-- WHY THE REPO DID NOT CATCH IT (filed as WORKFLOW-DEFINITION-DRIFT-1)
--   The live row is version 5 with FOUR steps. The repo migration defines version 2
--   with TWO steps. Step 3 (NULL created_at/updated_at regression), step 4 (critical
--   guard-trigger presence) and the cloud_ops_events -> tool_error_rate_24h switch
--   exist ONLY in D1. The live definition had no repo source, so no review path
--   could see the broken reference before it shipped.
--
-- WHY tool_error_rate_24h IS THE RIGHT SOURCE (validated before applying)
--   tool_error_rate_24h is live and populated: 60,757 rows, oldest 2026-09-03T04:11:33Z,
--   newest 2026-09-30T19:59:24Z. It carries the columns the predicate needs
--   (text, status, ts). The corrected predicate was dry-run as a read-only SELECT
--   before the write and returned ok (0 rows over threshold at the time of the fix).
--
-- FIX — idempotent, scoped to the single broken reference
--   Guarded by LIKE so it is a no-op on an already-correct row, and it cannot touch
--   any other task definition.
UPDATE fleet_tasks
   SET definition = replace(definition, 'cloud_ops_events.text', 'tool_error_rate_24h.text'),
       version    = version + 1,
       updated_at = datetime('now')
 WHERE id = 'self-audit-systemwide'
   AND definition LIKE '%cloud_ops_events.text%';

-- VERIFICATION — expected after the fix: json_ok=1, bad_ref=0, good_ref>0
SELECT json_valid(definition)                        AS json_ok,
       instr(definition, 'cloud_ops_events.text')    AS bad_ref,
       instr(definition, 'tool_error_rate_24h.text') AS good_ref,
       version,
       enabled
  FROM fleet_tasks
 WHERE id = 'self-audit-systemwide';

-- Observed after the live repair (2026-09-30T19:59:26Z):
--   json_ok=1  bad_ref=0  good_ref=994  version=5  enabled=1
--
-- ALL FOUR STEPS DRY-RUN GREEN AFTER THE FIX (read-only, same turn)
--   step 1 tool-error predicate      -> ok, 0 rows over threshold
--   step 2 sub-daily cron staleness  -> ok, 0 rows  (all sub-daily crons fresh)
--   step 3 NULL-timestamp regression -> ok, 0 rows  (null_ts_rows=0)
--   step 4 missing guard triggers    -> ok, 0 rows  (all 6 triggers present)
--
-- ADVERSARIAL LIMITS OF THIS FIX
--   * This repairs a SYNTAX/SCOPE fault. It does not restore detection power that was
--     never there: the tool-error arm still only counts status='error' rows, so guard
--     refusals logged with a non-error status stay invisible (see the KNOWN LIMITATIONS
--     block in migrations/2026-09-29-self-audit-systemwide.sql).
--   * Verified by dry-running each step's predicate as a read-only SELECT. The workflow
--     RUNNER was not executed, because the fleet exposes no manual trigger for a
--     fleet_tasks row; the next natural fire is 2026-10-01T00:00:00Z. Until that fire
--     is observed in fleet_runs with status='ok', the fix is "SQL-valid and step-verified",
--     not "runner-confirmed".
--   * A replay of migrations/2026-09-29-self-audit-systemwide.sql will NOT revert this:
--     it uses INSERT OR IGNORE, and the row already exists.
