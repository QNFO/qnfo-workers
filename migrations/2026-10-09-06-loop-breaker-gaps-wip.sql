-- LOOP-BREAKER-1, ISSUE-ID-GAP-1, WIP-SELF-TUNE-1 (2026-10-09, pillar autonomy; agent_issues 2183 and 2182, doctrine revision 2
-- sections 2 and 4, section 6 accounting).
-- 1. v_loop_breaker_signatures: error signatures seen 3 or more times in 24 h, from cloud_ops_events (status error, digits
--    removed, first 48 chars, per producer) and failed code tasks (per path). scripts/loop_breaker_runner.py files one
--    LOOP-BREAKER-1 issue per signature that recurred in the last 2 h, from the GitHub runner: an agent_issues insert from a
--    fleet_tick trigger would nest the issue triggers (lifecycle, runtime probe, contract templates) past D1's 10 levels
--    (D1-TRIGGER-DEPTH-1), so the filing runs at depth 0.
-- 2. agent_issues_tombstone gets the 41 ids v_issue_accounting counted as deleted_unrecorded, each with its evidence class:
--    1409 was committed (its AUTOTRIAGE-1 triage row exists) and deleted before the tombstone ledger (2026-10-08 15:34Z);
--    2209 was never committed (no issue_lifecycle opened row and no triage row, both written in the insert's own
--    transaction): an id an aborted insert consumed; the other 39 predate the ledger and leave no row in issue_triage,
--    remediation_contracts, remediation_verifications or any bak_ table, so their content is unrecoverable. Status 'id-gap'
--    marks a reconstruction, not a copy. issue_id_gap_tick records future gaps the same way: an id at or above the ledger
--    start (2190) with no row, no tombstone and no opened event below the newest id is an aborted insert, since a committed
--    row always has its opened event and a delete always writes its tombstone (issue_lifecycle_bd).
-- 3. wip_self_tune: ops_config code_merge_max_merges_per_tick moves within 1..5 by rule, at most once per 6 h, each change
--    in decision_log (actor wip-self-tune): down by 1 after any revert in 24 h, up by 1 when there was none, at least one
--    merge landed in 24 h and more tasks wait than the limit.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS issue_id_gap_tick; DROP TRIGGER IF EXISTS wip_self_tune; DROP VIEW IF EXISTS v_loop_breaker_signatures (tombstone rows are evidence and stay)

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

INSERT INTO agent_issues_tombstone (id, title, description, source, status, deleted_at)
SELECT j.value,
  'ID-GAP ' || j.value || ': no row, no tombstone (reconstructed 2026-10-09)',
  CASE WHEN j.value = 1409 THEN 'Committed and deleted before the tombstone ledger began (2026-10-08 15:34Z): its AUTOTRIAGE-1 issue_triage row exists, no copy of the row does. Content unrecoverable.'
       WHEN j.value = 2209 THEN 'Never committed: no issue_lifecycle opened row and no issue_triage row, both written inside the insert''s own transaction; an aborted insert consumed the id.'
       ELSE 'Predates the issue_lifecycle ledger (2026-10-08 15:34Z); no row in issue_triage, remediation_contracts, remediation_verifications or any bak_ table. Deleted before the ledger or never committed; content unrecoverable.' END,
  'issue-accounting', 'id-gap', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM json_each('[370,371,372,373,808,1232,1233,1235,1237,1253,1254,1255,1300,1398,1409,1425,1426,1427,1428,1429,1430,1431,1432,1433,1434,1435,1439,1440,1441,1453,1464,1549,1550,1551,1552,1553,1554,1555,1556,1557,2209]') j
WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = j.value)
  AND NOT EXISTS (SELECT 1 FROM agent_issues_tombstone t WHERE t.id = j.value);

CREATE TRIGGER IF NOT EXISTS issue_id_gap_tick AFTER INSERT ON fleet_tick
BEGIN
  INSERT INTO agent_issues_tombstone (id, title, description, source, status, deleted_at)
  SELECT g.id, 'ID-GAP ' || g.id || ': aborted insert', 'Never committed: no issue_lifecycle opened row (written in the insert''s own transaction) and no tombstone; an aborted insert consumed the id. Recorded by issue_id_gap_tick.',
    'issue-accounting', 'id-gap', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  FROM (SELECT x.id - 1 AS id FROM (SELECT id FROM agent_issues WHERE id > 2190 UNION SELECT id FROM agent_issues_tombstone WHERE id > 2190) x) g
  WHERE g.id >= 2190
    AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = g.id)
    AND NOT EXISTS (SELECT 1 FROM agent_issues_tombstone t WHERE t.id = g.id)
    AND NOT EXISTS (SELECT 1 FROM issue_lifecycle l WHERE l.issue_id = g.id);
END;

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
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'issue accounting gaps and repeated failures need a person to notice them', 'tombstoned 41 id gaps with their evidence class; issue_id_gap_tick records aborted inserts; v_loop_breaker_signatures plus the runner files repeated failures; wip_self_tune sets merge concurrency by rule', 'v_issue_accounting deleted_unrecorded = 41; 2209 had no opened event; research-exec logged the same zenodo_enabled error 11 times in 24 h before a session found it', 'issues_unaccounted 41 -> 0 by evidence, not by deletion; repeated failures file themselves', 'agent_issues_tombstone, ops_config code_merge_max_merges_per_tick', 'the Rollback line', 'the fleet notices its own repeated failures and accounts for every issue id'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'tombstoned 41 id gaps%');
