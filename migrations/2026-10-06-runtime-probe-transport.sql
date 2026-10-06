-- PROBE-TRANSPORT-MONOCULTURE-1 (2026-10-06, pillar autonomy, agent_issues 2060; owner directive OWNER-NO-LOOSE-ENDS-1:
-- "why do fleet probes only run as SQL against qnfo-audit?"). Measured 2026-10-06 11:45Z: remediation_verifications since
-- 2026-10-01 = 1707 rows, all d1-query or d1-query@personal-life (377 pass); 520 of 521 contracts were d1-query variants;
-- the only runtime rows anywhere were qnfo-fleet-dashboard's same-account http probes (trusted, not independent) and four
-- container rows from 2026-09-28. scripts/remediation_consumer.py now runs transport runner-https: a GET from the
-- GitHub-hosted runner (outside the Cloudflare account) against the fleet's own hosts. It mirrors PROBE-TRANSPORTS-1
-- (agent_issues 2059), where qnfo-fleet-control runs external-https from Cloudflare against hosts outside the fleet and
-- refuses fleet hosts. This file:
--   1. backs up transport_trust, trusts runner-https, and corrects d1-query@personal-life to runtime_observable = 0 (it is a
--      D1 read; nothing else reads that column, and the new metric below must not count a SQL read as runtime evidence);
--   2. arms eight liveness contracts (module runtime-liveness-v1, hourly, never closing; on 3 straight failures the consumer
--      files RUNTIME-PROBE-FAIL-1 and the autoclose trigger closes it on recovery) for the public surfaces;
--   3. re-arms issue-1910 (GATEWAY-COLD-TTFB-1, closed 2026-10-05 on a session's measurement, contract superseded as a
--      placeholder by PROBE-TRANSPORTS-1) with the machine probe it never had: qnfo.org/ first byte under 3 s;
--   4. registers guard metric runtime_verified_share_24h with its trigger (lt 10). The consumer writes it every run; if the
--      runner stops, the share falls toward 0 and fleet-control's evaluateMetricTriggers (a Cloudflare cron) files it.
-- Idempotent (CREATE ... IF NOT EXISTS, INSERT OR IGNORE, guarded UPDATEs). No DELETE or DROP.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE transport_trust SET runtime_observable = 1 WHERE transport = 'd1-query@personal-life'; DELETE FROM transport_trust WHERE transport = 'runner-https'; UPDATE remediation_contracts SET status = 'superseded' WHERE module = 'runtime-liveness-v1' OR (class = 'issue-1910' AND verify_transport = 'runner-https'); DELETE FROM analytics_metric_triggers WHERE metric_key = 'runtime_verified_share_24h'; DELETE FROM metric_registry WHERE metric = 'runtime_verified_share_24h'; UPDATE human_actions SET status = 'open', resolved_at = NULL WHERE slug = 'review-merge-pr-726';

CREATE TABLE IF NOT EXISTS bak_20261006_transport_trust AS SELECT * FROM transport_trust;

INSERT OR IGNORE INTO transport_trust (transport, observation_class, runtime_observable, independent, trusted, note, ts)
VALUES ('runner-https', 'live-http', 1, 1, 1, 'PROBE-TRANSPORT-MONOCULTURE-1 (2026-10-06, #2060): scripts/remediation_consumer.py GETs a fleet host from the GitHub-hosted runner (outside the Cloudflare account, code not under test); declarative JSON probe, allowlisted hosts, token-only observations', datetime('now'));

UPDATE transport_trust
SET runtime_observable = 0,
    note = note || ' | CORRECTED 2026-10-06 (#2060): a SELECT on a D1 plane observes data, not service liveness; runtime_observable 1 -> 0'
WHERE transport = 'd1-query@personal-life' AND runtime_observable = 1;

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at) VALUES
 ('rt-fleet-dashboard', NULL, 'standing liveness: fleet.qnfo.org /health answers as qnfo-fleet-dashboard', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://fleet.qnfo.org/health", "status": 200, "contains": "qnfo-fleet-dashboard", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', NULL),
 ('rt-gateway', NULL, 'standing liveness: qnfo.org /health answers as qnfo-gateway', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://qnfo.org/health", "status": 200, "contains": "qnfo-gateway", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', NULL),
 ('rt-ai-router', NULL, 'standing liveness: ai.qnfo.org /health answers as qnfo-ai', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://ai.qnfo.org/health", "status": 200, "contains": "qnfo-ai", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', NULL),
 ('rt-idea-hub', NULL, 'standing liveness: ideas.qnfo.org /health answers', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://ideas.qnfo.org/health", "status": 200, "contains": "idea", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', NULL),
 ('rt-personal-api', NULL, 'standing liveness: personal.qnfo.org /health answers as personal-api', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://personal.qnfo.org/health", "status": 200, "contains": "personal-api", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', NULL),
 ('rt-ipatent', NULL, 'standing liveness: ipatent.qnfo.org home renders the provisional-patent tool', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://ipatent.qnfo.org/", "status": 200, "contains": "provisional", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', NULL),
 ('rt-papers', NULL, 'standing liveness: papers.qnfo.org home renders a complete page', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://papers.qnfo.org/", "status": 200, "contains": "</html>", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', NULL),
 ('rt-q08', NULL, 'standing liveness: q08.org home renders', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://q08.org/", "status": 200, "contains": "q08", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', NULL);

UPDATE remediation_contracts
SET verify_transport = 'runner-https',
    verify_probe = '{"url": "https://qnfo.org/", "status": 200, "max_ms": 3000}',
    status = 'holding', attempts = 0, last_verdict = NULL, next_due_at = NULL, expected_cadence_h = 6,
    module = 'runtime-retrofit-v1',
    action = 'qnfo.org/ first byte under 3 s from outside Cloudflare (issue 1910 closed 2026-10-05 on a session measurement of 0.22-0.30 s); a 3-failure streak reopens 1910'
WHERE class = 'issue-1910' AND verify_transport <> 'runner-https';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('runtime_verified_share_24h', 'system', 'guard', '100 * remediation_verifications of the last 24h whose transport is trusted = 1, independent = 1 and runtime_observable = 1 in transport_trust / all remediation_verifications of the last 24h; written by scripts/remediation_consumer.py on every run (PROBE-TRANSPORT-MONOCULTURE-1). Guards remediation_latest_pass_pct_7d: a fix confirmed only by SQL on rows the fixer wrote is bookkeeping, not runtime evidence', 'qnfo-audit.remediation_verifications + transport_trust', '0.0 on 2026-10-06 (1707 verifications since 10-01, none runtime once d1-query@personal-life is corrected)', '>= 25', 'qnfo-ops', 'its own trigger: restore the runner-https executor or add runtime contracts', 'hourly', '< 20', '< 10', 'UNMEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES
 ('runtime_verified_share_24h', 'Verification monoculture: under 10% of the last day''s verifications observed a running service from an independent vantage', 'registry', 'lt', 10, 7,
  'Pillar autonomy. Either the runner-https executor stopped or runtime contracts dried up. Check: (1) SELECT MAX(verified_at), COUNT(*) FROM remediation_verifications WHERE transport = ''runner-https'' AND verified_at >= datetime(''now'',''-1 day''); if 0 rows, read ci-status/remediation-consumer.json and the last remediation-consumer workflow run in QNFO/qnfo-workers and fix the cause (token, workflow_run chain, allowlist); (2) SELECT class, status, last_verdict FROM remediation_contracts WHERE verify_transport IN (''runner-https'',''external-https''); re-arm superseded ones and give each open issue whose defect is a page, route or latency a runner-https probe instead of a SQL one. Never relabel a d1-query transport as runtime to lift this number. Definition of done: runtime_verified_share_24h >= 10 in metric_registry with the before and after values in issue_triage.close_evidence. If the remedy does not move the metric within 7 days, say so on the issue and try a different lever.',
  'qnfo-ops', 'agent_issues', 24, 1, 'PROBE-TRANSPORT-MONOCULTURE-1 2026-10-06 (#2060)');

-- The owner card review-merge-pr-726 (the session was refused permission to merge its own PR) resolves when this file
-- applies, which only happens after the PR merges.
UPDATE human_actions SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now'),
    resolution = 'PR 726 merged; migration 2026-10-06-runtime-probe-transport.sql applied by apply-migrations'
WHERE slug = 'review-merge-pr-726' AND status = 'open';
