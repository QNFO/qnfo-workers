-- CONNECTION-LEDGER-1 step 3 + CONNECTION-ENGAGEMENT-1 (2026-10-04, pillar: personal; agent_issues #1951, #1953).
-- Registers two personal-plane metrics and their triggers. Applied live to qnfo-audit after the PR merged; idempotent
-- (INSERT OR IGNORE, safe to re-run). Both values are written by personal-companion 1.10.0 in its hourly tick
-- (refreshConnectionMetrics): ledger_people_seen_twice reads personal-life, which a qnfo-audit refresh query cannot reach, and
-- owner_question_answer_rate_14d needs a per-row join, so refresh_class is 'worker-written', not 'computed'.
--
-- ROLLBACK (data only, nothing else depends on these rows):
--   DELETE FROM analytics_metric_triggers WHERE metric_key IN ('ledger_people_seen_twice','owner_question_answer_rate_14d');
--   DELETE FROM metric_registry WHERE metric IN ('ledger_people_seen_twice','owner_question_answer_rate_14d');
--
-- Named exemption (core rule 5): ledger_people_seen_twice has a trend target (up), not a threshold, and the Ledger is empty until
-- CONNECTION-LEDGER-1 step 1 (personal-api) is live, so an enabled threshold trigger would file an issue about a pipeline that
-- does not exist yet. Its trigger row exists with enabled = 0 (lt 1) so that turning it on is one UPDATE, not a design task.
-- owner_question_answer_rate_14d reads 'n/a' (unreadable, never 0) while fewer than 6 questions were sent in 14 days, so a quiet
-- fortnight cannot breach.

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('ledger_people_seen_twice', 'external', 'lagging',
  'SELECT seen_twice FROM v_ledger_seen_twice (personal-life): Ledger people with at least two in_person interactions',
  'personal-life.v_ledger_seen_twice', '0', 'up (rising)', 'personal-companion',
  'personal-companion follow-up questions (queueLedgerFollowUp) -> owner meets the person again', 'hourly', 'flat for 30 days', 'n/a', 'MEASURED', 'worker-written'),
 ('owner_question_answer_rate_14d', 'operational', 'leading',
  'answered / sent over qnfo-audit.owner_questions of kind after-event and triage sent in the last 14 days; answered = a calendar_feedback row with cal_id = the question ref within 48h of sent_at; n/a under 6 sent',
  'qnfo-audit.owner_questions + calendar_feedback', 'n/a', '>= 0.3', 'personal-companion',
  'personal-companion deliverOwnerPrompts (one question a day, shorter bodies), then web push from the personal-api PWA', 'hourly', '< 0.3 with >= 6 sent', '< 0.1 with >= 6 sent', 'MEASURED', 'worker-written');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES
 ('owner_question_answer_rate_14d', 'Personal gap: under 30% of owner questions get answered', 'registry', 'lt', 0.3, 5,
  'Pillar personal. Fewer than 30% of the after-event and triage questions mailed to the owner in the last 14 days were answered within 48h (at least 6 sent). Lever: ask one question a day and shorten the bodies, then evaluate web push from the personal-api PWA. In personal-companion/worker.js set PROMPT_DAILY_CAP to 1; if the rate does not recover in 7 days, shorten the producer bodies in calendar-api and open the push evaluation as its own issue. Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence.' || char(10) || 'code-task: repo=qnfo-workers path=personal-companion/worker.js' || char(10) || 'code-anchor: var PROMPT_DAILY_CAP = 2;',
  'personal-companion', 'agent_issues', 168, 1, 'CONNECTION-ENGAGEMENT-1 2026-10-04'),
 ('ledger_people_seen_twice', 'Personal gap: no Ledger person has been met twice', 'registry', 'lt', 1, 4,
  'Pillar personal. No Ledger person has two in_person interactions. Check that CONNECTION-LEDGER-1 step 1 feeds the Ledger (personal-api daily cron) and that follow-up questions (kind follow-up in owner_questions) are being sent. Definition of done: the metric is at least 1 in metric_registry; record the before and after values in issue_triage.close_evidence.',
  'personal-companion', 'agent_issues', 336, 0, 'CONNECTION-LEDGER-1 2026-10-04; disabled until the Ledger is fed (see header exemption)');
