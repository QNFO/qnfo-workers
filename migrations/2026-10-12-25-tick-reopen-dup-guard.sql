-- TICK-REOPEN-DUP-GUARD-1 (2026-10-12, pillar autonomy; agent_issues 2383, closes the cause of 2364 and 2365).
-- From 2026-10-12 09:00Z every fleet_tick insert at minute < 10 rolled back with
--   "UNIQUE constraint failed: index 'idx_agent_issues_open_title_ci'" (cloud_ops_events fleet-cron-tick-error 09:00:45Z;
--   no fleet_tick row between 08:50:31Z and 09:10:31Z),
-- and migrations 2026-10-12-23-sla-mechanisms and 2026-10-12-24-register-dispositions failed the same way at their final
-- INSERT INTO fleet_tick. Cause: recurrence_guard_tick (minute < 10 or a migration tick) and reconcile_tick (every tick)
-- reopen a closed issue with UPDATE ... SET status = 'open'. 14 closed issues with an active or holding remediation contract
-- shared their title with an open re-filed twin (for example 1794/2118, 2070/2159, 2023/2300), so the reopen broke the
-- partial unique index on open titles and the whole tick, with every trigger hanging off it, rolled back.
-- Fix: neither trigger reopens a row whose lower(trim(title)) is already open under another id; the open twin carries the
-- work. Applied live by chat-session-2026-10-12 at about 09:10Z (decision_log TICK-REOPEN-DUP-GUARD-1, prior SQL kept in
-- bak_20261012_tick_reopen_triggers) and verified with the tick migration:tick-dup-guard-1 (73 changes, 0 duplicate open
-- titles). This file records that state in the repository so a later migration cannot reintroduce the outage; applying it
-- again is a no-op on the live schema.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_tick_reopen_triggers
-- Rollback: DROP TRIGGER IF EXISTS reconcile_tick; DROP TRIGGER IF EXISTS recurrence_guard_tick; then re-run the two CREATE TRIGGER statements stored in column sql of bak_20261012_tick_reopen_triggers; DELETE FROM remediation_contracts WHERE class = 'fm-tick-reopen-dup-title'; DELETE FROM failure_modes WHERE fm_key = 'tick-reopen-dup-title'

DROP TRIGGER IF EXISTS reconcile_tick;

CREATE TRIGGER reconcile_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'NO-SILENT-DROP-2 ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ': reopened by reconciliation: it was ' || status || ' with no close evidence (a silent drop by doctrine section 6). Close it with close_evidence or supersede it.'
  WHERE id IN (SELECT l.issue_id FROM issue_lifecycle l WHERE l.event = 'dispositioned' AND l.has_evidence = 0)
    AND status IN ('closed', 'resolved', 'wontfix')
    AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = agent_issues.id AND TRIM(COALESCE(t.close_evidence, '')) <> '')
    -- TICK-REOPEN-DUP-GUARD-1 (2026-10-12): never reopen a row whose title is already open; the open twin carries the work, and the reopen would violate idx_agent_issues_open_title_ci and roll back the whole fleet tick.
    AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> agent_issues.id AND lower(trim(o.title)) = lower(trim(agent_issues.title)));
END;

DROP TRIGGER IF EXISTS recurrence_guard_tick;

CREATE TRIGGER recurrence_guard_tick AFTER INSERT ON fleet_tick
WHEN (strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%')
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
BEGIN
  INSERT INTO recurrence_guard_actions (issue_id, class, fails, last_observed, prior_status, prior_close_evidence)
    SELECT x.issue_id, x.class, x.fails, x.last_observed, x.status, x.close_evidence
    FROM (
      SELECT c.issue_id, c.class, a.status, c.max_attempts, t.close_evidence,
        (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0
           AND COALESCE(v.observed, '') <> '' AND lower(trim(v.observed)) NOT LIKE 'pending%'
           AND v.verified_at > MAX(datetime(a.updated_at / 1000, 'unixepoch'),
                 COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), '1970-01-01'))) AS fails,
        (SELECT substr(v.observed, 1, 120) FROM remediation_verifications v WHERE v.class = c.class ORDER BY v.verified_at DESC LIMIT 1) AS last_observed
      FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id
      WHERE c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved') AND typeof(a.updated_at) = 'integer'
        AND a.updated_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
    ) x
    WHERE x.fails >= MAX(1, COALESCE(x.max_attempts, 3))
      AND COALESCE(x.last_observed, '') <> '' AND lower(trim(x.last_observed)) NOT LIKE 'pending%';
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (RECURRENCE-GUARD-SQL-1, qnfo-audit recurrence_guard_tick): '
        || COALESCE((SELECT 'contract ' || g.class || ' failed ' || g.fails || 'x after the closure and its last pass (last observed ' || COALESCE(g.last_observed, '?') || '). Prior close_evidence: ' || substr(COALESCE(g.prior_close_evidence, '(none)'), 1, 300)
                       FROM recurrence_guard_actions g WHERE g.issue_id = agent_issues.id ORDER BY g.id DESC LIMIT 1), 'a contract failed after the closure')
  WHERE status IN ('closed', 'resolved')
    AND id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0)
    -- TICK-REOPEN-DUP-GUARD-1 (2026-10-12): skip a row whose title is already open; the open twin carries the relapse, and reopening would violate idx_agent_issues_open_title_ci and roll back the whole fleet tick (fleet-cron-tick-error 2026-10-12T09:00:45Z).
    AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> agent_issues.id AND lower(trim(o.title)) = lower(trim(agent_issues.title)));
  UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
  WHERE issue_id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0)
    AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');
  UPDATE remediation_contracts SET status = 'active'
  WHERE status = 'holding' AND class IN (SELECT class FROM recurrence_guard_actions WHERE applied = 0);
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'closure-relapse', COUNT(*), group_concat(issue_id, ',') FROM recurrence_guard_actions
    WHERE applied = 0 HAVING COUNT(*) > 0;
  UPDATE recurrence_guard_actions SET applied = 1 WHERE applied = 0;
END;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('tick-reopen-dup-title', 'a fleet tick rolls back because a trigger reopens a closed issue whose title is already open',
  'reconcile_tick and recurrence_guard_tick set status = open on a closed row whose re-filed twin is open; idx_agent_issues_open_title_ci (unique on open titles) aborts the UPDATE and with it the whole fleet_tick insert',
  'both triggers carry a NOT EXISTS clause on an open row with the same lower(trim(title)) (TICK-REOPEN-DUP-GUARD-1)',
  'no fleet-cron-tick-error naming idx_agent_issues_open_title_ci in the last 2 hours', 'fm-tick-reopen-dup-title', '2026-10-12', 2383,
  'a closed issue with an active or holding contract shares its title with an open issue',
  'fleet-cron-tick-error events; no fleet_tick row for 20+ minutes; migrations fail at their final INSERT INTO fleet_tick',
  'every trigger on fleet_tick: SLA autofix, issue triage, reconciliation, metric refresh, recurrence guard');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-tick-reopen-dup-title', NULL, 'TICK-REOPEN-DUP-GUARD-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''fleet-cron-tick-error'' AND instr(text, ''idx_agent_issues_open_title_ci'') > 0 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 hours'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO fleet_tick (source) VALUES ('migration:tick-reopen-dup-guard');
