-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control = 'companion-starved-retry-cap'; DELETE FROM decision_log WHERE instr(action, 'STARVED-RETRY-HOURLY-1:') = 1
-- STARVED-RETRY-HOURLY-1 (2026-10-13, pillar personal; DOCTRINE-1 control_registry and decision_log). personal-companion 1.21.7 (same pull
-- request) lets the starved retry run every hourly tick: the bar was 16 failed runs in 24 h, reached by the 16:00 UTC run, so the 17:00
-- tick logged only a stall alert and nothing would have run before the 20:00 generation hour, though 1.21.6 had gone live at 16:14.
INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('companion-starved-retry-cap', 'personal-companion/worker.js starvedRetryDue STARVED_RETRY_MAX_24H', 'cap',
  'a runaway loop of failing generation runs between the generation hours', 1, 'demote', 'applied',
  'the generation hours (04, 08, 12, 16, 20 UTC) run whatever the cap reads; the 40-minute bar keeps one retry per tick',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'companion_runs 5583 (2026-10-13 17:01:38 UTC): stall alert only; 16 failed runs in the 24 h to 16:05 UTC (first 2026-10-12 20:11 UTC) reached the old bar of 16. Demoted to 24 (one per hourly tick); spend is steered by model choice at a breached cap (BUDGET-SOFT-ROUTE-1), never by skipping a run',
  2222, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a retry cap that stops a critical stalled pipeline for hours after a fix has shipped is a hold, not backpressure; one retry per tick is the rate',
  'STARVED-RETRY-HOURLY-1: personal-companion 1.21.7 raises the starved-retry bar from 16 to 24 failed runs in 24 h (one per hourly tick)',
  'companion_runs 5583 (17:01 UTC stall alert, no run); 16 failed runs since 2026-10-12 20:11 UTC; 1.21.6 live at 16:14 UTC with no run on it',
  'merged through the canonical path', 'the companion hourly retry', 'revert of personal-companion 1.21.7',
  'fixes reach a run within the hour they ship', 'the 18:00 and 19:00 UTC ticks each start a companion generation run on 1.21.6 or later (companion_runs shows a schema ok row within 5 minutes of each tick)', 'reading.q08.org publishes again sooner',
  'd1:companion_runs; code:personal-companion starvedRetryDue'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'STARVED-RETRY-HOURLY-1:') = 1);
