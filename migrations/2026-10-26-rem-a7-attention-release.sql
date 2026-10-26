-- ATTENTION-STOP-RELEASE-1 decision record (2026-10-26, charter pillar reach; agent_issues 100190, with INTEG-GSC-1, agent_issues 2924, in the same qnfo-fleet-dashboard 1.72.0 change). The attention loop's verdict rule changes: a social channel that is
-- STOP is judged again by the normal rules as soon as it has a referred visit or a utm human click, instead of being held at share 0 until its re-test date. This is a decision rule the fleet's own loop takes, so it gets its
-- decision_log row with the measurement that justified it and a prediction the next scorecards grade (doctrine: every autonomous decision, with predicted_outcome). No data is changed here: the verdicts, shares and
-- thresholds are written by the dashboard's daily scorecard, never by hand.
--   Before (read 2026-10-26, qnfo-audit): ops_config attention_channel_share bluesky 0 (STOP since 2026-10-06, re-test 2026-11-03), mastodon 0 (STOP); v_channel_impact_7d bluesky 8 posts, 496 human clicks, 62 per post; every other
--   channel 1.9 to 5.2; guard metric attention_channels_stopped 2. qnfo-social caps Bluesky at floor(21 x (0.5 + 0.5 x share)): 10 a week at share 0.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: decision_log is append-only; revert qnfo-fleet-dashboard 1.72.0 (git revert of the atVerdict condition) to restore the sticky STOP.'

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f1:attention-stop-release',
  'the STOP rule says a channel is stopped only with no referred visit, so holding a stopped channel after it earned visits contradicts the rule; a channel with utm human clicks is judged again by the same numbers that would have stopped or kept it',
  'qnfo-fleet-dashboard 1.72.0 atVerdict: if (pv === "STOP" && visits <= 0) (was if (pv === "STOP")); visits is the larger of referred visits and utm human clicks',
  'qnfo-audit 2026-10-26: attention_channel_share {bluesky 0, mastodon 0, linkedin 0.5, x 0.5} written 02:00Z; v_channel_impact_7d bluesky 8 posts / 496 human clicks / 62 per post, mastodon 6 / 31 / 5.17, linkedin 5 / 13, x 9 / 17, substack 37 / 138; PR 3023 and PR 3352 (issue 100346) forwarded clicks_human but left the sticky branch; qnfo-fleet-dashboard/attention.test.mjs 63 checks including the scorecard run end to end',
  'pending: the next daily scorecard after the deploy (02:00Z)',
  'qnfo-fleet-dashboard atVerdict only: a channel that is STOP and has visits or utm human clicks is judged by the normal rules (IMPROVE at 0.5 or better); a STOP with none stays stopped; thresholds, re-test rules and the share map are unchanged; qnfo-social reads the share with its existing floor (0.5) and cap',
  'git revert of the atVerdict condition restores the sticky STOP; a stopped channel then waits for its re-test date as before',
  'a stopped channel with measured human visits is not held at zero',
  'the first scorecard after the deploy writes bluesky >= 0.5 and mastodon >= 0.5 (verdict IMPROVE, per item under 0.34 with clicks); attention_channels_stopped reads 0; qnfo-social Bluesky weekly cap rises from 10 to 15; contract issue-100190 passes and closes; if Bluesky human clicks per post fall below the other channels the verdict is judged on its numbers the next day',
  'Bluesky is the channel with the most human clicks; its share was 0 for 20 days',
  'qnfo-fleet-dashboard/attention.test.mjs; migrations/rem-a7-attention-release.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'rem-a7-f1:attention-stop-release');
