-- LOOP-BREAKER-SIG-1: preserve the tool token in the failure signature.
-- See the commit message for the measured defect and the verification.

DROP VIEW IF EXISTS v_loop_breaker_signatures;

CREATE VIEW v_loop_breaker_signatures AS
SELECT 'event' AS src, producer, sig, COUNT(*) AS n, MAX(ts) AS last_ts,
       MIN(substr(dt, 1, 300)) AS example
FROM (
  SELECT producer, ts, dt,
         substr(tool, 1, 40)
         || CASE WHEN dbody <> '' THEN ': ' || substr(dbody, 1, 64) ELSE '' END AS sig
  FROM (
    SELECT producer, ts, dt, tool,
           trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
             body, '0', ''), '1', ''), '2', ''), '3', ''), '4', ''),
             '5', ''), '6', ''), '7', ''), '8', ''), '9', '')) AS dbody
    FROM (
      SELECT producer, ts, dt,
             CASE WHEN instr(txt, ':') > 0 THEN substr(txt, 1, instr(txt, ':') - 1) ELSE txt END AS tool,
             CASE WHEN instr(txt, ':') > 0 THEN substr(txt, instr(txt, ':') + 1) ELSE '' END
             || CASE WHEN err <> '' THEN ' ' || err ELSE '' END AS body,
             txt, err
      FROM (
        SELECT COALESCE(job, kind, '?') AS producer, ts,
               COALESCE(text, '') AS txt,
               CASE WHEN json_valid(meta) THEN COALESCE(json_extract(meta, '$.error'), '') ELSE '' END AS err
        FROM cloud_ops_events
        WHERE status = 'error'
          AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
          AND instr(COALESCE(text, ''), 'filed agent_issue') = 0
          AND NOT (kind = 'ops_ai_tool' AND EXISTS (
                SELECT 1 FROM tool_error_exclusions x
                WHERE instr(COALESCE(meta, ''), x.pattern) > 0
                   OR instr(COALESCE(text, ''), x.pattern) > 0))
      )
      CROSS JOIN (SELECT 1) AS _noop
      LEFT JOIN (SELECT '' AS dt, '' AS body, '' AS tool, '' AS txt, '' AS err) AS _n ON 0
    )
  )
)
GROUP BY producer, sig
HAVING COUNT(*) >= 3

UNION ALL

SELECT 'code-task' AS src, path AS producer, sig, COUNT(*) AS n, MAX(updated_at) AS last_ts,
       MIN(substr(err, 1, 300)) AS example
FROM (
  SELECT path, updated_at,
         COALESCE(last_error, merge_note, '') AS err,
         substr(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
           COALESCE(last_error, merge_note, ''), '0', ''), '1', ''), '2', ''), '3', ''), '4', ''),
           '5', ''), '6', ''), '7', ''), '8', ''), '9', '')), 1, 48) AS sig
  FROM code_tasks
  WHERE status IN ('failed', 'publish_failed', 'reverted', 'needs_human')
    AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
)
GROUP BY path, sig
HAVING COUNT(*) >= 3;