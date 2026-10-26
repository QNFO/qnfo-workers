-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE breach_playbooks SET trigger_sql = replace(replace(trigger_sql, 'gl.ts > COALESCE((SELECT MAX(lc.ts) FROM issue_lifecycle lc JOIN agent_issues lv ON lv.id = lc.issue_id WHERE lv.title = ''BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control'' AND lc.event = ''dispositioned'' AND lc.to_status = ''closed''), ''0000-01-01T00:00:00Z'')', 'gl.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-1440 minutes'')'), '''filer_quiet''', '''filer_quiet_24h'''), action_sql = replace(action_sql, 'gl.ts > COALESCE((SELECT MAX(lc.ts) FROM issue_lifecycle lc JOIN agent_issues lv ON lv.id = lc.issue_id WHERE lv.title = ''BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control'' AND lc.event = ''dispositioned'' AND lc.to_status = ''closed''), ''0000-01-01T00:00:00Z'')', 'gl.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-1440 minutes'')'), version = 1 WHERE rule_id = 'PN-R2' AND version = 2; UPDATE metric_registry SET formula = replace(formula, '(owner items included)', '(OWNER-TASK and OWNER-NOTE excluded, they have their own loop)') WHERE metric = 'orphan_issues_no_live_path'; UPDATE fleet_tasks SET definition = replace(definition, 'WHERE a.status = ''open'' AND a.created_at', 'WHERE a.status = ''open'' AND a.title NOT LIKE ''OWNER-TASK%'' AND a.title NOT LIKE ''OWNER-NOTE%'' AND a.created_at') WHERE id = 'probe-playbooks-metrics'; UPDATE control_registry SET location = 'breach_playbooks PN-R2 trigger_sql and action_sql: acts only when no PROBE-NEEDED-1 issue for an OWNER-TASK or OWNER-NOTE target was opened or reopened in the last 24 hours', alternate_path = 'the code lever (issue BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control) removes the cause in RT_LIVEPATH_ORPHAN_SQL, after which the gate opens by itself 1440 minutes after the last class-C PN event. The lever issue closes only when a code-read of main finds the exclusion, never on a quiet day. A flap is also bounded by verify (pn-reopened) and by the engine demoting a rule after 2 failed cases in 24 hours', evidence = 'live qnfo-audit 2026-10-26 11:25Z: 7 open PN for OWNER-TASK or OWNER-NOTE targets and 6 PN opened or reopened for such targets in the last 1440 minutes. A gate that releases itself on evidence, not a hold. Expiry: review by 2026-11-02' WHERE control = 'pn-r2-filer-quiet-gate'; DELETE FROM remediation_contracts WHERE class = 'belief-owner-items-have-a-loop'; DELETE FROM belief_registry WHERE belief_key = 'owner-items-have-a-loop';
--
-- PLAYBOOKS-REVIEW-2 (2026-10-26, agent_issues 1000426, charter pillar: autonomy). The second adversarial round on migrations/2026-10-26-probe-playbooks.sql (live since 14:31Z) found two blocking defects
-- that no later round could withdraw; this file repairs them by UPDATE of the applied rows (the applied migration is not edited).
--  1. PN-R2 held the rule for a 1440-minute quiet window (the filer's dedupe horizon). It delays remediation by up to 24 hours after the cause is fixed, against SLA-120M-1 (no SLA, threshold or window above
--     120 minutes), and the new pn_open_over_120m metric reads 13 while the rule waits. The window is replaced by a condition with no window: the lever issue BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control is
--     closed (its closing probe is a code-read of main for the OWNER-TASK and OWNER-NOTE exclusion, decided every hour) and no PROBE-NEEDED-1 issue for an owner target was opened or reopened after it
--     closed. While the lever is open the floor is year 0, so any class-C PN event keeps the gate shut; with no class-C PN event at all there is nothing to wait for. breach_playbooks.version is 2.
--  2. orphan_issues_no_live_path excluded OWNER-TASK and OWNER-NOTE issues ("they have their own loop"), although they are the largest orphan family: 14 of the 85 live orphans on 2026-10-26 12:35Z, six
--     of them critical, and 10 of the 14 have planner verdict not-code or none. The formula text, the observer step of the fleet_tasks workflow probe-playbooks-metrics and the first reading now count
--     them, and the belief that they have a loop is recorded in belief_registry with a falsifying belief- probe (falsified when half or more of the open owner items older than 120 minutes have no live
--     closing contract; it reads falsified on the day it is written, which is the finding).
-- Guarded on the old text, so a replay changes nothing. No DELETE or DROP runs in the body (the DELETE statements are in the Rollback line and remove only rows this file inserts).

UPDATE breach_playbooks SET
  trigger_sql = replace(replace(trigger_sql, 'gl.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-1440 minutes'')', 'gl.ts > COALESCE((SELECT MAX(lc.ts) FROM issue_lifecycle lc JOIN agent_issues lv ON lv.id = lc.issue_id WHERE lv.title = ''BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control'' AND lc.event = ''dispositioned'' AND lc.to_status = ''closed''), ''0000-01-01T00:00:00Z'')'), '''filer_quiet_24h''', '''filer_quiet'''),
  action_sql = replace(action_sql, 'gl.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-1440 minutes'')', 'gl.ts > COALESCE((SELECT MAX(lc.ts) FROM issue_lifecycle lc JOIN agent_issues lv ON lv.id = lc.issue_id WHERE lv.title = ''BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control'' AND lc.event = ''dispositioned'' AND lc.to_status = ''closed''), ''0000-01-01T00:00:00Z'')'),
  version = 2,
  note = note || ' REVIEW-2 2026-10-26 (agent_issues 1000426): the 1440-minute window is replaced by the lever-closed condition (no window, SLA-120M-1).'
WHERE rule_id = 'PN-R2' AND version = 1 AND instr(trigger_sql, '-1440 minutes') > 0;

UPDATE control_registry SET
  location = 'breach_playbooks PN-R2 trigger_sql and action_sql: acts only once the lever issue BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control is closed (its code-read found the OWNER-TASK and OWNER-NOTE exclusion in RT_LIVEPATH_ORPHAN_SQL on main) and no PROBE-NEEDED-1 issue for such a target was opened or reopened after it closed',
  alternate_path = 'no time window: the gate opens at the moment the lever issue closes, which the remediation consumer decides every hour from a code-read of main, never on a quiet day. A flap is bounded by verify (pn-reopened) and by the engine demoting a rule after 2 failed cases in 24 hours',
  evidence = 'live qnfo-audit 2026-10-26 11:25Z: 7 open PN for OWNER-TASK or OWNER-NOTE targets and 6 PN opened or reopened for such targets in the last 1440 minutes. A gate that releases itself on evidence, not a hold. Expiry: review by 2026-11-02 | REVIEW-2 2026-10-26 (agent_issues 1000426): the 1440-minute quiet window delayed the rule up to 24 hours after the cause was fixed, against SLA-120M-1 (no SLA, threshold or window above 120 minutes); replaced by the lever-closed condition, which has no window. 7 PN for such targets were waiting at 14:30Z. Expiry unchanged',
  reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'pn-r2-filer-quiet-gate' AND instr(alternate_path, '1440 minutes') > 0;

UPDATE fleet_tasks SET definition = replace(definition, 'WHERE a.status = ''open'' AND a.title NOT LIKE ''OWNER-TASK%'' AND a.title NOT LIKE ''OWNER-NOTE%'' AND a.created_at', 'WHERE a.status = ''open'' AND a.created_at'), updated_at = datetime('now')
WHERE id = 'probe-playbooks-metrics' AND instr(definition, 'WHERE a.status = ''open'' AND a.title NOT LIKE ''OWNER-TASK%'' AND a.title NOT LIKE ''OWNER-NOTE%'' AND a.created_at') > 0;

UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at <= (CAST(strftime('%s','now') AS INTEGER) - 3600) * 1000 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active','holding','monitoring','escalated') AND c.class NOT LIKE '%-BACKFILL-1' AND instr(lower(c.verify_probe), 'close_evidence') = 0)) AS TEXT), last_refreshed = datetime('now'), state = 'MEASURED' WHERE metric = 'orphan_issues_no_live_path' AND instr(formula, '(OWNER-TASK and OWNER-NOTE excluded, they have their own loop)') > 0;

UPDATE metric_registry SET formula = replace(formula, '(OWNER-TASK and OWNER-NOTE excluded, they have their own loop)', '(owner items included)')
WHERE metric = 'orphan_issues_no_live_path' AND instr(formula, '(OWNER-TASK and OWNER-NOTE excluded, they have their own loop)') > 0;

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on) VALUES
 ('owner-items-have-a-loop',
  'Open OWNER-TASK and OWNER-NOTE issues have their own loop that closes them, so a metric of issues without a live closing path may leave them out.',
  0.2,
  'Against: qnfo-audit 2026-10-26 12:35Z: 14 of the 85 open issues over 60 minutes with no live closing path are owner items, six of them critical and 100 to 123 hours old, 11 of the 14 hold only a superseded probe-template-v3-generic contract and 10 of the 14 have planner verdict not-code or none; owner directives HUMAN-ITEMS-AUTOMATIC-1 and OWNER-AUTO-100140-1 make the fleet their doer, but no loop that does it was found for these 14. For: owner_prompts rows exist for them and fm-human-items-waiting reads those that wait 120 minutes.',
  'belief-owner-items-have-a-loop', 'PLAYBOOKS-REVIEW-2 (agent_issues 1000426); migrations/2026-10-26-playbooks-review-2.sql');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at) VALUES
 ('belief-owner-items-have-a-loop', NULL,
  'migrations/2026-10-26-playbooks-review-2.sql has an ok row in migration_runs',
  'belief probe: falsified means half or more of the open OWNER-TASK and OWNER-NOTE issues older than 120 minutes have no live closing contract, so no loop is closing them. The metric orphan_issues_no_live_path counts them; the lever is a playbook row for owner items (a closing contract from owner_prompts) or an owner-item doer, not a number edit.',
  'SELECT ''holds'' AS expected, CASE WHEN s.total = 0 THEN ''holds'' WHEN 100.0 * s.dead / s.total < 50 THEN ''holds'' ELSE ''falsified: '' || s.dead || '' of '' || s.total || '' open owner items older than 120 minutes have no live closing contract'' END AS observed FROM (SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'',''holding'',''monitoring'',''escalated'') AND c.class NOT LIKE ''%-BACKFILL-1'' AND instr(lower(c.verify_probe), ''close_evidence'') = 0) THEN 1 ELSE 0 END), 0) AS dead FROM agent_issues a WHERE a.status = ''open'' AND (a.title LIKE ''OWNER-TASK%'' OR a.title LIKE ''OWNER-NOTE%'') AND a.created_at <= (CAST(strftime(''%s'',''now'') AS INTEGER) - 7200) * 1000) s',
  'd1-query', 1000, 'qnfo-fleet-control', 1, 'active', 'belief', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766:playbooks-review-2',
  'a rule that waits a fixed day after its cause is fixed is a hold with a number on it, and a metric that leaves out the largest family it measures reports a smaller backlog than exists; both are repaired where they are stored',
  'PLAYBOOKS-REVIEW-2: PN-R2 version 2 (no 1440-minute window; opens when the lever issue is closed and no class-C PN event follows), orphan_issues_no_live_path counts owner items (formula, observer step, first reading), belief owner-items-have-a-loop with its belief- probe, control pn-r2-filer-quiet-gate rewritten',
  'qnfo-audit 2026-10-26: 7 PN for owner targets waiting behind a gate that cannot open before 2026-10-26T22:11Z; 14 of 85 live orphans were owner items the metric did not count; adversarial review round 2 of PROBE-PLAYBOOKS-1',
  'applied by the canonical path on merge',
  'breach_playbooks PN-R2 (one rule), metric_registry orphan_issues_no_live_path (reads about 14 higher), the fleet_tasks workflow probe-playbooks-metrics, one belief and its contract, one control row',
  'the Rollback line of migrations/2026-10-26-playbooks-review-2.sql restores the texts and removes the belief rows; decision_log stays append-only',
  'a gate and a metric that state their own conditions', 'issue 1000426 closes on its probe; PN-R2 names the class-C PNs as soon as the lever issue closes', NULL,
  'qnfo-audit breach_playbooks, metric_registry, fleet_tasks, control_registry, belief_registry'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'session_01QpQv19uh1padRwZ3u1r766:playbooks-review-2');
