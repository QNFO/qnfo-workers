-- LOOP-BREAKER-NO-DOUBLE-FILE-1 (2026-10-26, charter pillar autonomy; owner 2026-10-26: "remediate root causes of repeated
-- errors/issues/failures systemwide"). LOOP-BREAKER-1 filed 85 issues in 14 days; the largest families repeat failures the code
-- loop already files and owns: 20 "qnfo-code-orchestrator: exec: import base,sys ... compile(...)" issues (the container compile
-- output of a code task's verify step) and the code-task branch's "publish: task has no patch", "no SEARCH/REPLACE" signatures,
-- each of whose tasks also files CODE-LOOP-EXHAUSTED-1 and is retried by the loop. Two issues per failure split the doer's work and
-- double the backlog count. This view drops (a) qnfo-code-orchestrator events whose text starts "exec:" (a task's own verify run)
-- and (b) failed code tasks whose CODE-LOOP-EXHAUSTED-1 issue exists. Everything else is unchanged.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_loop_breaker_view
-- Rollback: DROP VIEW IF EXISTS v_loop_breaker_signatures; then re-run the CREATE VIEW v_loop_breaker_signatures statement of migrations/2026-10-19-loop-breaker-tool-exclusions.sql.
-- spof-review: one view; no cron, binding or credential.
CREATE TABLE IF NOT EXISTS bak_20261026_loop_breaker_view AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_loop_breaker_signatures';
DROP VIEW IF EXISTS v_loop_breaker_signatures;
CREATE VIEW v_loop_breaker_signatures AS
SELECT 'event' AS src, producer, sig, COUNT(*) AS n, MAX(ts) AS last_ts, MIN(substr(dt,1,300)) AS example
FROM (
  SELECT producer, ts, dt,
    substr(tool,1,40) || CASE WHEN dbody <> '' THEN ': ' || substr(dbody,1,64) ELSE '' END AS sig
  FROM (
    SELECT producer, ts, dt, tool,
      trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(body,'0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9','')) AS dbody
    FROM (
      SELECT producer, ts, dt, txt,
        CASE WHEN instr(txt,':') > 0 THEN substr(txt,1,instr(txt,':')-1) ELSE txt END AS tool,
        CASE WHEN instr(txt,':') > 0 THEN substr(txt,instr(txt,':')+1) ELSE '' END
          || CASE WHEN err <> '' THEN ' ' || err ELSE '' END AS body,
        err
      FROM (
        SELECT COALESCE(job, kind, '?') AS producer, ts, COALESCE(text,'') AS txt,
          CASE WHEN json_valid(meta) THEN COALESCE(json_extract(meta,'$.error'),'') ELSE '' END AS err,
          COALESCE(text,'') || CASE WHEN json_valid(meta) AND COALESCE(json_extract(meta,'$.error'),'') <> '' THEN ': ' || json_extract(meta,'$.error') ELSE '' END AS dt
        FROM cloud_ops_events
        WHERE status = 'error'
          AND ts > strftime('%Y-%m-%dT%H:%M:%SZ','now','-24 hours')
          AND instr(COALESCE(text,''),'filed agent_issue') = 0
          AND NOT (kind = 'ops_ai_tool' AND EXISTS (SELECT 1 FROM tool_error_exclusions x WHERE instr(COALESCE(meta,''),x.pattern) > 0 OR instr(COALESCE(text,''),x.pattern) > 0))
          AND NOT (COALESCE(job, kind, '') = 'qnfo-code-orchestrator' AND substr(COALESCE(text,''), 1, 5) = 'exec:')
      )
    )
  )
)
GROUP BY producer, sig HAVING COUNT(*) >= 3
UNION ALL
SELECT 'code-task', path, sig, COUNT(*), MAX(updated_at), MIN(substr(err,1,300))
FROM (
  SELECT path, updated_at, COALESCE(last_error, merge_note, '') AS err,
    substr(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(COALESCE(last_error, merge_note, ''),'0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9','')),1,48) AS sig
  FROM code_tasks t
  WHERE status IN ('failed','publish_failed','reverted','needs_human')
    AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ','now','-24 hours')
    AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = 'CODE-LOOP-EXHAUSTED-1: ' || t.id || ' ' || t.path)
)
GROUP BY path, sig HAVING COUNT(*) >= 3;
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01RdDA76KLvqYHYBjL9C2be5', 'a failure the code loop already files and retries needs no second LOOP-BREAKER-1 issue',
  'v_loop_breaker_signatures drops code-task verify exec events and code tasks with a CODE-LOOP-EXHAUSTED-1 issue (LOOP-BREAKER-NO-DOUBLE-FILE-1)',
  '85 LOOP-BREAKER-1 issues in 14 days, 20 of them qnfo-code-orchestrator exec compile output', 'applied', 'one view read by scripts/loop_breaker_runner.py',
  'the Rollback line of migrations/2026-10-26-loop-breaker-no-double-file.sql', 'one issue per failure, owned by the loop that retries it',
  'LOOP-BREAKER-1 issues filed on code-loop signatures 0 over the next 7 days', 'live D1 read of agent_issues LOOP-BREAKER-1 families'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'LOOP-BREAKER-NO-DOUBLE-FILE-1') > 0);
