-- SLA-MECHANISMS-1 (2026-10-12, pillar autonomy; agent_issues 2197 RECURRENCE-REVIOLATION-1, 2194 issues_unprobed_60m,
-- 2193 stuck_items_over_sla, 2195 unverified_blocker_claims, 1297 CLOSE-PREDICATE-NON-MONOTONE-1). Each is a metric or guard
-- that stayed in breach because a mechanism in SQL was missing. Read on 2026-10-12 05:00-05:30Z:
--   2194  issues_unprobed_60m = 20 right after the hourly probe run. The 20 were: 5 d1-query and 9 runner-https contracts of
--         open issues with expected_cadence_h 6 or 24 (next_due_at up to a day ahead; the hourly rule is an INSERT trigger,
--         so older contracts and every pass that puts a contract on hold at a 24 h cadence escape it), 2 contracts holding
--         on an open issue, 4 with no machine probe yet and 1 refused by probe review. Fix: the 10-minute tick pulls
--         next_due_at back to 55 minutes after the last attempt for every active or holding contract of an OPEN issue.
--         The 7-day hold itself is unchanged: the pass streak is measured in time since the first pass, not in probe count,
--         so a held contract probed hourly closes on the same day and a relapse is seen within the hour, not the day.
--   2193  stuck_items_over_sla = 40: 34 research rows queued over 180 min (the executor's throughput, issue 2175, not SQL),
--         1 stalled code task, 5 issues "without a doer". Three of the five carry a contract that is holding: its probe
--         passes and the hold is counting down, which is a working closing mechanism. v_stuck_summary now counts holding
--         like active there (v_issues_no_next_action already does).
--   2195  v_blocker_claims counts the METRIC-TRIGGER issue of unverified_blocker_claims itself: the trigger's own action
--         text contains the word the view searches for, so the metric could never read 0 while its issue was open.
--         That one title pattern is excluded; every other claim still needs a recorded blocker_redteam verdict.
--   2197  v_triage_gap read 0 at authoring, but the only writer of issue_triage for a new issue is an AFTER INSERT trigger
--         that fires when the row is born open; an issue that is inserted in another status and opened later, or whose
--         triage row is removed, re-violates. Fix: the tick inserts the missing triage row (issue 1297 fix b: the guard
--         repairs, then the detector fm-triage-gap proves it).
--   1297  closures that do not hold. Four closed issues (1794, 1855, 2036, 2081) had an active or holding contract that
--         failed 3 to 22 times after the closure and its last pass, and were never reopened by REMEDIATION-REOPEN-1 in the
--         worker tick. Second path, in D1: recurrence_guard_tick reopens such an issue hourly, with the failure and the
--         prior close evidence in its description, puts the contract back to active and logs the action. It gives the
--         worker two hours first, counts 'pending' and 'pending: <reason>' as deferrals (REMEDIATION-PENDING-PREFIX-1),
--         acts only while the newest verdict is itself a failure, and never touches a wontfix issue. Nothing is deleted.
-- Also: an index on remediation_verifications (class, verified_at). The 1297 probe read 47 million rows in 6.5 s on
-- 2026-10-12 because every per-class lookup scanned the table (17,367 rows, index on issue_id only).
-- New stuck types get their queue_sla rows; v_stuck_summary gains triage_gap and contracts_cadence_drift, and
-- v_stuck_summary_kernel carries the three kernel queues (unscored predictions, waiting proposals, missed tick steps).
-- ops_config queue_sla_autofix = off stops the three fixes, as for the other queue_sla fixes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_sla_views
-- Rollback: DROP TRIGGER IF EXISTS sla_mechanisms_tick_10m; DROP TRIGGER IF EXISTS recurrence_guard_tick; DROP VIEW IF EXISTS v_stuck_summary_kernel; restore v_stuck_summary and v_blocker_claims from bak_20261012_sla_views.sql (DROP VIEW, then run the stored CREATE VIEW text); DELETE FROM queue_sla WHERE stuck_type IN ('issue-triage-gap', 'contract-cadence-drift', 'closure-relapse', 'prediction-unscored', 'doctrine-proposal-waiting', 'tick-step-missed'); DELETE FROM failure_modes WHERE fm_key IN ('contract-cadence-drift', 'closure-relapse-unreopened', 'triage-gap'); DELETE FROM remediation_contracts WHERE class IN ('fm-contract-cadence-drift', 'fm-closure-relapse-unreopened', 'fm-triage-gap') (recurrence_guard_actions is a ledger and stays; an issue the guard reopened is closed again only with close_evidence)

CREATE INDEX IF NOT EXISTS idx_remediation_verifications_class_ts ON remediation_verifications (class, verified_at);

CREATE TABLE IF NOT EXISTS bak_20261012_sla_views AS
SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at FROM sqlite_master WHERE type = 'view' AND name IN ('v_stuck_summary', 'v_blocker_claims');

CREATE TABLE IF NOT EXISTS recurrence_guard_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  issue_id INTEGER NOT NULL,
  class TEXT NOT NULL,
  fails INTEGER NOT NULL,
  last_observed TEXT,
  prior_status TEXT,
  prior_close_evidence TEXT,
  applied INTEGER NOT NULL DEFAULT 0
);

DROP VIEW IF EXISTS v_stuck_summary;

CREATE VIEW v_stuck_summary AS
SELECT
  (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id
     WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error,
  (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0
     AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok'
       AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled,
  (SELECT COUNT(*) FROM research_queue WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-180 minutes')) AS research_queued_180m,
  (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending,
  (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact')
     AND datetime(created_at) < datetime('now', '-180 minutes')) AS outreach_waiting,
  (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted')
     AND datetime(updated_at) < datetime('now', '-180 minutes')) AS code_tasks_stalled,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 10800) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
       AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h,
  (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes'))
     THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled,
  (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id
     WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-360 minutes')) AS research_held_over_sla,
  (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap,
  (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id
     WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL
       AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift;

DROP VIEW IF EXISTS v_blocker_claims;

CREATE VIEW v_blocker_claims AS
SELECT 'issue:' || a.id AS target, a.title AS text, a.created_at AS created_ms FROM agent_issues a
WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 3600) * 1000
  AND (lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner only%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner-only%'
    OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs a token%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%no token%'
    OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs the owner%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%cannot be done%'
    OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%blocked%' OR lower(COALESCE(a.description, '')) LIKE '%session-task:%')
  AND a.title NOT LIKE 'METRIC-TRIGGER-%UNVERIFIED-BLOCKER-CLAIMS%'
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:' || a.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
UNION ALL
SELECT 'card:' || h.id, h.title, CAST(strftime('%s', h.created_at) AS INTEGER) * 1000 FROM human_actions h
WHERE h.status = 'open' AND datetime(h.created_at) < datetime('now', '-60 minutes')
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'card:' || h.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'));

CREATE VIEW IF NOT EXISTS v_stuck_summary_kernel AS
SELECT
  (SELECT COUNT(*) FROM decision_predictions WHERE scored_at IS NULL AND due_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS predictions_unscored_over_sla,
  (SELECT COUNT(*) FROM doctrine_proposals WHERE status = 'proposed' AND ts < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS doctrine_proposals_waiting,
  (SELECT COUNT(*) FROM tick_runs WHERE ok = 0 AND tick_id = (SELECT MAX(tick_id) FROM tick_runs)) AS tick_steps_missed_last_slot;

INSERT OR IGNORE INTO queue_sla (stuck_type, queue, definition, cycle_min, sla_min, auto_fix, owner, summary_column) VALUES
 ('issue-triage-gap', 'agent_issues', 'open issue with no issue_triage row', 10, 10, 'sla_mechanisms_tick_10m inserts the triage row (rc AUTOTRIAGE-TICK-1, owner from the issue''s code-task path or qnfo-ops)', 'qnfo-audit fleet tick', 'triage_gap'),
 ('contract-cadence-drift', 'remediation_contracts', 'active or holding contract of an open issue due more than 70 minutes ahead', 10, 70, 'sla_mechanisms_tick_10m sets next_due_at to 55 minutes after the last attempt (and expected_cadence_h 1 for an active contract)', 'qnfo-audit fleet tick', 'contracts_cadence_drift'),
 ('closure-relapse', 'agent_issues', 'closed or resolved issue whose contract failed max_attempts times since the closure and its last pass, more than 2 hours after the closure', 60, 180, 'recurrence_guard_tick reopens the issue with the failure and the prior close evidence, re-arms the contract, ledger recurrence_guard_actions', 'qnfo-audit fleet tick', 'recurrence_guard_actions (ledger)'),
 ('prediction-unscored', 'decision_predictions', 'prediction more than 120 minutes past due with no score', 60, 120, 'calibration_scorer_tick scores it hourly; one that stays unscored names a metric with no value (metric predictions_unscored_over_sla files it)', 'qnfo-audit fleet tick', 'v_stuck_summary_kernel.predictions_unscored_over_sla'),
 ('doctrine-proposal-waiting', 'doctrine_proposals', 'proposal in status proposed for more than 24 hours', 60, 1440, 'none automatic: adoption is by PR (metric doctrine_proposals_open files the issue)', 'qnfo-fleet-control', 'v_stuck_summary_kernel.doctrine_proposals_waiting'),
 ('tick-step-missed', 'tick_runs', 'a section 1 step with no evidence in the newest hour slot', 60, 60, 'none automatic: metric tick_sequence_completion_24h files the issue naming the step and its loop', 'qnfo-fleet-control', 'v_stuck_summary_kernel.tick_steps_missed_last_slot');

CREATE TRIGGER IF NOT EXISTS sla_mechanisms_tick_10m AFTER INSERT ON fleet_tick
WHEN COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
BEGIN
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'issue-triage-gap', COUNT(*), group_concat(i.id, ',') FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id
    WHERE i.status = 'open' AND t.issue_id IS NULL HAVING COUNT(*) > 0;
  INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
    SELECT i.id, 'AUTOTRIAGE-TICK-1', 'triaged',
      COALESCE((SELECT s.service FROM service_registry s WHERE instr(COALESCE(i.description, ''), 'code-task: repo=qnfo-workers path=' || s.service || '/') > 0 LIMIT 1), 'qnfo-ops'),
      datetime('now')
    FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id
    WHERE i.status = 'open' AND t.issue_id IS NULL;

  UPDATE remediation_contracts
  SET next_due_at = datetime(COALESCE(last_attempt_at, datetime('now', '-55 minutes')), '+55 minutes'),
      expected_cadence_h = CASE WHEN status = 'active' THEN 1 ELSE expected_cadence_h END
  WHERE status IN ('active', 'holding') AND next_due_at IS NOT NULL
    AND datetime(next_due_at) > datetime('now', '+70 minutes')
    AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');
END;

CREATE TRIGGER IF NOT EXISTS recurrence_guard_tick AFTER INSERT ON fleet_tick
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
    AND id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0);
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
 ('contract-cadence-drift', 'an open issue''s closing probe is due hours or a day ahead',
  'the hourly rule is an AFTER INSERT trigger on remediation_contracts; a contract older than the rule keeps its cadence, and every pass puts a contract on hold at a 24 h cadence',
  'SLA-MECHANISMS-1: sla_mechanisms_tick_10m pulls next_due_at back to 55 minutes after the last attempt for contracts of open issues',
  'no active or holding contract of an open issue is due more than 70 minutes ahead', 'fm-contract-cadence-drift', '2026-10-08', 2194,
  'a contract with expected_cadence_h above 1, or a pass on an open issue', 'issues_unprobed_60m stays above 10 after every probe run', 'an open issue goes unverified for up to a day'),
 ('closure-relapse-unreopened', 'a closed issue''s contract keeps failing and the issue stays closed',
  'REMEDIATION-REOPEN-1 runs only inside the worker tick that evaluates the contract; four closures (1794, 1855, 2036, 2081) failed 3 to 22 times with no reopen and no lifecycle row',
  'SLA-MECHANISMS-1: recurrence_guard_tick reopens them from D1 hourly (second path), ledger recurrence_guard_actions',
  'no closed or resolved issue has an active or holding contract at or past max_attempts real failures for more than 3 hours', 'fm-closure-relapse-unreopened', '2026-09-28', 1297,
  'a failing probe on a closed issue', 'the close-predicate-monotone probe reads unguarded', 'closed issues that are not fixed are counted as fixed'),
 ('triage-gap', 'an open issue has no triage row',
  'issue_triage is written by an AFTER INSERT trigger that fires only for a row born open',
  'SLA-MECHANISMS-1: sla_mechanisms_tick_10m inserts the missing row every tick',
  'v_triage_gap is empty', 'fm-triage-gap', '2026-09-28', 2197,
  'an issue opened by an update, or a deleted triage row', 'RECURRENCE-REVIOLATION-1 is refiled', 'the issue has no owner and no SLA clock');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-contract-cadence-drift', NULL, 'SLA-MECHANISMS-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = ''open'' AND c.status IN (''active'', ''holding'') AND c.next_due_at IS NOT NULL AND datetime(c.next_due_at) > datetime(''now'', ''+90 minutes'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-closure-relapse-unreopened', NULL, 'SLA-MECHANISMS-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE c.status IN (''active'', ''holding'') AND a.status IN (''closed'', ''resolved'') AND typeof(a.updated_at) = ''integer'' AND a.updated_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 10800) * 1000 AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0 AND COALESCE(v.observed, '''') <> '''' AND lower(trim(v.observed)) NOT LIKE ''pending%'' AND v.verified_at > MAX(datetime(a.updated_at / 1000, ''unixepoch''), COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), ''1970-01-01'')) AND v.verified_at < datetime(''now'', ''-3 hours'')) >= MAX(1, COALESCE(c.max_attempts, 3))) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-triage-gap', NULL, 'SLA-MECHANISMS-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = ''open'' AND t.issue_id IS NULL AND i.created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 1200) * 1000) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('reopen a closed issue whose probe keeps failing, from D1', 'SLA-MECHANISMS-1 (migrations/2026-10-12-23-sla-mechanisms.sql)', 'fleet_tick heartbeat; remediation_verifications', 'tested in SQLite against the live schema', '2026-10-12', NULL, 'recurrence_guard_actions; second path to REMEDIATION-REOPEN-1'),
 ('keep every open issue''s probe due within the hour', 'SLA-MECHANISMS-1 (migrations/2026-10-12-23-sla-mechanisms.sql)', 'fleet_tick heartbeat', 'tested in SQLite against the live schema', '2026-10-12', NULL, 'v_stuck_summary.contracts_cadence_drift, detector fm-contract-cadence-drift');

INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
 ('remediation reopen on relapse', 'qnfo-fleet-control remediationContractsTick (REMEDIATION-REOPEN-1)', 'qnfo-audit trigger recurrence_guard_tick (RECURRENCE-GUARD-SQL-1)', NULL, 'SLA-MECHANISMS-1: four relapsed closures the worker path left closed; the D1 path reopens them at its first run (recurrence_guard_actions)', 1297, '2026-10-12');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01GMkRMxQsNprwDUX4J9zbji', 'a breach that survives its own fix has a missing mechanism; where the mechanism is a D1 rule, the fleet tick can hold it',
  'SLA-MECHANISMS-1: hourly cadence kept for contracts of open issues, triage rows repaired on the tick, relapsed closures reopened from D1, holding counted as a doer, the self-counting blocker issue excluded, an index for per-class probe lookups',
  'read 2026-10-12 05:00-05:30Z: issues_unprobed_60m 20 (14 contracts of open issues on a 6 or 24 h cadence, 2 holding, 4 without a probe, 1 refused); 4 closed issues with 3 to 22 failures after closure and no reopen; the 1297 probe read 47 million rows in 6.5 s',
  'the metrics measure the defect and the tick repairs what SQL can repair', 'two fleet_tick triggers, two views replaced (text kept in bak_20261012_sla_views), one index, six queue_sla rows, three detectors',
  'the Rollback line', 'the fleet keeps its probes hourly and reopens closures that do not hold, without a worker',
  'issues_unprobed_60m <= 10 within 3 h', NULL, 'D1 triggers and views, SQLite test against the live schema'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'SLA-MECHANISMS-1:%');

INSERT INTO fleet_tick (source) VALUES ('migration:sla-mechanisms');
