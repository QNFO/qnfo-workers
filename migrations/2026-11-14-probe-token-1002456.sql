-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'WITH w AS (SELECT COUNT(*) FILTER (WHERE status=''merged'') AS ok, COUNT(*) FILTER (WHERE status IN (''failed'',''publish_failed'')) AS bad FROM code_tasks WHERE updated_at >= datetime(''now'',''-7 days'') AND status IN (''merged'',''failed'',''publish_failed'')) SELECT ''yield>=0.80'' AS expected, CASE WHEN ok+bad=0 THEN ''no tasks in 7d'' WHEN 1.0*ok/(ok+bad)>=0.80 THEN ''yield>=0.80'' ELSE ''yield='' || printf(''%.2f'',1.0*ok/(ok+bad)) || '' < 0.80 ('' || ok || '' merged / '' || bad || '' failed, 7d)'' END AS observed FROM w' WHERE class = 'issue-1002456'
-- CAUSE-MAPPED: registers no metric.
-- PROBE-TOKEN-1002456 (2026-11-14, charter pillar: autonomy; closes LOOP-BREAKER-1 agent_issues 1003553 at its root).
-- The contract of issue 1002456 (OWNER-ACT cause:code-loop, "the code loop finishes too few of its tasks") is a probe-author-1 contract, so
-- PROBE-AUTHOR-SINK-GUARD-1 requires expected and observed to be one short token ([A-Za-z0-9_.:+-], 1-64 chars). Its probe returned 'yield>=0.80' and
-- free text ('yield=0.37 < 0.80 (... merged / ... failed, 7d)'), so every pass was a probe-error 'free-text-value' and the loop breaker filed 1003553
-- (3 recurrences in 24 h, last 2026-11-14T13:55Z). Same definition of done (7-day merged share of finished tasks >= 0.80), token output; the target
-- is unchanged. The issue stays open until the code loop's yield really reaches it (37% on 2026-11-14).
UPDATE remediation_contracts
   SET verify_probe = 'WITH w AS (SELECT COUNT(*) FILTER (WHERE status = ''merged'') AS ok, COUNT(*) FILTER (WHERE status IN (''failed'', ''publish_failed'')) AS bad FROM code_tasks WHERE updated_at >= datetime(''now'', ''-7 days'') AND status IN (''merged'', ''failed'', ''publish_failed'')) SELECT ''yield_ok'' AS expected, CASE WHEN ok + bad = 0 THEN ''no_tasks'' WHEN 1.0 * ok / (ok + bad) >= 0.80 THEN ''yield_ok'' ELSE ''yield_pct_'' || CAST(100 * ok / (ok + bad) AS INTEGER) END AS observed FROM w',
       last_verdict = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-1002456' AND verify_probe LIKE '%yield>=0.80%';
