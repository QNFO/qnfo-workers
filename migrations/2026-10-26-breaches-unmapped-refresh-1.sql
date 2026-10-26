-- BREACHES-UNMAPPED-REFRESH-1 (2026-10-26, charter pillar autonomy; agent_issues 2192 METRIC-REGISTRY-STALENESS-1, owner map row "breaches_unmapped").
-- WHAT WAS FOUND (read 2026-10-26 19:30Z from live qnfo-audit, read-only): the guard metric breaches_unmapped (kind guard, target 0, declared refresh_cadence hourly, owner qnfo-fleet-control) has no writer.
--   BREACH-ONE-MEANING-1 registered it (migrations/2026-10-26-breach-one-meaning.sql) and two follow-up migrations wrote its value once each (-2 and -3, last_refreshed 2026-10-26T09:12:52Z); no fleet_tasks step, no trigger
--   and no worker code writes it (instr of the name over fleet_tasks.definition, sqlite_master trigger text and qnfo-fleet-control/worker.js all read 0). The stored value stayed '0' for ten hours while the view it is
--   defined on, v_breach_by_cause, reads 6 breaches with cause 'unmapped' now (drift_total, cf_obs_reopen_churn_24h, records_past_retention, pii_in_logs, agent_tool_calls_outside_allowlist, metrics_worsening_7d: metrics registered
--   after the mapping). The detector contract fm-breach-unmapped reads the view and fails at 6, correctly; the registry row, which the dashboard and the guard list read, said 0. It is also one of the ten rows that
--   METRIC-REGISTRY-STALENESS-1 (agent_issues 2192) lists as stale.
-- WHAT THIS FILE DOES (one metric-refresh step, the pattern of migrations/2026-10-26-metric-sample-gate-1.sql; the executor stops a workflow at its first failing step, and this one is last):
--   1. fleet_tasks metric-refresh gets the step breaches-unmapped, appended once with json_insert at steps[#] (the instr guard makes a replay a no-op): it writes breaches_unmapped from
--      SUM(breaches) of v_breach_by_cause where cause_key = 'unmapped', the formula the registry row already states, with last_refreshed and state MEASURED. The same statement runs once now, so the value is true at apply.
--   2. The six unmapped breaches are NOT mapped here: BREACH-ONE-MEANING-1 says a later metric is not mapped by guess, the breach doctor (BREACH-DOCTOR-1, docs/breach-doctor/FAMILY-METRIC.md) and the registrants own the
--      mapping, and fm-breach-unmapped keeps failing until they do. The guard now says what the detector says.
--   3. The owner map of agent_issues 2192 (issue_triage.remediation, which its producer does not rewrite) gets one WRITER line. 2192 stays open: each writer closes its own row.
-- No metric is registered here, so no trigger is added; breaches_unmapped has no analytics_metric_triggers row on purpose (METRIC-CLOSED-LOOP-1 exemption, breach-one-meaning-2: fm-breach-unmapped is its detector).
-- PREDICTION: after apply breaches_unmapped reads 6 and carries the apply time; the 20:00Z or 21:00Z metric-refresh run keeps last_refreshed within 60 minutes of now, and it changes value with v_breach_by_cause when the
--   doctor maps a breach. Falsifier: last_refreshed older than 70 minutes at a later read, or a value that differs from SUM(breaches) of the view.
-- spof-review: none added. No DELETE or DROP runs in this file; the one backup table holds the workflow as it was.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_bu1_workflow
-- Rollback: UPDATE fleet_tasks SET definition = json_remove(definition, '$.steps[' || (SELECT j.key FROM json_each(fleet_tasks.definition, '$.steps') j WHERE json_extract(j.value, '$.name') = 'breaches-unmapped') || ']'), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = 'metric-refresh' AND instr(definition, '"breaches-unmapped"') > 0; UPDATE issue_triage SET remediation = substr(remediation, 1, instr(remediation, char(10) || 'WRITER 2026-10-26 (rem-a2') - 1) WHERE issue_id = 2192 AND instr(COALESCE(remediation, ''), char(10) || 'WRITER 2026-10-26 (rem-a2') > 0;

-- 0. Backup for the Rollback.
CREATE TABLE IF NOT EXISTS bak_20261026_bu1_workflow AS SELECT id, definition, version FROM fleet_tasks WHERE id = 'metric-refresh';

-- 1. The writer, appended once, and the same statement now.
UPDATE fleet_tasks
SET definition = json_insert(definition, '$.steps[#]', json('{"type":"sql","db":"AUDIT","name":"breaches-unmapped","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COALESCE(SUM(breaches), 0) FROM v_breach_by_cause WHERE cause_key = ''unmapped'') AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''breaches_unmapped''"}')),
    version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'metric-refresh' AND instr(definition, '"breaches-unmapped"') = 0;

UPDATE metric_registry SET last_value = CAST((SELECT COALESCE(SUM(breaches), 0) FROM v_breach_by_cause WHERE cause_key = 'unmapped') AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'breaches_unmapped';

-- 2. Issue 2192: the owner map is on the triage row (remediation), which the producer of the issue does not rewrite.
UPDATE issue_triage
SET remediation = COALESCE(remediation, '') || char(10) || 'WRITER 2026-10-26 (rem-a2, BREACHES-UNMAPPED-REFRESH-1): the row breaches_unmapped (qnfo-fleet-control, declared hourly) had no writer at all: BREACH-ONE-MEANING-1 registered it and two migrations wrote its value once (last 2026-10-26T09:12:52Z), no fleet_tasks step, trigger or worker code refreshed it, so the stored 0 hid the 6 unmapped breaches that v_breach_by_cause read at 19:30Z (drift_total, cf_obs_reopen_churn_24h, records_past_retention, pii_in_logs, agent_tool_calls_outside_allowlist, metrics_worsening_7d). The metric-refresh step breaches-unmapped now writes it every hour. The six breaches still need a metric_breach_cause row each from the breach doctor or the registrant; fm-breach-unmapped reads the same number and fails until they do. pr_open_over_10m is written by the trigger pr_merge_sla_heavy_tick on every fleet_tick_heavy insert, so its refresh follows the heavy tick (18:11:02Z and 19:01:23Z), not the declared */10; that is a cadence declaration to correct by its owner, not a missing writer.'
WHERE issue_id = 2192 AND instr(COALESCE(remediation, ''), 'WRITER 2026-10-26 (rem-a2') = 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2192 AND status = 'open');

-- 3. The decision, append-only.
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a2 (remediation session 2026-10-26)',
  'a guard metric that declares an hourly refresh must have a writer, and its stored value must say what its own detector says',
  'BREACHES-UNMAPPED-REFRESH-1: step breaches-unmapped appended to fleet_tasks metric-refresh (hourly write of breaches_unmapped from v_breach_by_cause), one WRITER line on the triage row of agent_issues 2192',
  'read 2026-10-26 19:30Z from live qnfo-audit: breaches_unmapped stored 0 since 09:12:52Z, no writer in fleet_tasks, triggers or qnfo-fleet-control/worker.js, v_breach_by_cause cause unmapped 6 breaches, fm-breach-unmapped failing at 6',
  'applied through the canonical path on merge: breaches_unmapped carries the view count and the apply time',
  'one appended workflow step, one metric_registry row updated (value, last_refreshed, state), one triage remediation text, one backup table, no trigger, worker, secret, cap or guard threshold changed',
  'the Rollback header of migrations/2026-10-26-breaches-unmapped-refresh-1.sql removes the step by name and strips the WRITER line; the stored value is left as last measured, which is true',
  'guard-metric-has-a-writer',
  'at the next metric-refresh run after apply, breaches_unmapped equals SUM(breaches) of v_breach_by_cause where cause_key is unmapped and its last_refreshed is within 70 minutes of now',
  NULL,
  'node:sqlite replay (migrations/breaches-unmapped-refresh-1.test.mjs) with the stored step run on fixtures of zero, six and a changed count, a replay, the Rollback line; apply_migrations.py --check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor LIKE 'rem-a2%' AND instr(action, 'BREACHES-UNMAPPED-REFRESH-1') > 0);
