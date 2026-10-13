-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE failure_modes SET probe_class = 'issue-2204' WHERE fm_key = 'sla-grace-equals-target'; UPDATE failure_modes SET probe_class = 'issue-2109' WHERE fm_key = 'notice-reply-encoded-subject'; UPDATE failure_modes SET probe_class = 'issue-1223' WHERE fm_key = 'ratio-over-failure-only-table'; UPDATE failure_modes SET probe_class = 'issue-2345' WHERE fm_key = 'zaraz-autoinject-worker-html'; UPDATE failure_modes SET probe_class = 'issue-2374' WHERE fm_key = 'collector-without-credential'; UPDATE failure_modes SET probe_class = 'issue-2015' WHERE fm_key = 'honeypot-named-for-autofill'; UPDATE failure_modes SET probe_class = 'issue-2165' WHERE fm_key = 'judge-context-narrower-than-writer'; UPDATE failure_modes SET probe_class = 'issue-2300' WHERE fm_key = 'math-delim-pairing-shift'; UPDATE failure_modes SET probe_class = 'fm-version-note-comment-terminator' WHERE fm_key = 'version-note-comment-terminator'; DELETE FROM failure_modes WHERE fm_key IN ('remediation-tick-starved', 'exact-version-probe'); DELETE FROM remediation_contracts WHERE class IN ('fm-sla-grace-equals-target', 'fm-notice-reply-encoded-subject', 'fm-ratio-over-failure-only-table', 'fm-zaraz-autoinject-worker-html', 'fm-collector-without-credential', 'fm-honeypot-named-for-autofill', 'fm-judge-context-narrower-than-writer', 'fm-math-delim-pairing-shift', 'fm-remediation-tick-starved', 'fm-exact-version-probe'); UPDATE remediation_contracts SET verify_probe = '{"url": "https://qnfo.org/email/health", "status": 200, "contains": "2.6.1-notice-reply-match"}' WHERE class = 'issue-2109'; UPDATE remediation_contracts SET verify_probe = '{"url": "https://qnfo-ai.q08.workers.dev/health", "status": 200, "contains": "5.34.1-accuracy-ground"}' WHERE class = 'issue-2303'; UPDATE remediation_contracts SET verify_probe = '{"url": "https://qnfo-code-orchestrator.q08.workers.dev/health", "status": 200, "contains": "0.10.0-intake-window"}' WHERE class = 'issue-2310'
-- FAILURE-MODE-DETECTOR-OWN-1 (2026-10-13, pillar autonomy, agent_issues 2199 and 2461). Audit of the 14 failure modes that
-- v_failure_mode_status read as recurring or unprobed at 05:30 UTC. Three root causes in the measurement, not in the fleet:
-- (1) the remediation tick was starved in the hourly fan-out (10 and 11 probes at 04:00 and 05:00 against about 150), so every
--     hourly detector aged past the view's 60-minute window: fixed in qnfo-fleet-control 0.23.0 (REMEDIATION-TICK-SLOT-1) in
--     the same pull request, and recorded below as failure mode remediation-tick-starved with its own detector;
-- (2) five failure modes used the contract of the issue that fixed them as their detector; once the issue closed, that
--     contract went to the daily hold cadence, so the mode read "unprobed" 23 hours a day. Each now has its own standing fm-*
--     detector (hourly, never parked, DETECTOR-CADENCE-1) carrying the same probe;
-- (3) three failure modes used an outcome metric as their detector (subscriber growth for the honeypot name, the grounded
--     share for the judge context, the render-defect count for the delimiter rule), so they read "recurring" while their own
--     mechanism stayed fixed. Each now probes its mechanism; the outcome metrics keep their own issues (1753, 2165, 2300).
-- The version-note comment terminator is guarded in CI: scripts/run-suites.mjs runs node --check on every changed worker
-- (SUITE-SYNTAX-CHECK-1, same pull request), so its row reads ci-guarded.
-- Exact-version runner probes: issue-2109, issue-2303 and issue-2310 matched a full VERSION string and fail after any later
-- release (2310 already read fail while holding, so REMEDIATION-REOPEN-1 would reopen a fixed issue); they become min_version
-- probes (MIN-VERSION-PROBE-1), and failure mode exact-version-probe counts any that remain.

-- (2) own standing detectors copied from the closed-issue contracts
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-sla-grace-equals-target', NULL, verify_probe, verify_transport, 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector', 'qnfo-fleet-control' FROM remediation_contracts WHERE class = 'issue-2204';
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-notice-reply-encoded-subject', NULL, '{"url": "https://qnfo.org/email/health", "status": 200, "min_version": "2.6.1"}', 'runner-https', 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector', 'qnfo-fleet-control');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-ratio-over-failure-only-table', NULL, verify_probe, verify_transport, 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector', 'qnfo-fleet-control' FROM remediation_contracts WHERE class = 'issue-1223';
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-zaraz-autoinject-worker-html', NULL, verify_probe, verify_transport, 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector', 'qnfo-fleet-control' FROM remediation_contracts WHERE class = 'issue-2345';
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-collector-without-credential', NULL, verify_probe, verify_transport, 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector', 'qnfo-fleet-control' FROM remediation_contracts WHERE class = 'issue-2374';

-- (3) mechanism detectors instead of outcome metrics
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-honeypot-named-for-autofill', NULL, '{"paths": ["qnfo-gateway/worker.js"], "absent": "name=\"website\""}', 'code-read', 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector: no gateway form field is named website (the autofill-completed honeypot name); qnfo-gateway/reach-funnel-ap.test.mjs refuses autofill-shaped honeypot names in CI', 'qnfo-fleet-control');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-judge-context-narrower-than-writer', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ask_events WHERE judge = 1 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector: no ask answer was judged on the narrow excerpt (ask_events.judge = 1) in 24 h; only full-context verdicts (judge = 2) feed ask_grounded_share_7d', 'qnfo-fleet-control');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-math-delim-pairing-shift', NULL, '{"paths": ["qnfo-gateway/worker.js"], "contains": "MATH-DELIM-2"}', 'code-read', 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector: the parity-checked delimiter rule (MATH-DELIM-2) is still in the renderer; qnfo-gateway/render.test.mjs holds the page lines', 'qnfo-fleet-control');

UPDATE failure_modes SET probe_class = 'fm-sla-grace-equals-target' WHERE fm_key = 'sla-grace-equals-target';
UPDATE failure_modes SET probe_class = 'fm-notice-reply-encoded-subject' WHERE fm_key = 'notice-reply-encoded-subject';
UPDATE failure_modes SET probe_class = 'fm-ratio-over-failure-only-table' WHERE fm_key = 'ratio-over-failure-only-table';
UPDATE failure_modes SET probe_class = 'fm-zaraz-autoinject-worker-html' WHERE fm_key = 'zaraz-autoinject-worker-html';
UPDATE failure_modes SET probe_class = 'fm-collector-without-credential' WHERE fm_key = 'collector-without-credential';
UPDATE failure_modes SET probe_class = 'fm-honeypot-named-for-autofill', detector = 'fm-honeypot-named-for-autofill (code-read: no form field named website in qnfo-gateway) and reach-funnel-ap.test.mjs in CI; subscriber growth is the outcome, tracked by agent_issues 1753' WHERE fm_key = 'honeypot-named-for-autofill';
UPDATE failure_modes SET probe_class = 'fm-judge-context-narrower-than-writer', detector = 'fm-judge-context-narrower-than-writer (no narrow-excerpt verdict, judge = 1, in 24 h); the grounded share is the outcome, tracked by agent_issues 2165' WHERE fm_key = 'judge-context-narrower-than-writer';
UPDATE failure_modes SET probe_class = 'fm-math-delim-pairing-shift', detector = 'fm-math-delim-pairing-shift (code-read: MATH-DELIM-2 in the renderer) and render.test.mjs; the render-defect page count is the outcome, tracked by agent_issues 2300' WHERE fm_key = 'math-delim-pairing-shift';
UPDATE failure_modes SET probe_class = NULL, detector = 'CI: scripts/run-suites.mjs runs node --check on every changed worker.js and deployed-current.worker.js (SUITE-SYNTAX-CHECK-1, 2026-10-13); before that only charter-guard (fleet-control) and code-loop-test (orchestrator) did', remediation = 'write "the 20-minute audit", never the two characters that close a block comment inside one; SUITE-SYNTAX-CHECK-1 (2026-10-13): scripts/run-suites.mjs, which runs on every pull request that touches a worker, syntax-checks every changed worker before its suites, and checks an ES-module worker as a .mjs copy because node 22 --check exits 0 on a .js file with export default even when it does not parse (measured 2026-10-13: the comment-terminator break passed node --check as .js and failed as .mjs), so the old advice "run node --check <worker>/worker.js" proved nothing for module workers' WHERE fm_key = 'version-note-comment-terminator';

-- new failure modes found in this audit, each with its own detector
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius)
VALUES ('remediation-tick-starved', 'the remediation tick verified 10 of about 150 due contracts an hour',
  'remediationContractsTick ran inside the hourly fan-out of about 25 parallel ctx.waitUntil jobs that all query qnfo-audit; its sequential probes queued behind them and the event ended 30 s after the handler returned (2026-10-13 04:00 and 05:00 UTC)',
  'qnfo-fleet-control 0.23.0 REMEDIATION-TICK-SLOT-1: the tick runs on the 20-minute cron with a 25 s budget and re-stamps a contract 25 minutes before its cadence; the GitHub remediation consumer stays the second path',
  'fm-remediation-tick-starved: no active worker-transport contract overdue by more than 40 minutes', 'fm-remediation-tick-starved', '2026-10-13',
  'issues_unprobed_60m and failure-mode statuses read unprobed; 203 active contracts overdue', 'every issue closure and failure-mode verdict waits for the GitHub consumer');
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius)
VALUES ('exact-version-probe', 'a live-version probe matches a full VERSION string and fails after the next release',
  'runner-https probes for issues 2109, 2303 and 2310 used "contains": "<full version>"; any later bump makes them fail, and a failing probe on a held or closed issue reopens it (REMEDIATION-REOPEN-1)',
  'probes use "min_version" (MIN-VERSION-PROBE-1); migration 2026-10-13-01 converted the three',
  'fm-exact-version-probe: no active or holding runner-https probe contains a full x.y.z-name version string', 'fm-exact-version-probe', '2026-10-13',
  'issue-2310 read fail while holding though the fix was live', 'fixed issues reopen and count as relapses');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-remediation-tick-starved', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE status = ''active'' AND verify_transport IN (''d1-query'', ''d1-query@portfolio-state'') AND next_due_at IS NOT NULL AND datetime(next_due_at) < datetime(''now'', ''-40 minutes'')) AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector', 'qnfo-fleet-control');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-exact-version-probe', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE verify_transport = ''runner-https'' AND status IN (''active'', ''holding'') AND verify_probe GLOB ''*"contains": "[0-9]*.[0-9]*.[0-9]*-*'') AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector', 'qnfo-fleet-control');

-- exact-version probes become min_version probes
UPDATE remediation_contracts SET verify_probe = '{"url": "https://qnfo.org/email/health", "status": 200, "min_version": "2.6.1"}' WHERE class = 'issue-2109';
UPDATE remediation_contracts SET verify_probe = '{"url": "https://qnfo-ai.q08.workers.dev/health", "status": 200, "min_version": "5.34.1"}', next_due_at = datetime('now') WHERE class = 'issue-2303';
UPDATE remediation_contracts SET verify_probe = '{"url": "https://qnfo-code-orchestrator.q08.workers.dev/health", "status": 200, "min_version": "0.10.0"}', next_due_at = datetime('now') WHERE class = 'issue-2310';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a failure-mode verdict is only as good as its detector: a detector must probe the mode''s own mechanism at the detector cadence',
   'FAILURE-MODE-DETECTOR-OWN-1: eight failure modes get their own standing fm-* detectors (five copied from closed-issue contracts, three probing the mechanism instead of an outcome metric); version-note-comment-terminator becomes ci-guarded behind the suite runner''s syntax check; two new failure modes (remediation-tick-starved, exact-version-probe) with detectors; three exact-version probes become min_version',
   'v_failure_mode_status 2026-10-13 05:30 UTC: 14 modes recurring or unprobed; remediation_verifications from the worker tick: 10 (04:00) and 11 (05:00) against 149 (03:00); issue-2310 failing while its fix is live (orchestrator 0.14.0)',
   'merged with qnfo-fleet-control 0.23.0 through the canonical path', 'qnfo-audit rows only', 'the Rollback line of migrations/2026-10-13-01-failure-mode-detectors.sql',
   'failure-mode verdicts measure the failure modes; the probe tick keeps its cadence under load',
   'within 2 hours of the deploy failure_modes_recurring falls from 14 to at most 4 (companion stall, unprobed issues, code task at CI, collector) and issues_unprobed_60m to 10 or fewer', 'none', 'd1:qnfo-audit, telemetry:qnfo-fleet-control scheduled events');
