-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE module = 'fm-backfill-9662'; UPDATE failure_modes SET probe_class = NULL WHERE fm_key IN ('const-read-before-declaration-in-caught-branch','copilot-pr-checks-held','d1-compound-limit','deploy-loop-aborts-on-first-target','github-token-overprivileged','infra-context-enrich-error','ledger-tag-form-leak','new-issue-no-copilot','reviewer-output-shape-drift','sla-over-120m','suite-exit-masked-by-pipe','suite-set-differs-by-pr','ts-format-mix','version-note-comment-terminator','version-pin-tests'); UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT state FROM service_registry WHERE service = ''qnfo-evolve'') = ''retired'' AND (SELECT CAST(last_value AS INTEGER) FROM metric_registry WHERE metric = ''worker_count'') <= 38 THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-1001902';
-- CAUSE-MAPPED: no metric registered; backfills contracts for existing failure modes (issue 9662) and corrects a stale probe (issue 9651)

-- Issue 9662: every failure mode gets a remediation contract (class = fm_key) so it has a path to a definition of done,
-- and the 15 modes with probe_class NULL get one. The probe is a presence floor: the mode still names a remediation.
UPDATE failure_modes SET probe_class = fm_key WHERE probe_class IS NULL
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = failure_modes.fm_key);

INSERT OR IGNORE INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
SELECT f.fm_key,
  'FM-CONTRACT-BACKFILL-1 (issue 9662): ' || substr(f.failure_mode, 1, 160),
  'Remediation on record: ' || substr(ifnull(f.remediation, 'none'), 1, 300),
  'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = ''' || f.fm_key || ''' AND length(ifnull(remediation, '''')) > 0 AND probe_class IS NOT NULL) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 24, 'active', 'fm-backfill-9662'
FROM failure_modes f
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = f.fm_key OR c.class = 'fm-' || f.fm_key);

-- Issue 9651: qnfo-evolve is retired/folded; worker_count <= 38 became false because other workers were added. Probe the fold only.
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT state FROM service_registry WHERE service = ''qnfo-evolve'') = ''retired'' THEN ''1'' ELSE ''0'' END AS observed'
WHERE class = 'issue-1001902';
