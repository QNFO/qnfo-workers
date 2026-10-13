-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM decision_outcomes WHERE actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND decision_id IN (103, 196, 198, 208, 210) AND ts >= '2026-10-13T07:00:00Z'
-- DECISION-OUTCOMES-20261013 (pillar autonomy, metric prediction_miss_rate_7d, doctrine section 15 prediction calibration).
-- Outcomes of this session's own decisions whose predictions can be judged from live reads at 2026-10-13 07:12 UTC. Misses
-- are recorded as misses: calibration is the point, not the rate.
--   198 RESEARCH-BACKPRESSURE-1: within 40 minutes research_queued_180m 0 and stuck_items_over_sla under 10. v_stuck_summary
--       06:40 UTC: research_queued_180m 0, stuck_items_over_sla 0. Matched.
--   208 PROBE-LIKE-LIMIT-1: no open issue contract reads probe-error within 2 hours of the merge. 07:12 UTC: 0. Matched.
--   210 EMAIL-PENDING-VIEW-OVERCOUNT-1: issue 2336 closes within an hour and 984 stays in the view. 2336 closed 06:5x UTC; the
--       view returns 984. Matched.
--   196 FAILURE-MODE-DETECTOR-OWN-1: failure_modes_recurring from 14 to at most 4 within 2 hours. It read 9 at 07:01 UTC (four of
--       the nine were added by another session after the prediction, and two are time-gated). Missed.
--   103 COMPAT-ADVANCE-WAVE-1: workers_compat_date_behind 0 after wave 2. It read 3 at 07:01 UTC (qnfo-ops cannot verify its
--       own health, agent_issues 2411; qnfo-containers-pilot declared the old date; idea-hub waited for its next deploy). Missed.
INSERT INTO decision_outcomes (decision_id, ts, observed_outcome, matched, evidence, actor) VALUES
  (198, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'research_queued_180m 0 and stuck_items_over_sla 0 within 40 minutes of the deploy', 1, 'v_stuck_summary and metric_registry read 2026-10-13 06:40 UTC', 'session_01Kddqwk5gQT5qSSHVKjT2EA'),
  (208, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'no open issue contract reads probe-error', 1, 'remediation_contracts joined to open agent_issues, last_verdict probe-error: 0 at 07:12 UTC', 'session_01Kddqwk5gQT5qSSHVKjT2EA'),
  (210, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'issue 2336 closed on its contract; email 984 still listed', 1, 'agent_issues 2336 status closed; v_email_human_pending_v2 returns 984 alone', 'session_01Kddqwk5gQT5qSSHVKjT2EA'),
  (196, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'failure_modes_recurring 9, not 4 or fewer', 0, 'metric_registry failure_modes_recurring 9 at 2026-10-13T07:01Z; v_failure_mode_status lists four companion modes added later by another session, two time-gated detectors and two-closers-disagree', 'session_01Kddqwk5gQT5qSSHVKjT2EA'),
  (103, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'workers_compat_date_behind 3 after wave 2, not 0', 0, 'worker_compat_state 2026-10-13T02:02Z: idea-hub, qnfo-containers-pilot, qnfo-ops behind; qnfo-ops deploy note compat_not_advanced (agent_issues 2411)', 'session_01Kddqwk5gQT5qSSHVKjT2EA');
