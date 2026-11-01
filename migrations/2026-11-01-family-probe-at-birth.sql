-- FM-4 (RM-1757, charter pillar autonomy): give two measurable issue families a real contract at birth.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_family_reassert; DROP TRIGGER IF EXISTS contract_probe_templates_family_birth;

CREATE TRIGGER IF NOT EXISTS contract_probe_templates_family_birth
AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe'
  AND NEW.issue_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agent_issues a
    WHERE a.id = NEW.issue_id
      AND (
        (a.title LIKE 'METRIC-UNMEASURED-1: % has metrics with no value'
          AND length(substr(a.title, 22, length(a.title) - 47)) > 0)
        OR
        (a.title LIKE 'CF-OBS-ISSUE-1:%'
          AND instr(COALESCE(a.description, ''), 'cf-obs-id: ') > 0
          AND instr(substr(a.description, instr(a.description, 'cf-obs-id: ') + 11), char(10)) > 1)
      )
  )
BEGIN
  UPDATE remediation_contracts
  SET status = 'active',
      verify_transport = 'd1-query',
      module = 'issue-birth-probe-families',
      attempts = 0,
      last_verdict = NULL,
      next_due_at = datetime('now'),
      precondition = CASE
        WHEN EXISTS (
          SELECT 1 FROM agent_issues a
          WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-UNMEASURED-1:%'
        ) THEN 'METRIC-UNMEASURED-1: metric_improvement_now contains this owner''s unmeasured metrics'
        ELSE 'CF-OBS-ISSUE-1: fleet_issue_dispatch records this group as active or quiet'
      END,
      action = CASE
        WHEN EXISTS (
          SELECT 1 FROM agent_issues a
          WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-UNMEASURED-1:%'
        ) THEN 'FM-4 measuring probe: close only when this owner has no unmeasured non-BP26 metrics'
        ELSE 'FM-4 measuring probe: close only when the Cloudflare issue group is resolved or has been quiet for six hours'
      END,
      verify_probe = CASE
        WHEN EXISTS (
          SELECT 1 FROM agent_issues a
          WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-UNMEASURED-1:%'
        ) THEN
          'WITH owner_metrics AS (SELECT verdict, bp26 FROM metric_improvement_now WHERE owner = ' ||
          quote((SELECT substr(a.title, 22, length(a.title) - 47) FROM agent_issues a WHERE a.id = NEW.issue_id)) ||
          ') SELECT ''0'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM owner_metrics) ' ||
          'THEN CAST((SELECT COUNT(*) FROM owner_metrics WHERE verdict = ''unmeasured'' AND bp26 = 0) AS TEXT) ' ||
          'ELSE ''missing'' END AS observed'
        ELSE
          'WITH dispatch AS (SELECT state, payload FROM fleet_issue_dispatch WHERE fingerprint = ' ||
          quote('cf-obs-' || (SELECT substr(a.description, instr(a.description, 'cf-obs-id: ') + 11, instr(substr(a.description, instr(a.description, 'cf-obs-id: ') + 11), char(10)) - 1) FROM agent_issues a WHERE a.id = NEW.issue_id)) ||
          ') SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM dispatch WHERE state = ''resolved'' OR ' ||
          '(state <> ''resolved'' AND json_valid(payload) AND CAST(json_extract(payload, ''$.lastObserved'') AS INTEGER) > 0 ' ||
          'AND CAST(json_extract(payload, ''$.lastObserved'') AS INTEGER) <= (CAST(strftime(''%s'', ''now'') AS INTEGER) - 21600) * 1000)) ' ||
          'THEN ''1'' WHEN EXISTS (SELECT 1 FROM dispatch) THEN ''0'' ELSE ''missing'' END AS observed'
      END
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

CREATE TRIGGER IF NOT EXISTS contract_probe_templates_family_reassert
AFTER UPDATE OF verify_probe ON remediation_contracts
WHEN NEW.module = 'issue-birth-probe-families'
  AND NEW.verify_transport = 'd1-query'
  AND instr(NEW.verify_probe, 'ELSE ''missing'' END AS observed') = 0
  AND EXISTS (
    SELECT 1 FROM agent_issues a
    WHERE a.id = NEW.issue_id
      AND a.title LIKE 'CF-OBS-ISSUE-1:%'
      AND instr(COALESCE(a.description, ''), 'cf-obs-id: ') > 0
      AND instr(substr(a.description, instr(a.description, 'cf-obs-id: ') + 11), char(10)) > 1
  )
BEGIN
  UPDATE remediation_contracts
  SET verify_probe =
      'WITH dispatch AS (SELECT state, payload FROM fleet_issue_dispatch WHERE fingerprint = ' ||
      quote('cf-obs-' || (SELECT substr(a.description, instr(a.description, 'cf-obs-id: ') + 11, instr(substr(a.description, instr(a.description, 'cf-obs-id: ') + 11), char(10)) - 1) FROM agent_issues a WHERE a.id = NEW.issue_id)) ||
      ') SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM dispatch WHERE state = ''resolved'' OR ' ||
      '(state <> ''resolved'' AND json_valid(payload) AND CAST(json_extract(payload, ''$.lastObserved'') AS INTEGER) > 0 ' ||
      'AND CAST(json_extract(payload, ''$.lastObserved'') AS INTEGER) <= (CAST(strftime(''%s'', ''now'') AS INTEGER) - 21600) * 1000)) ' ||
      'THEN ''1'' WHEN EXISTS (SELECT 1 FROM dispatch) THEN ''0'' ELSE ''missing'' END AS observed'
  WHERE class = NEW.class AND module = 'issue-birth-probe-families' AND verify_probe = NEW.verify_probe;
END;

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES
  ('family-specific-measuring-probes-at-issue-birth',
   'migrations/2026-11-01-family-probe-at-birth.sql (FM-4, RM-1757)',
   'agent_issues birth contract; metric_improvement_now; fleet_issue_dispatch',
   0.5,
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
   'METRIC-UNMEASURED-1 probes measure the owner''s unmeasured non-BP26 rows; CF-OBS-ISSUE-1 probes require a recorded group and wait for resolution or six quiet hours.');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'qnfo-fleet-control (RM-1757 FM-4)',
  'the two issue families have authoritative operational signals that can be read when their birth contract is inserted',
  'FM-4: install family-specific measuring probes for METRIC-UNMEASURED-1 and CF-OBS-ISSUE-1 before the generic vacuous template can supersede them',
  'SQLite regression tests prove active-at-birth contracts, nonpassing observations while data is missing or defective, and passing observations only after recovery; the migration checker validates the CI migration',
  'pending canonical migration and live issue-birth readback; no deployment or fleet-wide improvement claimed',
  'new remediation contracts for METRIC-UNMEASURED-1 and CF-OBS-ISSUE-1 issues',
  'Rollback line of migrations/2026-11-01-family-probe-at-birth.sql',
  'new issues in both families receive a defect-measuring contract at birth',
  'eligible issue contracts are active and do not pass while their source signal is absent or defective; recovered sources make their probe pass',
  'no new route, spend, or publication path',
  'SQLite birth-trigger ordering, owner escaping, metric recovery, missing dispatch, active/quiet/resolved dispatch, unrelated-family fallback, and apply_migrations.py --check'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action LIKE 'FM-4: install family-specific measuring probes%'
);
