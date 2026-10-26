-- CADENCE-SLA-CONTINUITY-1 (2026-10-26, charter pillar autonomy, BREACH-ONE-MEANING heartbeat cause). cadence_overdue_over_120m read 3 at
-- 09:25Z; one of them, continuity-snapshot, was a wrong definition: its cadence_sla row said interval 120 minutes, but
-- scripts/continuity_snapshot.py runs only when the newest ok snapshot is older than 20 hours (line 132, "one continuity snapshot a day",
-- doctrine section 14), so the row read overdue 1,072 minutes while the producer was on schedule (last ok snapshot 2026-10-25T13:30:02Z).
-- The interval becomes 1260 minutes (20 hours plus one consumer cadence window), the pattern of the cf-changelog row; sla_min stays 120,
-- so a snapshot missed after its due time is still a breach within 120 minutes (QUEUE-SLA-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE cadence_sla SET interval_min = 120, schedule = 'one continuity snapshot a day (doctrine section 14)' WHERE surface = 'continuity-snapshot';
UPDATE cadence_sla SET interval_min = 1260,
  schedule = 'scripts/continuity_snapshot.py (remediation-consumer.yml) runs when the newest ok snapshot is 20 hours old: interval 1260 minutes (20 h plus one consumer window); sla_min 120 applies after that due time (CADENCE-SLA-CONTINUITY-1)',
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE surface = 'continuity-snapshot';
