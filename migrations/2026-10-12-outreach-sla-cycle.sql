-- OUTREACH-SLA-CYCLE-1 (2026-10-12, pillar reach; owner: "audit and remediate all email/outreach issues, open items, failure
-- modes and root causes"). No first-contact outreach email has gone out since 2026-10-08 (outreach_log: 8 a day 09-30..10-05,
-- then 4, 3, 1, then follow-ups only). outreach_queue holds no pending row: all 25 candidates since 10-01 ended
-- skipped-no-email with attempts 0 and error "QUEUE-SLA-1 skipped after 180 min (was needs-contact ...)".
-- Root cause: radar-hub inserts the day's candidates as needs-contact at 09:00:30 UTC, in the same minute qnfo-cloud-ops
-- jobOutreach runs (once a weekday, 11:00 Europe/Amsterdam), so the job has already read the queue; its next look is a day
-- (or a weekend) later. queue_sla row outreach-needs-email says cycle 60 min, SLA 180 min, and queue_sla_tick_10m skips the
-- rows at 180 min: every candidate is killed before its first lookup. A stuck-item SLA shorter than its consumer's cycle.
-- Fix (the tick trigger's other steps are untouched; its owner session holds today's SLA migrations):
-- 1. BEFORE UPDATE trigger outreach_queue_sla_untried_guard: the QUEUE-SLA-1 skip is refused (RAISE IGNORE, that row only)
--    for a row the outreach job never tried (attempts 0) that is younger than 73 h (one weekday run, across a weekend).
--    jobOutreach's own attempt cap (3 lookups, then skipped-no-email) stays the terminal path.
-- 2. queue_sla row: cycle 1440 min, SLA 4380 min, definition says why.
-- 3. the candidates the SLA skipped untried in the last 7 days go back to needs-contact for the next run.
-- 4. failure mode sla-shorter-than-consumer-cycle with a detector.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS outreach_queue_sla_untried_guard; UPDATE queue_sla SET cycle_min = 60, sla_min = 180, definition = 'status needs-email or needs-contact for more than 180 min' WHERE stuck_type = 'outreach-needs-email'; UPDATE outreach_queue SET status = 'skipped-no-email' WHERE error LIKE 'OUTREACH-SLA-CYCLE-1 restored%'; DELETE FROM remediation_contracts WHERE class = 'fm-sla-shorter-than-consumer-cycle'; DELETE FROM failure_modes WHERE fm_key = 'sla-shorter-than-consumer-cycle'

CREATE TRIGGER IF NOT EXISTS outreach_queue_sla_untried_guard BEFORE UPDATE OF status ON outreach_queue
WHEN NEW.status = 'skipped-no-email' AND OLD.status IN ('needs-email', 'needs-contact')
  AND COALESCE(NEW.error, '') LIKE 'QUEUE-SLA-1 skipped%'
  AND COALESCE(OLD.attempts, 0) = 0
  AND datetime(OLD.created_at) > datetime('now', '-73 hours')
BEGIN
  SELECT RAISE(IGNORE);
END;

UPDATE queue_sla SET cycle_min = 1440, sla_min = 4380,
  definition = 'status needs-email or needs-contact for more than 73 h, or after 3 failed lookups (jobOutreach runs once a weekday; radar-hub inserts in the same minute, so a row waits up to one weekday run across a weekend; OUTREACH-SLA-CYCLE-1)'
WHERE stuck_type = 'outreach-needs-email';

UPDATE outreach_queue SET status = 'needs-contact',
  error = substr('OUTREACH-SLA-CYCLE-1 restored 2026-10-12: skipped by QUEUE-SLA-1 before the daily outreach job tried it. ' || COALESCE(error, ''), 1, 500)
WHERE status = 'skipped-no-email' AND COALESCE(attempts, 0) = 0 AND COALESCE(error, '') LIKE 'QUEUE-SLA-1 skipped%'
  AND datetime(created_at) > datetime('now', '-7 days');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('sla-shorter-than-consumer-cycle', 'a stuck-item SLA skips queue rows before their consumer runs once', 'queue_sla outreach-needs-email had SLA 180 min while jobOutreach runs once a weekday and radar-hub inserts in the same minute after it has read the queue, so QUEUE-SLA-1 skipped every candidate untried', 'migrations/2026-10-12-outreach-sla-cycle.sql: guard trigger outreach_queue_sla_untried_guard, queue_sla cycle 1440 / SLA 4380, restored rows', 'no outreach candidate younger than 73 h is skipped by QUEUE-SLA-1 with attempts 0', 'fm-sla-shorter-than-consumer-cycle', '2026-10-01', NULL, 'a producer inserts after the consumer''s daily read and the SLA is shorter than the consumer cycle', 'outreach_queue rows skipped-no-email with attempts 0 and a QUEUE-SLA-1 error; outreach_log with follow-ups only', 'all first-contact outreach (0 sent 2026-10-08 to 10-12)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-sla-shorter-than-consumer-cycle', NULL, 'OUTREACH-SLA-CYCLE-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM outreach_queue WHERE status = ''skipped-no-email'' AND COALESCE(attempts, 0) = 0 AND COALESCE(error, '''') LIKE ''QUEUE-SLA-1 skipped%'' AND datetime(created_at) > datetime(''now'', ''-73 hours'') AND datetime(created_at) > ''2026-10-12 15:00:00'') = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-cloud-ops', 1, 'holding', 'failure-mode', 45000, 5, 0);
