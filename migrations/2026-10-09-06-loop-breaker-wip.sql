-- LOOP-BREAKER-1, WIP-SELF-TUNE-1, DOCTRINE-AUDIT-1 (2026-10-09, pillar autonomy; agent_issues 2183 and 2182, doctrine revision 2
-- sections 2 and 4, section 6 accounting).
-- 1. v_loop_breaker_signatures: error signatures seen 3 or more times in 24 h, from cloud_ops_events (status error, digits
--    removed, first 48 chars, per producer) and failed code tasks (per path). scripts/loop_breaker_runner.py files one
--    LOOP-BREAKER-1 issue per signature that recurred in the last 2 h, from the GitHub runner: an agent_issues insert from a
--    fleet_tick trigger would nest the issue triggers (lifecycle, runtime probe, contract templates) past D1's 10 levels
--    (D1-TRIGGER-DEPTH-1), so the filing runs at depth 0.
-- 2. (The 41 agent_issues id gaps are recorded by PR 834 DOCTRINE-REV3-REFRESH-1 and PR 835 AUDIT-FRESHNESS-1; not repeated here.)
-- 3. wip_self_tune: ops_config code_merge_max_merges_per_tick moves within 1..5 by rule, at most once per 6 h, each change
--    in decision_log (actor wip-self-tune): down by 1 after any revert in 24 h, up by 1 when there was none, at least one
--    merge landed in 24 h and more tasks wait than the limit.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS wip_self_tune; DROP VIEW IF EXISTS v_loop_breaker_signatures

CREATE VIEW IF NOT EXISTS v_loop_breaker_signatures AS
SELECT 'event' AS src, COALESCE(job, kind, '?') AS producer, sig, COUNT(*) AS n, MAX(ts) AS last_ts, MIN(substr(text, 1, 300)) AS example
FROM (SELECT job, kind, ts, text,
        substr(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(COALESCE(text, ''),
          '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '')), 1, 48) AS sig
      FROM cloud_ops_events
      WHERE status = 'error' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
        AND instr(COALESCE(text, ''), 'filed agent_issue') = 0)
GROUP BY producer, sig HAVING COUNT(*) >= 3
UNION ALL
SELECT 'code-task', path, sig, COUNT(*), MAX(updated_at), MIN(substr(err, 1, 300))
FROM (SELECT path, updated_at, COALESCE(last_error, merge_note, '') AS err,
        substr(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(COALESCE(last_error, merge_note, ''),
          '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '')), 1, 48) AS sig
      FROM code_tasks
      WHERE status IN ('failed', 'publish_failed', 'reverted', 'needs_human') AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
GROUP BY path, sig HAVING COUNT(*) >= 3;

CREATE TRIGGER IF NOT EXISTS wip_self_tune AFTER INSERT ON fleet_tick
WHEN NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'wip-self-tune' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-6 hours'))
  AND (
    ((SELECT COUNT(*) FROM code_tasks WHERE status = 'reverted' AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
      + (SELECT COUNT(*) FROM agent_issues WHERE instr(title, 'CONTROL-PLANE-REVERTED-1') = 1 AND created_at > (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000) > 0
     AND CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'code_merge_max_merges_per_tick'), '3') AS INTEGER) > 1)
    OR
    ((SELECT COUNT(*) FROM code_tasks WHERE status = 'reverted' AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
      + (SELECT COUNT(*) FROM agent_issues WHERE instr(title, 'CONTROL-PLANE-REVERTED-1') = 1 AND created_at > (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000) = 0
     AND (SELECT COUNT(*) FROM code_tasks WHERE merged_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) >= 1
     AND (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'failed', 'publish_failed', 'needs_human', 'reverted'))
         > CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'code_merge_max_merges_per_tick'), '3') AS INTEGER)
     AND CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'code_merge_max_merges_per_tick'), '3') AS INTEGER) < 5))
BEGIN
  INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain)
  SELECT 'wip-self-tune', 'merge concurrency should follow revert and queue evidence, not a hand-set number',
    'code_merge_max_merges_per_tick ' || v.cur || ' -> ' || (CASE WHEN v.rev > 0 THEN v.cur - 1 ELSE v.cur + 1 END),
    'reverts_24h=' || v.rev || ' merges_24h=' || v.mer || ' waiting=' || v.q,
    CASE WHEN v.rev > 0 THEN 'fewer merges per tick after a revert' ELSE 'more merges per tick while merges stay and tasks wait' END,
    'qnfo-fleet-control merge runner', 'UPDATE ops_config SET value = ''' || v.cur || ''' WHERE key = ''code_merge_max_merges_per_tick''', NULL
  FROM (SELECT CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'code_merge_max_merges_per_tick'), '3') AS INTEGER) AS cur,
          (SELECT COUNT(*) FROM code_tasks WHERE status = 'reverted' AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
            + (SELECT COUNT(*) FROM agent_issues WHERE instr(title, 'CONTROL-PLANE-REVERTED-1') = 1 AND created_at > (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000) AS rev,
          (SELECT COUNT(*) FROM code_tasks WHERE merged_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS mer,
          (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'failed', 'publish_failed', 'needs_human', 'reverted')) AS q) v;
  UPDATE ops_config SET updated_at = datetime('now'),
      value = CAST(CAST(value AS INTEGER) + (CASE WHEN (SELECT COUNT(*) FROM code_tasks WHERE status = 'reverted' AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
            + (SELECT COUNT(*) FROM agent_issues WHERE instr(title, 'CONTROL-PLANE-REVERTED-1') = 1 AND created_at > (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000) > 0 THEN -1 ELSE 1 END) AS TEXT)
  WHERE key = 'code_merge_max_merges_per_tick';
END;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'repeated failures need a person to notice them', 'v_loop_breaker_signatures plus the runner files repeated failures; wip_self_tune sets merge concurrency by rule', 'research-exec logged the same zenodo_enabled error 11 times in 24 h before a session found it; code_merge_max_merges_per_tick was hand-set at 3 since 2026-10-02', 'repeated failures file themselves; merge concurrency follows revert evidence', 'ops_config code_merge_max_merges_per_tick', 'the Rollback line', 'the fleet notices its own repeated failures'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'v_loop_breaker_signatures plus the runner%');
