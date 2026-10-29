-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE portfolio_actions SET status = 'withdrawn' WHERE repo IN ('QNFO/infrastructure', 'QNFO/qnfo-errata-pipeline') AND action = 'archive-request' AND detail LIKE 'REPO-UNIFY-3 %' AND status = 'requested'
-- REPO-UNIFY-3 (2026-10-29, pillar autonomy; docs/REPO-UNIFICATION.md step 3). Archive requests for two platform repositories whose live source is in qnfo-workers.
-- Evidence read 2026-10-29: QNFO/infrastructure holds workers qnfo-ai, qnfo-archive, qnfo-gateway, qnfo-ipatent, qnfo-lifecycle, qnfo-memory-mcp, qnfo-qwav, and every one has a directory in qnfo-workers;
-- QNFO/qnfo-errata-pipeline (watch, respond, publish workers) is superseded by qnfo-workers/errata-hub. File-level hashes differ because the hub copies evolved, so the match is by worker.
-- Not requested, and why: qnfo-releases (papers/2026/07/measure-theoretic-artifacts exists only there), qnfo-infra (its README is the program record), qwav-platform (sources not yet compared).
-- PORTFOLIO-ARCHIVE-1 executes at most 3 requests per sync; archiving is reversible (GitHub unarchive). Nothing is deleted.
INSERT INTO portfolio_actions (ts, repo, action, status, detail)
SELECT datetime('now'), 'QNFO/infrastructure', 'archive-request', 'requested', 'REPO-UNIFY-3 superseded by QNFO/qnfo-workers (all 7 workers present there)'
WHERE NOT EXISTS (SELECT 1 FROM portfolio_actions WHERE repo = 'QNFO/infrastructure' AND action = 'archive-request' AND status IN ('requested', 'done'));
INSERT INTO portfolio_actions (ts, repo, action, status, detail)
SELECT datetime('now'), 'QNFO/qnfo-errata-pipeline', 'archive-request', 'requested', 'REPO-UNIFY-3 superseded by QNFO/qnfo-workers errata-hub'
WHERE NOT EXISTS (SELECT 1 FROM portfolio_actions WHERE repo = 'QNFO/qnfo-errata-pipeline' AND action = 'archive-request' AND status IN ('requested', 'done'));
