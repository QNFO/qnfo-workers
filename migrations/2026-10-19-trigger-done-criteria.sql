-- TRIGGER-DONE-CRITERIA-1 (2026-10-19, pillar autonomy; owner directive 2026-10-14 SLA-120M-1/-2 "no SLA shall ever exceed 120 minutes";
-- REMEDIATION-2X-1; agent_issues 99914, 99935, 99944 are the open breach tickets of the three triggers).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET action = (SELECT b.action FROM bak_20261019_trigger_done b WHERE b.id = analytics_metric_triggers.id), notes = (SELECT b.notes FROM bak_20261019_trigger_done b WHERE b.id = analytics_metric_triggers.id) WHERE id IN (SELECT id FROM bak_20261019_trigger_done)
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 15:30-15:50Z, SELECT only)
-- Three triggers judge one number and tell the doer to stop at another. v_metric_trigger_state judges the threshold column; the action text, which
-- is what a doer reads as the lever and the definition of done, kept the number from before the threshold moved:
--   410  issue_mttr_h_30d  threshold 2 (SLA-120M-2 2026-10-14 moved it from 48.0 h, see its notes); the action still opens "Median time to close
--        (30d) is above 48h". The median read 13.0 h on 2026-10-19 (2140 closes in 30 days), which is under 48 h, so a doer who trusts the prose
--        finds nothing to do while the trigger is in breach.
--   3464 mttr_h_7d         threshold 2 (SLA-120M-2 moved it from 24.0 h); the action ends "Done = mttr_h_7d <= 24 at two refreshes". The mean read
--        78.6 h; a doer who reaches 24 stops with the trigger still firing, and the ticket cannot close.
--   5708 issue_drain_ratio_24h threshold 1.5 (REMEDIATION-2X-1; owner directive 2026-10-13: at a minimum of 1.5x accumulation); the action ends
--        "Done: issue_drain_ratio_24h >= 1 at two refreshes". The ratio read 1.25 (564 dispositioned / 450 opened or reopened), which already
--        satisfies ">= 1", so the stated definition of done is met while the trigger fires.
-- The other ten triggers of the same sweep were read and state a done that matches their threshold.
--
-- WHAT THIS CHANGES: three exact-text replaces on analytics_metric_triggers.action, each guarded by the old text (so a later edit of the row is
-- never overwritten and a second apply writes nothing), a note appended to the row, the three rows saved first in bak_20261019_trigger_done,
-- and one decision_log row. No threshold, operator or cooldown moves, no metric is redefined, no issue is closed. The target stays what the owner
-- set; only the prose that disagreed with it is corrected. evaluateMetricTriggers copies at most 300 characters of the prose into a ticket
-- when it inserts one, and the open tickets keep the text they were filed with (they already show the threshold in their first line).

CREATE TABLE IF NOT EXISTS bak_20261019_trigger_done AS SELECT id, metric_key, action, notes FROM analytics_metric_triggers WHERE id IN (410, 3464, 5708);

UPDATE analytics_metric_triggers SET
  action = replace(action, 'Median time to close (30d) is above 48h.', 'Median time to close (30d) is above 2 h (SLA-120M-2, 2026-10-14: the trigger threshold is 120 minutes, it was 48 h).'),
  notes = COALESCE(notes, '') || ' | TRIGGER-DONE-CRITERIA-1 2026-10-19: action text states the 2 h threshold the trigger judges, not the 48 h it had before SLA-120M-2'
WHERE id = 410 AND metric_key = 'issue_mttr_h_30d' AND instr(action, 'Median time to close (30d) is above 48h.') > 0;

UPDATE analytics_metric_triggers SET
  action = replace(action, 'Done = mttr_h_7d <= 24 at two refreshes.', 'Done = mttr_h_7d <= 2 (SLA-120M-2, 2026-10-14: the trigger threshold is 2 h, it was 24 h) at two refreshes.'),
  notes = COALESCE(notes, '') || ' | TRIGGER-DONE-CRITERIA-1 2026-10-19: definition of done states the 2 h threshold the trigger judges, not the 24 h it had before SLA-120M-2'
WHERE id = 3464 AND metric_key = 'mttr_h_7d' AND instr(action, 'Done = mttr_h_7d <= 24 at two refreshes.') > 0;

UPDATE analytics_metric_triggers SET
  action = replace(action, 'Done: issue_drain_ratio_24h >= 1 at two refreshes.', 'Done: issue_drain_ratio_24h >= 1.5 (the trigger threshold, REMEDIATION-2X-1: issues resolved at 1.5x their accumulation) at two refreshes.'),
  notes = COALESCE(notes, '') || ' | TRIGGER-DONE-CRITERIA-1 2026-10-19: definition of done states the 1.5 threshold the trigger judges, not 1'
WHERE id = 5708 AND metric_key = 'issue_drain_ratio_24h' AND instr(action, 'Done: issue_drain_ratio_24h >= 1 at two refreshes.') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a definition of done that differs from the threshold the trigger judges lets a doer stop while the breach stands, so the prose follows the threshold the owner set',
  'TRIGGER-DONE-CRITERIA-1: the action text of triggers 410, 3464 and 5708 states the threshold the trigger judges (2 h, 2 h, 1.5)',
  'measured 2026-10-19 15:40Z: 410 median 13.0 h vs prose "above 48h" and threshold 2; 3464 mean 78.6 h vs "Done <= 24" and threshold 2; 5708 ratio 1.25 (564 / 450) vs "Done >= 1" and threshold 1.5',
  'migration merged', 'three analytics_metric_triggers rows (action and notes text only); thresholds, operators and the metric formulas are unchanged', 'the Rollback header restores action and notes from bak_20261019_trigger_done',
  'a doer reads the definition of done the trigger enforces',
  'issue_drain_ratio_24h >= 1.2 within 24 h',
  'none', 'analytics_metric_triggers, v_metric_trigger_state'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'TRIGGER-DONE-CRITERIA-1:') = 1);
