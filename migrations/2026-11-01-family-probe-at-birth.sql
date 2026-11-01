-- FM-4 (RM-1757, charter pillar autonomy): give two measurable issue families a real contract at birth.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_family_birth;

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
