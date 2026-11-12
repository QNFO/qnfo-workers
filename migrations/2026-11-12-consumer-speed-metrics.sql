-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key IN ('consumer_run_median_min_24h','consumer_run_cap_cancellations_24h'); DELETE FROM metric_breach_cause WHERE metric_key IN ('consumer_run_median_min_24h','consumer_run_cap_cancellations_24h'); DELETE FROM metric_registry WHERE metric IN ('consumer_run_median_min_24h','consumer_run_cap_cancellations_24h');
-- spof-review: the producer is a step of the audits job in remediation-consumer.yml (scripts/consumer_speed_metric.py, never fails the job); if it stops, last_refreshed ages and the existing freshness checks on metric_registry report it. No new cron, trigger, host or credential.
-- CAUSE-MAPPED: both metrics map to the existing cause key `code-loop` in metric_breach_cause in this same file.
--
-- CONSUMER-SPEED-METRIC-1 (charter pillar autonomy; follow-up of CONSUMER-SPEED-1): the speed of remediation-consumer.yml becomes a registered metric with a trigger, so the 26-32 minute runs and
-- 30-minute cap cancellations of 2026-11-04 file an issue by themselves. Baseline after PRs 7261-7295 (run 41931950888): 6.8 minutes wall-clock, no cap cancellation. Prediction: median stays under 7.5,
-- cancellations stay 0; a regression above 12 minutes or any cancellation at a cap files an issue within one cycle. The seed values are that baseline; the producer rewrites both every cycle.
INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class)
VALUES
  ('consumer_run_median_min_24h', 'operational', 'target',
   'median wall-clock minutes (first job start to last job end) of the schedule and push runs of remediation-consumer.yml of the last 24 hours whose consume job finished and that did not start the heavy job; workflow_dispatch runs excluded; at most 12 runs read',
   'GitHub Actions runs and jobs of remediation-consumer.yml via scripts/consumer_speed_metric.py (audits job); scripts/consumer-run-timing.mjs is the manual form',
   '26-32 on 2026-11-04, 6.8 after CONSUMER-SPEED-1', '< 12', 'qnfo-fleet-control',
   'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach', 'hourly', '> 10', '> 20', '6.8', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'runner'),
  ('consumer_run_cap_cancellations_24h', 'operational', 'guard',
   'jobs of the same runs that were cancelled after running to within a minute of their cap (consume, sweeps, audits, views 25 minutes; heavy 50); a job cancelled early by a newer run is not counted',
   'GitHub Actions runs and jobs of remediation-consumer.yml via scripts/consumer_speed_metric.py (audits job)',
   '3 on 2026-11-04, 0 after CONSUMER-SPEED-1', '0', 'qnfo-fleet-control',
   'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach', 'hourly', '> 0', '> 2', '0', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'runner');

INSERT OR REPLACE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
  ('consumer_run_median_min_24h', 'code-loop', 'CONSUMER-SPEED-METRIC-1: the consumer workflow got slower'),
  ('consumer_run_cap_cancellations_24h', 'code-loop', 'CONSUMER-SPEED-METRIC-1: a consumer job ran into its cap');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES
  ('consumer_run_median_min_24h', 'The remediation consumer run is slower than 12 minutes', 'metric_registry', 'gt', 12, 3,
   'Pillar autonomy (CONSUMER-SPEED-1). A contract that becomes due mid-run waits for the next run, so a slow run delays every issue close. Read where the time went: node scripts/consumer-run-timing.mjs --hours 24 (per-job medians) and the step timings of the newest run (gh run view). The job that set the length gets split, or its slowest step moves to the heavy job (scripts/consumer-speed.test.mjs pins the layout).
code-task: repo=qnfo-workers path=.github/workflows/remediation-consumer.yml
code-anchor: - name: Plan every qnfo-audit view',
   'qnfo-fleet-control', 'agent_issues', 2, 1, 'CONSUMER-SPEED-METRIC-1: judged by v_metric_trigger_state; closes when the median is back under 12.'),
  ('consumer_run_cap_cancellations_24h', 'A remediation consumer job was cancelled at its time cap', 'metric_registry', 'gt', 0, 3,
   'Pillar autonomy (CONSUMER-SPEED-1). A job that runs to its cap is killed with its work undone (the 26-32 minute consume runs of 2026-11-04). Find the job and step: node scripts/consumer-run-timing.mjs --hours 24 lists the timeouts with run ids; fix the step that hangs or move it to the heavy job. Never raise a cap to make it pass.
code-task: repo=qnfo-workers path=.github/workflows/remediation-consumer.yml
code-anchor: - name: Plan every qnfo-audit view',
   'qnfo-fleet-control', 'agent_issues', 2, 1, 'CONSUMER-SPEED-METRIC-1: judged by v_metric_trigger_state; closes when no job is cancelled at its cap.');
