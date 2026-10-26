-- REM-A7-DOI-SWEEP-3 (2026-10-26, remediation agent rem-a7 fork F4; charter pillars reach and security; agent_issues NOZ-DOI-SWEEP-2A, filed by migrations/2026-10-26-rem-a7-doi-sweep.sql).
-- The closing contract of NOZ-DOI-SWEEP-2A (three public repository descriptions carry a closed-registry DOI) was an external-https read of the GitHub API description of QNFO/ignorance-audit. Its first run observed (absent) (remediation_verifications 19:00:51Z):
-- the API answered the fleet-control tick without a description field (an unauthenticated read from a shared Cloudflare address is rate limited), so the probe could not pass after the fix either. The fleet already holds the facts it needs: the portfolio loop syncs every repository
-- description into qnfo-audit.portfolio_repos (130 repositories, last sync 2026-10-26 19:01:06Z). The contract now counts the non-archived repositories whose synced description names 10.5281: 3 today (agentic-collapse, ignorance-audit, ultrametric-lean; three archived
-- repositories carry one too and are out of scope: an archived repository cannot be edited without unarchiving it). The definition of done of the issue is unchanged and the probe is stricter in scope (all non-archived repositories, not one) and immune to rate limits.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = '{"url": "https://api.github.com/repos/QNFO/ignorance-audit", "method": "GET", "check": "json:description", "expected": "QNFO research code: ignorance-audit. Staged and tested in QNFO/qnfo-workers/research-code/ignorance-audit."}', verify_transport = 'external-https', last_verdict = NULL, attempts = 0, next_due_at = datetime('now') WHERE class = (SELECT 'issue-' || a.id FROM agent_issues a WHERE a.title LIKE 'NOZ-DOI-SWEEP-2A:%' ORDER BY a.id DESC LIMIT 1) AND instr(verify_probe, 'portfolio_repos') > 0; UPDATE agent_issues SET description = substr(description, 1, instr(description, char(10) || char(10) || 'PROBE CHANGED (REM-A7-DOI-SWEEP-3') - 1) WHERE title LIKE 'NOZ-DOI-SWEEP-2A:%' AND instr(description, char(10) || char(10) || 'PROBE CHANGED (REM-A7-DOI-SWEEP-3') > 0

UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM portfolio_repos WHERE archived = 0 AND seen = 1 AND instr(coalesce(description, ''''), ''10.5281'') > 0) AS TEXT) AS observed', verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, last_attempt_at = NULL, next_due_at = datetime('now'), expected_cadence_h = 1,
       precondition = 'the portfolio loop has synced the repository descriptions into portfolio_repos',
       action = 'the doer (qnfo-fleet-control code loop) stops pfCodePublish from writing a closed-registry DOI and revises the three descriptions; the next portfolio sync lists them without it and this probe reads 0'
 WHERE class = (SELECT 'issue-' || a.id FROM agent_issues a WHERE a.title LIKE 'NOZ-DOI-SWEEP-2A:%' AND a.status = 'open' ORDER BY a.id DESC LIMIT 1)
   AND instr(verify_probe, 'api.github.com') > 0;

UPDATE agent_issues SET description = COALESCE(description, '') || '

PROBE CHANGED (REM-A7-DOI-SWEEP-3, 2026-10-26, rem-a7 fork F4): the closing probe read the GitHub API description of QNFO/ignorance-audit from the fleet-control tick and observed (absent) on its first run (19:00:51Z) while the description still named the registry: an unauthenticated read from a shared Cloudflare address is rate limited by GitHub, so that probe could not have passed after the fix either. It now reads the fleet''s own synced copy, qnfo-audit.portfolio_repos (written by the portfolio loop, last sync 19:01Z, 130 repositories): the number of non-archived repositories whose description names 10.5281, 3 today (agentic-collapse, ignorance-audit, ultrametric-lean). Definition of done unchanged: the daily portfolio sync lists the three without the DOI; the probe reads 0.', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE title LIKE 'NOZ-DOI-SWEEP-2A:%' AND status = 'open' AND instr(COALESCE(description, ''), 'PROBE CHANGED (REM-A7-DOI-SWEEP-3') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f4',
  'a closing probe must be able to pass after the fix: a read that depends on an unauthenticated GitHub API call from a shared address can fail for reasons that have nothing to do with the defect, so the fleet reads its own synced copy',
  'REM-A7-DOI-SWEEP-3: the contract of NOZ-DOI-SWEEP-2A now counts non-archived repositories whose synced description names 10.5281 (qnfo-audit.portfolio_repos), replacing the GitHub API read',
  'remediation_verifications 2026-10-26 19:00:51Z: class of issue 1000479 observed (absent) for json:description; portfolio_repos 130 repositories, 3 non-archived with a closed-registry DOI in the description, last_sync 19:01:06Z',
  'applied by migration', 'one contract and one issue description; no worker, repository or secret changes',
  'the Rollback line restores the external-https probe and trims the paragraph',
  'a rate limit cannot hold the issue open; the scope grows from one repository to all non-archived ones',
  'NOZ-DOI-SWEEP-2A closes when the portfolio sync lists the three descriptions without the DOI', 'reach: no public repository description names the closed registry',
  'GET and D1 read of the contract result, qnfo-audit.portfolio_repos SELECT'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A7-DOI-SWEEP-3:%');
