-- PROBE-TOKEN-OUTPUT-1 (2026-11-14, charter pillar autonomy; LOOP-BREAKER-1 agent_issues 1003553, GitHub #11883). Three active probe-author-1 contracts return sentences
-- ('yield=0.45 < 0.80 (...)', 'latest funding submission ... days old', 'FAIL rate 12.0% 3/25'). The consumer's sink guard (PROBE-AUTHOR-SINK-GUARD-1, scripts/remediation_consumer.py
-- sink_guard) accepts only one short token per value ([A-Za-z0-9_.:+-]{1,64}) for that module, so every pass was a probe-error with reason free-text-value: the issues could never close
-- and the loop breaker fired. The probes now measure the same things and return tokens. The guard is unchanged. migrations/probe-author-tokens.test.mjs runs each probe and matches the regex.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261114_probe_author_tokens
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261114_probe_author_tokens b WHERE b.class = remediation_contracts.class) WHERE class IN ('issue-1002456', 'issue-1002942', 'issue-1002946');

CREATE TABLE IF NOT EXISTS bak_20261114_probe_author_tokens AS SELECT class, verify_probe, attempts, last_verdict, next_due_at FROM remediation_contracts WHERE class IN ('issue-1002456', 'issue-1002942', 'issue-1002946');

UPDATE remediation_contracts SET verify_probe = 'WITH w AS (SELECT COUNT(*) FILTER (WHERE status = ''merged'') AS ok, COUNT(*) FILTER (WHERE status IN (''failed'', ''publish_failed'')) AS bad FROM code_tasks WHERE updated_at >= datetime(''now'', ''-7 days'') AND status IN (''merged'', ''failed'', ''publish_failed'')) SELECT ''yield-ok'' AS expected, CASE WHEN ok + bad = 0 THEN ''no-tasks-7d'' WHEN 1.0 * ok / (ok + bad) >= 0.80 THEN ''yield-ok'' ELSE ''yield:'' || printf(''%.2f'', 1.0 * ok / (ok + bad)) END AS observed FROM w',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1002456';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''fresh-14d'' AS expected, CASE WHEN MAX(submitted_at) IS NULL THEN ''no-submission'' WHEN MAX(submitted_at) >= date(''now'', ''-14 days'') THEN ''fresh-14d'' ELSE ''age-days:'' || CAST(julianday(''now'') - julianday(MAX(submitted_at)) AS INT) END AS observed FROM funding_pipeline',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1002942';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''pass'' AS expected, CASE WHEN COALESCE(SUM(calls), 0) < 100 THEN ''low-calls:'' || COALESCE(SUM(calls), 0) WHEN 100.0 * COALESCE(SUM(errors), 0) / SUM(calls) >= 10 THEN ''err-pct:'' || ROUND(100.0 * COALESCE(SUM(errors), 0) / SUM(calls), 1) ELSE ''pass'' END AS observed FROM ai_call_counters WHERE worker = ''qnfo-youtube-shorts'' AND purpose = ''binding'' AND day >= date((SELECT MAX(day) FROM ai_call_counters), ''-6 day'')',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1002946';
