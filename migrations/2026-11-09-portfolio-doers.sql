-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET linked_session = NULL WHERE linked_session LIKE 'doer:portfolio-%' AND source IS NOT NULL;
-- PORTFOLIO-DOERS-1 (2026-11-09, charter pillar autonomy). Owner: assign doers to all open portfolio, program (ROADMAP-1), product and plus issues so each resolves without a person.
-- Every open issue of these families with no linked_session gets a named doer and a Doer line; the compat-date families also get the code-task that the paired draft PR implements.
UPDATE agent_issues SET
  linked_session = 'doer:portfolio-code-loop',
  description = description || char(10) || 'code-task: repo=qnfo-workers path=' ||
    CASE WHEN title LIKE 'PORTFOLIO-UPGRADE-1:%' THEN substr(title, instr(title, ' for ') + 5) ELSE substr(title, length('PORTFOLIO-GAP upgrade-compat ') + 1) END ||
    '/wrangler.toml' || char(10) || 'Doer: portfolio-code-loop (PORTFOLIO-DOERS-1); draft PR advances compatibility_date to 2026-11-04, canonical deploy then /health re-probe closes it.'
WHERE status = 'open' AND coalesce(linked_session,'') = ''
  AND (title LIKE 'PORTFOLIO-UPGRADE-1:%' OR title LIKE 'PORTFOLIO-GAP upgrade-compat %');
UPDATE agent_issues SET
  linked_session = 'doer:portfolio-autopilot-loop',
  description = description || char(10) || 'Doer: portfolio-autopilot-loop (PORTFOLIO-DOERS-1); closes itself when the gap stops reporting, evidence in project_ledger/portfolio_sync_runs.'
WHERE status = 'open' AND coalesce(linked_session,'') = ''
  AND (title LIKE 'PORTFOLIO-GAP%' OR title LIKE 'PORTFOLIO-WRITE-%' OR title LIKE 'PORTFOLIO-COST-CARD-1%');
UPDATE agent_issues SET
  linked_session = 'doer:program-code-loop',
  description = description || char(10) || 'Doer: program-code-loop (qnfo-code-orchestrator, PORTFOLIO-DOERS-1) for the owning program; closing probe is the issue-' || id || ' contract.'
WHERE status = 'open' AND coalesce(linked_session,'') = ''
  AND (title LIKE 'ROADMAP-1:%' OR title LIKE 'PLUS-1 %');
