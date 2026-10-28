-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM session_records WHERE session_id = 'session-jobsearch-1028'; DELETE FROM roadmap_implementation WHERE item = 'JS-12' AND source = 'jobsearch-2026';
-- SESSION-CLOSEOUT-20261028-JOBSEARCH (pillar personal; SESSION-RECORD-1, OWNER-NO-LOOSE-ENDS-1): the user-test round of qnfo-jobsearch. The owner said the matches were wrong
-- (American firms, rejected roles returning, too AI-centric) and asked for user testing and the charter. One honest session_records row and one roadmap item for the fixes.
INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'JS-12', 'jobsearch-2026', 'User test of the real UI: inline sign-in, location from pasted text, word-bounded role keywords, no-location postings dropped, charter pillar personal', 'worker', 'qnfo-jobsearch', 'deployed',
 'qnfo-jobsearch 1.3.1 live (PR 5069 merged 2026-10-28; /health 1.3.1; /api/ops 8 of 8 ok); 116 offline tests; found by driving the UI in the in-app browser against qnfo-jobsearch/dev-server.mjs'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'JS-12' AND source = 'jobsearch-2026');

INSERT INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
)
SELECT
  'session-jobsearch-1028', 'QNFO.PERSONAL', 'claude-code',
  'Asked: user-test the job search myself, report its charter, make sure it works. Did: ran the real worker locally with live feeds and drove the UI in a browser. Defects found and fixed in 1.3.1: native prompt sign-in that could not be used (now an inline code box), Run now without sign-in offer, runs and matches tables missing from first-use setup, location not read from pasted text, gis matched inside strategist, postings with no location ranked, one-line paste used as title, years-gap wording. Verified: reject stays hidden after a re-run, survey answers change the list, 116 offline tests, CI green, live /health 1.3.1 and /api/ops 8 of 8. Charter: pillar corrected from reach to personal. Honest limits: matching is keyword and rule based, the feeds carry tech employers so the list is mostly product and program roles, Dutch public sector and universities have no open feed, the live site itself was not clicked through, reply rate unknown until about 10 applications are 21 days old.',
  'Test against a local copy of the real worker (in-memory SQLite, stub mailbox) because the live site needs an e-mailed code. Inline sign-in instead of a browser dialog. Postings with no location are dropped rather than ranked, since they cannot be placed against the owner preferences. Charter pillar personal because the tool serves one person, not reach. dev-server.mjs kept in the repository as the test harness.',
  'qnfo-jobsearch/worker.js and mirror (1.3.1), worker.test.mjs (116), wrangler.toml (pillar), dev-server.mjs (new), this migration.',
  'Pull request 5069.',
  'None beyond the deploy of qnfo-jobsearch 1.3.1 through the canonical path.',
  'OPEN: (1) JOBSEARCH-NL-PUBLIC-SECTOR-1: employers the owner knows best publish no open feed; doer is the code loop. (2) JOBSEARCH-LLM-RERANK-1 and JOBSEARCH-SOURCES-1 remain with the code loop. (3) jobs.q08.org not attached (DOMAIN-PLANE-1 issue, route-attach path). (4) Net-zero charter rule is only nominally met for this worker. (5) Outcome data: reply rate is read from jobsearch_events once applications age 21 days. The 75 fleet backlog items shown by the stop hook belong to other sessions and loops.',
  0.9, 6, 5,
  '2026-10-28T11:30:00Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE NOT EXISTS (SELECT 1 FROM session_records WHERE session_id = 'session-jobsearch-1028');
