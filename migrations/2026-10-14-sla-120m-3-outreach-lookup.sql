-- SLA-120M-3 (2026-10-14, pillar reach), with qnfo-cloud-ops 1.29.0 OUTREACH-LOOKUP-120M-1 in the same pull request. Owner directive:
-- no SLA exceeds 120 minutes and action starts at once past 120 minutes on the failure mode and its root cause.
-- Root cause of every outreach-needs-email breach: the email lookup ran only inside jobOutreach, once a weekday at 11:00 Amsterdam
-- (queue_sla.producer_cycle_min 1440, SLA-120M-2), so a needs-email row could never be handled within its 120-minute SLA (12 rows past
-- it at 2026-10-14 04:00Z). The new outreach-lookup job runs the lookup every 120 minutes, every day; this file records that cadence,
-- which clears the outreach row of metric sla_definitions_over_120m. Sends keep the weekday 11:00 slot and their caps.
-- spof-review: data only (one queue_sla row); no trigger, cron or credential.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE queue_sla SET producer_cycle_min = 1440, auto_fix = replace(auto_fix, ' | OUTREACH-LOOKUP-120M-1 (2026-10-14): qnfo-cloud-ops outreach-lookup looks up needs-email rows every 120 minutes, every day (10 rows a run), and moves a found address to pending; sends stay in jobOutreach at 11:00 on weekdays.', '') WHERE stuck_type = 'outreach-needs-email';

UPDATE queue_sla SET producer_cycle_min = 120,
  auto_fix = auto_fix || ' | OUTREACH-LOOKUP-120M-1 (2026-10-14): qnfo-cloud-ops outreach-lookup looks up needs-email rows every 120 minutes, every day (10 rows a run), and moves a found address to pending; sends stay in jobOutreach at 11:00 on weekdays.'
WHERE stuck_type = 'outreach-needs-email' AND COALESCE(producer_cycle_min, 0) <> 120;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_018jgELQUadN7Ybo1B3j77HY', 'a queue whose producer runs less often than its SLA breaches by construction; the fix is the producer cadence, not the SLA',
  'SLA-120M-3: outreach email lookup split from jobOutreach into qnfo-cloud-ops outreach-lookup every 120 minutes; queue_sla outreach-needs-email producer_cycle_min 120',
  '12 outreach_queue rows past the 120-minute SLA at 2026-10-14 04:00Z; the lookup ran once a weekday at 11:00 Amsterdam',
  'migration merged with qnfo-cloud-ops 1.29.0', 'outreach_queue rows in needs-email or needs-contact (status, attempts, email); no send path changed', 'the Rollback header and the previous qnfo-cloud-ops version',
  'contact lookups no longer wait for the weekday send slot', 'outreach_waiting in v_stuck_summary reads 0 within 4 hours of deploy (two lookup runs); a cloud_ops_events job-run row with job outreach-lookup within 2 hours',
  'outreach candidates get an address within 2 hours, so the weekday send slot is never starved of addressable rows', 'outreach_queue, queue_sla, cloud_ops_events'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-120M-3:') = 1);
