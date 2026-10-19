-- REINTAKE-PROBE-MARKER-1 (2026-10-19, pillar autonomy). The failure-mode detector fm-reintake-cooldown-over-120m is a code-read
-- probe that requires the exact text "const INTAKE_RETRY_COOLDOWN_MIN = 120;" in qnfo-code-orchestrator/worker.js. SLA-COMPRESS-1
-- (0.18.0) lowered the cooldown to 30 minutes, which is further inside the 120-minute SLA, so the marker vanished and the detector
-- has read "missing-marker" every hour since: v_failure_mode_status lists reintake-cooldown-over-120m as recurring although the
-- defect (a 6-hour cooldown) is not present. The probe now names the line as it stands on main; the next change to the cooldown
-- changes this probe in the same PR, and a cooldown raised above 120 minutes fails it as before.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = '{"paths": ["qnfo-code-orchestrator/worker.js"], "contains": "const INTAKE_RETRY_COOLDOWN_MIN = 120;"}' WHERE class = 'fm-reintake-cooldown-over-120m';
UPDATE remediation_contracts SET verify_probe = '{"paths": ["qnfo-code-orchestrator/worker.js"], "contains": "const INTAKE_RETRY_COOLDOWN_MIN = 30;"}', next_due_at = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE class = 'fm-reintake-cooldown-over-120m';
