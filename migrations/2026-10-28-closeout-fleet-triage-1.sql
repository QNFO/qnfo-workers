-- CLOSEOUT-FLEET-TRIAGE-1 (2026-10-28, charter pillar: autonomy). Session record for the FLEET-TRIAGE-1 audit plus the handoff of the one piece it left undone:
-- the Google AI Mode reading of the owner (rwnquni, 2026-10-28) names research work and roles that jobsearch/facts.json does not claim.
-- Files one issue for the job-search loop; the owner-only part (is the National Household Travel Survey co-direction true?) stays an IDENTITY-BOUND fact check inside it, because a fabricated resume claim costs more than a missed application.
-- No DELETE, DROP, trigger, cap or threshold changes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: session_records and agent_issues are append-only history; any cancellation needs a separately recorded disposition.';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'JOBSEARCH-RESEARCH-PORTFOLIO-1: the claim ledger omits the owner research portfolio that public search surfaces first',
  'Charter pillar: personal (job search). Found 2026-10-28 by reading Google AI Mode for the owner name against jobsearch/facts.json (17 facts).' || char(10) ||
  'Gap: public summaries name Quantum Laws of Form (Syntactic Token Calculus), the quantum-computing scalability critique (Landauer), dimensionless physics and ultrametric attention, plus the role founder and director of QNFO. The ledger holds only the audit method (F07), JPCUB (F08), the 44-worker research system (F06) and the open library (F09); both resume headlines lean on the federal and policy work, so the newest work never reaches a resume.' || char(10) ||
  'Doer: qnfo-jobsearch (JOBSEARCH ledger, worker.js embeds jobsearch/facts.json; keep the parity test green). Step 1: add each research item as a ledger fact only from a source the fleet can read (papers.body_md and DOIs in living-paper), written in plain language with its DOI; every sentence stays verbatim-checked by the verifier. Step 2: add a research-portfolio headline and cluster so research and AI roles pick it. Step 3: publish the same ledger as a JSON-LD Person and CV page on qnfo.org (README next step).' || char(10) ||
  'IDENTITY-BOUND: Google also says the owner co-directed the US DOT 10M-dollar National Household Travel Survey and led predictive analytics for Deloitte and Publicis. The ledger supports only a 2011 workshop talk, a 2016 TRB paper and delivered engagements. Do not add the stronger claims until the owner states scope and role; the owner-card jobsearch-ledger-owner-answers carries it.' || char(10) ||
  'Definition of done: the ledger has at least four research facts with DOIs, a research headline exists, and GET https://qnfo-jobsearch.q08.workers.dev/health reports a version above 1.3.1 with the new fact count.',
  'session-fleet-triage', 'reach', 'medium', 'open', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'JOBSEARCH-RESEARCH-PORTFOLIO-1:%');

INSERT INTO session_records (session_id, wbs_code, agent_name, summary, decisions_made, files_changed, commits, infrastructure_changes, handoff_notes, execution_ratio, total_tasks, completed_tasks, started_at, completed_at, created_at)
SELECT 'session-fleet-triage-2026-10-28', 'QNFO.OPS', 'claude-code (desktop)',
  'Read what Google AI Mode says about the owner and compared it with the job-search ledger; audited fleet failure modes read-only (83 to 85 breaches, 30 to 32 with no root cause); shipped GET /api/triage and /triage (PR 5120, dashboard 1.74.0, verified live); filed METRIC-CAUSE-AT-REGISTRATION-1 (PR 5123, issue 1000706).',
  'Did not map unmapped metrics by guess (BREACH-ONE-MEANING-1). Added no worker, cron or model call while the AI spend cap is breached. Did not close issue 1000615 (model default already on main; publication-rate half of its definition of done unmeasured). Merged own PRs after green checks.',
  'qnfo-fleet-dashboard/worker.js, deployed-current.worker.js, triage.test.mjs, migrations/2026-10-28-metric-cause-at-registration-1.sql, this file',
  'PR 5120, PR 5123, this closeout PR', 'dashboard 1.73.0 to 1.74.0 through the canonical path; migration run 809 ok',
  'Open: agent_issues 1000706 (map 32 unmapped metrics, require a cause at registration); JOBSEARCH-RESEARCH-PORTFOLIO-1 (research facts and headline); 1000615 needs a publication-rate measure; BP26 and recurrence-tracker items on the stop-hook list were not started. started_at is approximate.',
  0.71, 7, 5, '2026-10-28T15:00:00Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM session_records WHERE session_id = 'session-fleet-triage-2026-10-28');
