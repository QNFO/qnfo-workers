-- CADENCE-SLA-CF-CHANGELOG-1 (2026-10-19, charter pillar autonomy; METRIC-TRIGGER-6050 cadence_overdue_over_120m, SLA-120M-7; a window error in cadence_sla)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE cadence_sla SET interval_min = 120, schedule = 'CF-CHANGELOG-LOOP-1 runs once a day inside the hourly tick', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE surface = 'cf-changelog'
-- Rollback scope: one cadence_sla row; the decision_log row stays (append-only).
-- spof-review: none added.
--
-- MEASURED (qnfo-audit, 2026-10-19 15:30Z, SELECT only). v_cadence_overdue reads three producers past 120 minutes: reading.q08.org (personal-companion, 450 min over,
-- last piece 04:06Z), q08.org (q08-signal-engine, 1037 min over, last piece 2026-10-18T20:12Z) and cf-changelog (qnfo-fleet-control, 1109 min over, last run 2026-10-18T19:01Z).
-- The first two are real: the writers run every slot and the quality gates reject the drafts (q08.org /api/runs: gate_failed on 2026-10-19 14:05Z and 15:12Z, 7 day gate
-- pass rate 0.059; reading.q08.org /health: accuracy passed 7, retracted 74); the levers are agent_issues 2606 and 100064 and the Q08-YIELD-1 handoff patch, not this file.
-- cf-changelog is a window error. cadence_sla says interval_min 120, but CF-CHANGELOG-LOOP-1 is a daily loop by design: qnfo-fleet-control worker.js CFC_STALE_H = 20
-- (cfcNeedsRun runs it when the last ok run is 20 h old, from the hourly tick) and cf_changelog_runs shows exactly that: runs at 2026-10-15T10:00, 10-16T06:00, 10-17T03:00,
-- 10-17T23:00 and 10-18T19:01 (gaps of 20 to 21 h). v_cadence_overdue due = last run + interval_min, so a loop that is on time reads 1000 minutes late for 18 hours a day.
-- CLAUDE.md (QUEUE-SLA-1): "A freshness check on a loop slower than 120 minutes allows its cadence plus at most 120 minutes". The cadence is 20 h plus the hourly tick, 1260 minutes;
-- sla_min stays 120, so the producer breaches 120 minutes after its own due time (2026-10-19T16:01Z for the next run) and not before. No threshold moves and the other
-- producers keep their rows; a stalled loop is still caught, 22 h after its last run instead of 2 h.
--
-- WHAT THIS FILE DOES: one UPDATE (the interval and the schedule text), and one decision_log row.

UPDATE cadence_sla
   SET interval_min = 1260,
       schedule = 'CF-CHANGELOG-LOOP-1 runs when the last ok run is 20 hours old (CFC_STALE_H in qnfo-fleet-control) from the hourly tick: interval 1260 minutes (20 h plus one tick); sla_min 120 applies after that due time',
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE surface = 'cf-changelog' AND interval_min = 120;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a cadence SLA row states the producer''s own cadence plus the 120 minute allowance (QUEUE-SLA-1), so a daily loop is measured against its daily due time',
  'CADENCE-SLA-CF-CHANGELOG-1: cadence_sla.interval_min for cf-changelog 120 -> 1260 (CFC_STALE_H 20 h plus the hourly tick); sla_min stays 120',
  'qnfo-audit 2026-10-19 15:30Z: cf_changelog_runs gaps 20 to 21 h on five consecutive runs; qnfo-fleet-control worker.js CFC_STALE_H = 20 and cfcNeedsRun; v_cadence_overdue due_at 2026-10-18T21:01Z for a loop whose next run is due 2026-10-19T15:01Z',
  'migration merged', 'one cadence_sla row; cadence_overdue_over_120m falls from 3 to 2 (reading.q08.org and q08.org stay, they are real); sla_breaches_over_120m falls by 1',
  'the Rollback header restores interval_min 120 and the schedule text',
  'a daily producer is not reported as 18 hours late for being on time',
  'cadence_overdue_over_120m <= 2 within 1 h',
  'none',
  'd1:qnfo-audit v_cadence_overdue (SELECT only); offline node:sqlite suite migrations/detector-measurement-repairs.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CADENCE-SLA-CF-CHANGELOG-1:') = 1);
