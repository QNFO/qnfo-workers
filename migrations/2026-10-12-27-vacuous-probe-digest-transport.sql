-- VACUOUS-PROBE-V3-1 + DIGEST-TRANSPORT-1 (2026-10-12, pillars autonomy and reach; session chat-2026-10-12-fleet-best-practices).
--
-- Part A, VACUOUS-PROBE-V3-1. PROBE-CADENCE-FLOOR-1 (PR 949, migrations/2026-10-12-probe-cadence-floor.sql) gave every issue that no
-- earlier birth template claims a "v3 generic" probe that returns observed = 'open: no close_evidence yet' while the issue is open. That
-- probe does not measure the defect, only the issue's own status, so:
--   * it writes one failing remediation_verifications row per issue per hour, which pulls the guard metric
--     remediation_latest_pass_pct_7d down by construction (68.3 at 2026-10-12 10:10Z, 20 contracts on the template);
--   * it reports "probed" for issues that nothing measures, which hides them from issues_unprobed_60m.
-- The review on PR 949 (comment 6118857891, 06:17Z) flagged this before the merge; the stale-PR lane merged at 09:00Z without reading it.
-- Fix: while the issue is open the probe now returns NULL as observed. Both runners (qnfo-fleet-control remediationContractsTick and
-- scripts/remediation_consumer.py) treat an empty result as vacuous-probe-result and write no verification row. Once the issue is
-- closed (which the close-evidence trigger only allows with issue_triage.close_evidence) it still passes, so the contract closes itself.
-- The cadence floor (parts 1-3 and 5 of PR 949) is untouched. Existing failing rows are kept (never delete a verification row); they
-- age out of the 7-day window.
--
-- Part B, DIGEST-TRANSPORT-1 (agent_issues 2351). Cloudflare Email Service "is intended only for transactional emails"
-- (https://developers.cloudflare.com/email-service/reference/faq/, read 2026-10-12). qnfo-subscribers sends the double opt-in
-- confirmation (transactional) and the weekly digest (newsletter-type) through it; the digest already carries one-click
-- List-Unsubscribe headers (qnfo-subscribers worker.js). This records the digest's transport as a setting, measures confirmed
-- external subscribers, and arms a trigger: above 25 the fleet files the issue that moves the digest to a bulk-capable sender
-- (an account in the owner's name, so that step is identity-bound and becomes an owner card at that point, not before).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_v3_generic_probe
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261012_v3_generic_probe b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261012_v3_generic_probe); DROP TRIGGER IF EXISTS digest_transport_metric_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'subscribers_confirmed_external'; DELETE FROM metric_registry WHERE metric = 'subscribers_confirmed_external'; DELETE FROM ops_config WHERE key = 'subscribers_digest_transport'; DELETE FROM remediation_contracts WHERE class = 'fm-probe-vacuous-open-fail'; DELETE FROM failure_modes WHERE fm_key = 'probe-vacuous-open-fail'; then re-run the v3 trigger block of migrations/2026-10-12-probe-cadence-floor.sql

-- ---------------------------------------------------------------- Part A
CREATE TABLE IF NOT EXISTS bak_20261012_v3_generic_probe AS
SELECT class, issue_id, status, action, verify_probe, datetime('now') AS backed_up_at
FROM remediation_contracts WHERE module = 'probe-template-v3-generic';

UPDATE remediation_contracts
SET verify_probe = replace(verify_probe, 'ELSE ''open: no close_evidence yet'' END', 'ELSE NULL END'),
    action = 'VACUOUS-PROBE-V3-1: no verdict while the issue is open (nothing here measures its defect); passes once the issue is closed with issue_triage.close_evidence. A doer that knows the defect replaces this probe with one that measures it.'
WHERE module = 'probe-template-v3-generic' AND verify_probe LIKE '%open: no close_evidence yet%';

DROP TRIGGER IF EXISTS contract_probe_templates_v3_generic;
CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-TRIGGER-%')
  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live' WHERE a.id = NEW.issue_id)
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)',
      action = 'VACUOUS-PROBE-V3-1: no verdict while the issue is open (nothing here measures its defect); passes once the issue is closed with issue_triage.close_evidence. A doer that knows the defect replaces this probe with one that measures it.',
      verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || NEW.issue_id || ') AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('probe-vacuous-open-fail', 'a contract probe that reads only its own issue''s status fails every hour while the issue is open',
  'PROBE-CADENCE-FLOOR-1 v3 generic template returned a non-empty observed value for open issues, so each run wrote a failing verification that measured nothing',
  'VACUOUS-PROBE-V3-1 (this migration): observed is NULL while open, so the runners record no verdict; the probe passes only after an evidence-backed close',
  'no active contract''s probe contains the text open: no close_evidence yet', 'fm-probe-vacuous-open-fail', '2026-10-12', 2351,
  'an issue that no birth template can measure', 'hourly failing verification rows with no defect behind them', 'the guard metric remediation_latest_pass_pct_7d and every decision read from it');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, module, status, next_due_at) VALUES
 ('fm-probe-vacuous-open-fail', NULL, 'failure mode probe-vacuous-open-fail (VACUOUS-PROBE-V3-1)',
  'detector: counts active contracts whose probe still returns the open-status text',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE status = ''active'' AND class <> ''fm-probe-vacuous-open-fail'' AND verify_probe LIKE ''%open: no close_evidence yet%'') AS TEXT) AS observed',
  'd1-query', 'qnfo-ops', 1, 'VACUOUS-PROBE-V3-1', 'active', datetime('now'));

-- ---------------------------------------------------------------- Part B
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('subscribers_digest_transport', 'email-service',
  'DIGEST-TRANSPORT-1 (agent_issues 2351): the weekly digest goes through Cloudflare Email Service with one-click List-Unsubscribe. Cloudflare states the service is for transactional mail only; the metric trigger on subscribers_confirmed_external (> 25) files the move to a bulk-capable sender.');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, last_value, last_refreshed, state, refresh_class) VALUES
 ('subscribers_confirmed_external', 'fleet', 'leading',
  'count of subscribers rows with status subscribed and confirmed_at set, excluding addresses on the fleet''s own domains (qnfo.org, q08.org)',
  'qnfo-audit.subscribers (qnfo-subscribers)', '1', '<= 25 while the digest uses Email Service (DIGEST-TRANSPORT-1)', 'qnfo-subscribers', 'qnfo-subscribers', 'hourly',
  NULL, NULL, 'UNMEASURED', 'd1-trigger');

CREATE TRIGGER IF NOT EXISTS digest_transport_metric_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM subscribers WHERE status = 'subscribed' AND confirmed_at IS NOT NULL
                       AND lower(email) NOT LIKE '%@qnfo.org' AND lower(email) NOT LIKE '%@q08.org') AS TEXT)
  WHERE metric = 'subscribers_confirmed_external';
END;

UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
  last_value = CAST((SELECT COUNT(*) FROM subscribers WHERE status = 'subscribed' AND confirmed_at IS NOT NULL
                     AND lower(email) NOT LIKE '%@qnfo.org' AND lower(email) NOT LIKE '%@q08.org') AS TEXT)
WHERE metric = 'subscribers_confirmed_external';

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'subscribers_confirmed_external', 'Reach: the subscriber list has outgrown transactional sending (more than 25 confirmed)', 'registry', 'gt', 25, 5,
  'Pillar reach (DIGEST-TRANSPORT-1, agent_issues 2351). More than 25 confirmed external subscribers receive the weekly digest through Cloudflare Email Service, which Cloudflare states is for transactional mail only (https://developers.cloudflare.com/email-service/reference/faq/). Keep confirmations and unsubscribe receipts on Email Service. Move the digest to a bulk-capable sender: that needs a provider account in the owner''s name, so file it as a human_actions card with an IDENTITY-BOUND: line and the default in effect (the digest keeps going out with one-click List-Unsubscribe). Then set ops_config subscribers_digest_transport to the new transport.',
  'qnfo-subscribers', 'agent_issues', 168, 1, 'DIGEST-TRANSPORT-1 (migrations/2026-10-12-27-vacuous-probe-digest-transport.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'subscribers_confirmed_external');

UPDATE remediation_contracts
SET verify_transport = 'd1-query', status = 'active', next_due_at = datetime('now'),
    verify_probe = 'SELECT ''3'' AS expected, CAST(((SELECT COUNT(*) FROM ops_config WHERE key = ''subscribers_digest_transport'') + (SELECT COUNT(*) FROM analytics_metric_triggers WHERE metric_key = ''subscribers_confirmed_external'' AND enabled = 1) + (SELECT COUNT(*) FROM metric_registry WHERE metric = ''subscribers_confirmed_external'' AND last_value IS NOT NULL)) AS TEXT) AS observed',
    action = 'DIGEST-TRANSPORT-1: the transport is recorded, the external-subscriber count is measured, and the threshold trigger is armed'
WHERE class = 'issue-2351';
