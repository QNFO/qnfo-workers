-- FOLLOWUP-ISSUES-1 (2026-10-26, charter pillar autonomy; follow-ups of BREACHES-UNMAPPED-REFRESH-1 and the owner map of agent_issues 2192 written as issues with a doer and a closing probe, not as prose).
-- WHAT WAS FOUND (read 2026-10-26 20:00Z from live qnfo-audit, read-only):
--   1. v_breach_by_cause reads 6 breaches with cause 'unmapped' (drift_total, cf_obs_reopen_churn_24h, records_past_retention, pii_in_logs, agent_tool_calls_outside_allowlist, metrics_worsening_7d): metrics registered after
--      BREACH-ONE-MEANING-1 mapped the rest, and that migration says a later metric is not mapped by guess. The guard breaches_unmapped now carries the live count (BREACHES-UNMAPPED-REFRESH-1) and the standing detector
--      fm-breach-unmapped fails on it, but no issue names a doer and docs/breach-doctor does not mention mapping a new metric. Filed as BREACH-UNMAPPED-1.
--   2. pr_open_over_10m (target 0, declared */10, the metric the owner directive PR-MERGE-SLA-10M-1 is judged on) is written only by the trigger pr_merge_sla_heavy_tick on fleet_tick_heavy, which skips the write unless
--      last_refreshed is older than 50 minutes; the heavy tick inserts every 10 minutes, so the metric was written at 18:11:02Z, 19:01:23Z and 19:51:30Z. SELECT over_10m FROM v_pr_merge_sla reads 4 rows in 0.8 ms, so the
--      throttle has no cost reason. The change recreates a trigger on a fleet tick table and makes a 10-minute reading open and close its METRIC-TRIGGER ticket more often (TRIGGER-FLAP-1, agent_issues 1000459), so it is
--      the owner's call with that in view and is filed as PR-SLA-METRIC-CADENCE-1, not made here.
-- WHAT THIS FILE DOES: inserts the two issues once each (a replay finds the open title and adds nothing), gives each its closing probe in place of the generic born contract (UPDATE guarded by status superseded and the
--   VACUOUS-PROBE-V3-1 action text, the pattern of migrations/2026-10-26-metric-sample-gate-1.sql), and logs the decision. No metric, trigger, worker, cap or guard changes.
-- PREDICTION: both issues are open with an active contract after apply; the probe of the first reads 6 and fails until the six metrics have a cause row, the probe of the second fails while pr_open_over_10m is older than
--   15 minutes. Falsifier: either issue closed by anything other than its probe passing.
-- spof-review: none added. The Rollback deletes the two rows this file inserted (agent_issues keeps a tombstone and a lifecycle row), so no BACKUP table beyond the issues themselves is needed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE source = 'session' AND linked_session IS NULL AND (title LIKE 'BREACH-UNMAPPED-1:%' OR title LIKE 'PR-SLA-METRIC-CADENCE-1:%') AND created_at > 1793040000000); DELETE FROM issue_triage WHERE issue_id IN (SELECT id FROM agent_issues WHERE source = 'session' AND linked_session IS NULL AND (title LIKE 'BREACH-UNMAPPED-1:%' OR title LIKE 'PR-SLA-METRIC-CADENCE-1:%') AND created_at > 1793040000000); DELETE FROM agent_issues WHERE source = 'session' AND linked_session IS NULL AND (title LIKE 'BREACH-UNMAPPED-1:%' OR title LIKE 'PR-SLA-METRIC-CADENCE-1:%') AND created_at > 1793040000000;

-- 1. BREACH-UNMAPPED-1
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'BREACH-UNMAPPED-1: six breaching metrics have no metric_breach_cause row, so the breach view and the guard breaches_unmapped read them as unmapped',
  'Measured 2026-10-26 20:00Z on qnfo-audit (read-only). v_breach_by_cause reads 6 breaches with cause unmapped: drift_total, cf_obs_reopen_churn_24h, records_past_retention, pii_in_logs, agent_tool_calls_outside_allowlist, metrics_worsening_7d. They are metrics registered after BREACH-ONE-MEANING-1 mapped the rest (migrations/2026-10-26-breach-one-meaning-2.sql mapped the first set), and that migration says a later metric is not mapped by guess. The guard metric breaches_unmapped (target 0) now carries the live count (BREACHES-UNMAPPED-REFRESH-1, an hourly metric-refresh step) and the standing detector fm-breach-unmapped fails on the same number, so the gap is visible but had no doer: docs/breach-doctor does not mention mapping a new metric.' || char(10) || 'Doer: the breach doctor (BREACH-DOCTOR-1, qnfo-fleet-control) for the rule that maps a new breaching metric to a cause when it is registered; until that exists a session maps the six by migration, one metric_breach_cause row each (metric_key, cause_key from breach_causes: breach-doctor, code-loop, heartbeat, issue-backlog, measurement, owner-routing, publishing, spend, structure) with the evidence for the cause, never by guess.' || char(10) || 'Definition of done: the closing probe of this issue reads 0 unmapped breaches. Failure mode to watch: a metric registered in breach tomorrow reappears as unmapped, so the rule at registration matters more than the six rows.',
  'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title = 'BREACH-UNMAPPED-1: six breaching metrics have no metric_breach_cause row, so the breach view and the guard breaches_unmapped read them as unmapped');

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COALESCE(SUM(breaches), 0) FROM v_breach_by_cause WHERE cause_key = ''unmapped'') AS TEXT) AS observed',
    verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'followup-issues-1',
    precondition = 'the issue is open: breaching metrics exist that no metric_breach_cause row maps to a cause',
    action = 'MEASURES the defect: the number of breaches v_breach_by_cause reads with cause unmapped, 0 when every breaching metric has a cause row. FOLLOWUP-ISSUES-1'
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE status = 'open' AND title = 'BREACH-UNMAPPED-1: six breaching metrics have no metric_breach_cause row, so the breach view and the guard breaches_unmapped read them as unmapped' ORDER BY id DESC LIMIT 1)
  AND status = 'superseded' AND instr(action, 'VACUOUS-PROBE-V3-1') = 1;

-- 2. PR-SLA-METRIC-CADENCE-1
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'PR-SLA-METRIC-CADENCE-1: pr_open_over_10m is written every 50 minutes by its trigger throttle while the 10-minute merge SLA is judged on it',
  'Measured 2026-10-26 20:00Z on qnfo-audit (read-only). metric_registry declares pr_open_over_10m with refresh_cadence */10 and target 0 (owner directive PR-MERGE-SLA-10M-1: every pull request merges within 10 minutes of opening). Its only writer is the trigger pr_merge_sla_heavy_tick on fleet_tick_heavy, which skips the write unless last_refreshed is older than 50 minutes. fleet_tick_heavy inserts every 10 minutes (cron qnfo-code-orchestrator: 19:01, 19:11, 19:21 ... 19:51), so the metric was written at 18:11:02Z, 19:01:23Z and 19:51:30Z: a pull request that breaks the 10-minute SLA is judged up to 50 minutes late, and METRIC-REGISTRY-STALENESS-1 (agent_issues 2192) lists the row as stale against */10. The throttle has no cost reason: SELECT over_10m FROM v_pr_merge_sla reads 4 rows in 0.8 ms.' || char(10) || 'Fix: recreate the trigger with a throttle of 8 minutes (one write per heavy tick; the Rollback restores 50) by a migration with a replay test, or measure the metric in the lane tick of qnfo-fleet-control. Doer: the owner of PR-MERGE-SLA-10M-1 (the qnfo-fleet-control pull request lane); a session may implement the migration. Failure mode to watch: a ten-minute reading opens and closes the METRIC-TRIGGER ticket of this metric more often (TRIGGER-FLAP-1, agent_issues 1000459), so land it with that in view.' || char(10) || 'Definition of done: the closing probe of this issue reads pr_open_over_10m measured within the last 15 minutes.',
  'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title = 'PR-SLA-METRIC-CADENCE-1: pr_open_over_10m is written every 50 minutes by its trigger throttle while the 10-minute merge SLA is judged on it');

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM metric_registry WHERE metric = ''pr_open_over_10m'' AND state = ''MEASURED'' AND last_value IS NOT NULL AND last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-15 minutes'')) THEN ''ok'' ELSE ''not met: pr_open_over_10m was last measured '' || COALESCE((SELECT last_refreshed FROM metric_registry WHERE metric = ''pr_open_over_10m''), ''never'') END AS observed',
    verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'followup-issues-1',
    precondition = 'the issue is open: pr_open_over_10m is measured less often than the 10-minute merge SLA it judges',
    action = 'MEASURES the defect: pr_open_over_10m is MEASURED with a value and a last_refreshed within the last 15 minutes. FOLLOWUP-ISSUES-1'
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE status = 'open' AND title = 'PR-SLA-METRIC-CADENCE-1: pr_open_over_10m is written every 50 minutes by its trigger throttle while the 10-minute merge SLA is judged on it' ORDER BY id DESC LIMIT 1)
  AND status = 'superseded' AND instr(action, 'VACUOUS-PROBE-V3-1') = 1;

-- 3. The decision, append-only.
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a2 (remediation session 2026-10-26)',
  'a follow-up that is only written in a reply is lost: it becomes an issue with a doer and a probe that measures the defect, and a change that makes a ten-minute reading open and close tickets more often is the owner of that metric''s call',
  'FOLLOWUP-ISSUES-1: agent_issues BREACH-UNMAPPED-1 (six breaches with no cause row) and PR-SLA-METRIC-CADENCE-1 (pr_open_over_10m written every 50 minutes) filed with a doer and a measuring contract each',
  'read 2026-10-26 20:00Z from live qnfo-audit: v_breach_by_cause unmapped 6, fm-breach-unmapped failing at 6, no open issue naming either gap; pr_open_over_10m last_refreshed 18:11:02Z, 19:01:23Z, 19:51:30Z against a declared */10, trigger pr_merge_sla_heavy_tick throttle 50 minutes, v_pr_merge_sla 0.8 ms',
  'applied through the canonical path on merge: two open issues, each with an active d1-query contract that fails until the defect is fixed',
  'two agent_issues rows (and the triage rows and contracts their births create), two contract probes; no trigger, worker, metric, cap, guard or probe of another issue changed',
  'the Rollback header of migrations/2026-10-26-followup-issues-1.sql deletes the two issues, their triage rows and contracts',
  'follow-ups-are-issues-with-a-doer',
  'both issues stay open until their probes pass: the unmapped count reaches 0 and pr_open_over_10m is measured within 15 minutes',
  NULL,
  'node:sqlite replay (migrations/followup-issues-1.test.mjs) with the born contract of each issue, both probes met and unmet, a replay, an existing open title, the Rollback; apply_migrations.py --check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor LIKE 'rem-a2%' AND instr(action, 'FOLLOWUP-ISSUES-1') > 0);
