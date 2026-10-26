-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_persona_close_view
-- Rollback: DROP VIEW IF EXISTS v_persona_recovered_close; -- then re-run its CREATE VIEW from migrations/2026-10-26-management-personas-2.sql (the old definition is also in bak_20261026_persona_close_view.sql)
-- TRIGGER-FLAP-1 (2026-10-26, charter pillar: autonomy; agent_issues 1000459; session-old-issues-6d-2038).
-- Measured 2026-10-26 on qnfo-audit: 167 'reopened' events on 44 METRIC-TRIGGER tickets in 7 days, 135 close-then-reopen pairs, 48 of them within 2 h of the close and 84 within 6 h.
-- The closer of the tickets that were reopened (issue_triage.close_evidence): TRIGGER-RECOVERY-1 on 26, MANAGEMENT-PERSONAS-2 on 14. The three worst flappers were closed by
-- MANAGEMENT-PERSONAS-2: 2972 portfolio_drift (25 reopens), 99921 tracker_drift (17), 100088 breaches_without_ticket (18).
-- WHY: view v_persona_recovered_close (migrations/2026-10-26-management-personas-2.sql) closes a METRIC-TRIGGER ticket when the trigger reads 'not hit' ONCE: v.hit = 0 on a metric
-- refreshed in the last 120 minutes. TRIGGER-RECOVERY-1 in qnfo-fleet-control asks for more: the metric must stay on the right side of its threshold for TRIGGER_RECOVERY_MIN = 60
-- minutes (a 'recovering' streak in analytics_action_log that a hit ends with a 'relapsed' row). For a metric that sits at a 0 or 1 threshold and moves with the hourly
-- producers (trigger 8581: 22 recovering streaks and 22 relapses in 3 days; 8559: 12 and 11), one clear reading is common, so the persona tick closed the ticket and the
-- breach-ticket reopener opened it again at the next breach reading: close, reopen, close.
-- WHAT: the view now also requires the TRIGGER-RECOVERY-1 streak: a 'recovering' row of the trigger newer than its last non-recovering ledger row (a hit, a dispatch or a relapse)
-- and at least 60 minutes old. Columns, the evidence prefix, the 2-hour ticket age, the 120-minute metric freshness, the failing-contract guard and the persona_actions switch are
-- unchanged. A ticket TRIGGER-RECOVERY-1 would close at the same 60-minute mark is simply closed there.
-- NOT CHANGED, and why: TRIGGER-RECOVERY-1 itself (qnfo-fleet-control, which the code loop holds) and the breach-ticket reopener. A real relapse after more than an hour of clean readings
-- (spof_alternates_untested_24h, trigger 5182, 21 reopens) is a true recurrence; its producer is owned by the ROOT-CAUSE-1 issues 1000306 to 1000309.
-- Prediction: the pairs that reopen within 2 h of the close (48 of 135 in the last 7 days) fall to near zero; the definition of done of 1000459 is 70 pairs or fewer in 7 days.
-- Revert: the Rollback line.
CREATE TABLE IF NOT EXISTS bak_20261026_persona_close_view AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_persona_recovered_close';

DROP VIEW IF EXISTS v_persona_recovered_close;

CREATE VIEW v_persona_recovered_close AS
SELECT a.id AS issue_id, m.program_code, t.metric_key,
  'MANAGEMENT-PERSONAS-2 metric recovered: ' || t.metric_key || ' reads ' || v.val || ' (trigger ' || t.operator || ' ' || t.threshold
    || ' not hit), refreshed ' || r.last_refreshed || ', clear since '
    || (SELECT MIN(l.fired_at) FROM analytics_action_log l WHERE l.trigger_id = t.id AND l.status = 'recovering'
          AND l.id > COALESCE((SELECT MAX(x.id) FROM analytics_action_log x WHERE x.trigger_id = t.id AND x.status NOT IN ('recovering', 'recovered')), 0))
    || ' (60 minutes or more, TRIGGER-FLAP-1); the trigger re-files and reopens this issue if the metric breaches again' AS evidence
FROM agent_issues a
JOIN analytics_metric_triggers t ON t.id = CAST(substr(a.title, 16, instr(substr(a.title, 16), '-') - 1) AS INTEGER)
JOIN v_metric_trigger_state v ON v.id = t.id
JOIN metric_registry r ON r.metric = t.metric_key
LEFT JOIN issue_project_map m ON m.issue_id = a.id
WHERE a.status = 'open' AND a.title LIKE 'METRIC-TRIGGER-%'
  AND v.hit = 0 AND v.val IS NOT NULL
  AND replace(substr(COALESCE(r.last_refreshed, ''), 1, 19), 'T', ' ') >= datetime('now', '-120 minutes')
  AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
  AND EXISTS (SELECT 1 FROM analytics_action_log l
               WHERE l.trigger_id = t.id AND l.status = 'recovering'
                 AND l.id > COALESCE((SELECT MAX(x.id) FROM analytics_action_log x WHERE x.trigger_id = t.id AND x.status NOT IN ('recovering', 'recovered')), 0)
                 AND l.fired_at <= datetime('now', '-60 minutes'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding')
    AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'persona_actions'), 'on') <> 'off';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-old-issues-6d-2038',
  'a metric trigger ticket should close only on the same evidence TRIGGER-RECOVERY-1 asks for, a clean streak, or a metric that moves hourly is closed and reopened in a loop',
  'TRIGGER-FLAP-1: v_persona_recovered_close requires the TRIGGER-RECOVERY-1 recovering streak of 60 minutes (no single-reading close)',
  'qnfo-audit 2026-10-26 read-only: 167 reopens on 44 METRIC-TRIGGER tickets in 7 days, 135 close-then-reopen pairs (48 within 2 h, 36 in 2-6 h, 29 in 6-24 h, 22 later); closers of the reopened tickets: TRIGGER-RECOVERY-1 26, MANAGEMENT-PERSONAS-2 14; analytics_action_log trigger 8581 22 recovering and 22 relapsed in 3 days',
  'migration merged',
  'the view v_persona_recovered_close only (read by the management-personas tick); the old definition is kept in bak_20261026_persona_close_view',
  'the Rollback header of migrations/2026-10-26-persona-close-clean-streak.sql',
  'a metric-trigger ticket is closed by the persona tick only after the same 60-minute clean streak as by TRIGGER-RECOVERY-1',
  'close-then-reopen pairs on METRIC-TRIGGER tickets over 7 days fall from 135 to 70 or fewer; reopens within 2 h of the close fall to near zero',
  'none',
  'd1:qnfo-audit read-only, node:sqlite replay in migrations/persona-close-clean-streak.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'TRIGGER-FLAP-1:%');
