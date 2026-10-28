-- EXUVIA-CLOSEOUT-1 (2026-10-28, charter pillar reach; SESSION-RECORD-1, OWNER-NO-LOOSE-ENDS-1): the session record and decision log for the Exuvia / qnfo-memory-mcp / paper-export session.
-- Work handed to server-side owners: EXUVIA-ENGAGE-1 (1000644), METRIC-UNMEASURED-MINSAMPLE-1 (1000645), human_actions exuvia-register-agent (probe: /health exuvia_key), BP26-PAPER-PIDS-1 (1000338).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM session_records WHERE session_id = 'session-exuvia-mcp-1'; DELETE FROM decision_log WHERE actor = 'claude-code:session-exuvia-mcp-1';

INSERT OR IGNORE INTO session_records (session_id, wbs_code, agent_name, summary, decisions_made, files_changed, commits, infrastructure_changes, handoff_notes, execution_ratio, total_tasks, completed_tasks, started_at, completed_at)
VALUES ('session-exuvia-mcp-1', 'QNFO.REACH', 'claude-code',
 'Asked to integrate QNFO papers and the knowledge graph with Exuvia and update the QNFO MCP. Found that exuvia.dev is an unrelated enterprise product and the agent research network is exuvia-two.vercel.app. Shipped five exuvia_* tools in qnfo-memory-mcp, fixed the deploy-gate red my first merge caused, filed the owner card and follow-up issues, posted root-cause findings on METRIC-UNMEASURED-1 and the research-model escalation, and shipped per-paper CITATION.cff / CSL-JSON / BibTeX exports on papers.qnfo.org.',
 'Did not create the Exuvia account or key (identity-bound; card exuvia-register-agent). exuvia_publish_paper is a dry run unless confirm=true because posts cannot be deleted. Did not make the static MODELS edit asked for in #5044 because applyModelOrder already delivers it at runtime and the edit would disable its automatic revert. Did not change the METRIC-UNMEASURED filer in this session: it needs a min-sample marker and a control_registry row (MINSAMPLE-1).',
 'qnfo-memory-mcp/worker.js, qnfo-memory-mcp/exuvia.test.mjs, qnfo-gateway/worker.js, qnfo-gateway/open-data.test.mjs, qnfo-gateway/plain-article.test.mjs, migrations/2026-10-28-exuvia-handoff.sql, migrations/2026-10-28-exuvia-closeout.sql, docs/EXUVIA-INTEGRATION.md',
 'PRs 5053, 5055, 5065, 5075 merged; this closeout PR',
 'qnfo-memory-mcp 2.3.2-exuvia live (health exuvia_key false); qnfo-gateway 3.45.0 live (checked /api/papers/<slug>.cff|.csl.json|.bib on a real paper, HTTP 200)',
 'HANDED OFF server-side: Exuvia account and key = human_actions exuvia-register-agent (IDENTITY-BOUND, runtime probe on /health exuvia_key); engagement loop = agent_issues 1000644; METRIC-UNMEASURED filer = agent_issues 1000645 (root cause for 1000629); paper identifiers = agent_issues 1000338 (remaining: immutable version URLs, content-hash producer; oai_pmh_validates producer shipped by PR 5068). #5044 left open: its definition of done (gpt-oss-120b under half of research-exec neurons for a day) was not measured here. The stop-hook backlog (about 78 items) was never this session and stays with the fleet loops.',
 0.78, 9, 7, '2026-10-28T10:55:00Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-code:session-exuvia-mcp-1',
 'Reads, drafts and code are reversible and in scope; creating a third-party account and its key, and an undeletable public post, are not.',
 'Shipped exuvia_* tools with publish gated on confirm=true and a key; filed the account step as an IDENTITY-BOUND card; shipped per-paper citation exports.',
 'qnfo-memory-mcp /health 2.3.2-exuvia exuvia_key false; exuvia.test.mjs and open-data.test.mjs pass; deploy-gate green on the fix commit; papers.qnfo.org .cff .csl.json .bib return 200 on a real paper; migration 2026-10-28-exuvia-handoff applied (card, contract, issues 1000644 and 1000645 present).',
 'delivered', 'qnfo-memory-mcp tool list and /health; qnfo-gateway /api/papers/<slug>.<ext> routes; no secret, cron or binding added',
 'Revert PRs 5053, 5055, 5065, 5075; close issues 1000644 and 1000645; resolve card exuvia-register-agent (Rollback lines in the migrations)',
 'QNFO papers and the knowledge graph can be drafted into Exuvia posts and matched to Exuvia threads from the MCP; papers export to reference managers',
 'Once the key is set, 3 or more Exuvia replies or posts in 7 days with referral traffic from exuvia-two.vercel.app measured',
 'a new public research network (exuvia-two.vercel.app) for QNFO papers, gated on the owner creating the account',
 'unit tests with mocked bindings and fetch; live HTTP checks of the gateway export routes; the live Exuvia API was read only for capabilities, skill.md and docs (no write, no key)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'claude-code:session-exuvia-mcp-1');
