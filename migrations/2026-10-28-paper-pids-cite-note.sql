-- PAPER-PIDS-CITE-NOTE-1 (2026-10-28, charter pillar research; OWNER-NO-LOOSE-ENDS-1, no duplicate work): agent_issues 1000647 (ROADMAP-1 QNFO.RSCH #2, papers.qnfo.org citation exports) is queued
-- for the code loop, but qnfo-gateway 3.45.0 (PR 5075, session-exuvia-mcp-1) already serves the three exports at /api/papers/<slug>.cff|.csl.json|.bib. This note tells the doer what exists so it adds only
-- the missing alias routes and the version tag instead of building the exports a second time. It changes no status.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = replace(description, char(10) || 'DELTA-NOTE (session-exuvia-mcp-1, 2026-10-28): qnfo-gateway 3.45.0 (PR 5075) already serves /api/papers/<slug>.cff, .csl.json and .bib from the open record (citeCff, citeCsl, citeBib, citeResponse in handleOpenData; tests in qnfo-gateway/open-data.test.mjs). Remaining for this issue: the alias routes /papers/<slug>/cite.cff, /cite.bib and /cite.csl.json calling citeResponse, and PAPER-PIDS-CITE-1 in the version line. Do not rebuild the exports.', '') WHERE id = 1000647;

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-exuvia-mcp-1, 2026-10-28): qnfo-gateway 3.45.0 (PR 5075) already serves /api/papers/<slug>.cff, .csl.json and .bib from the open record (citeCff, citeCsl, citeBib, citeResponse in handleOpenData; tests in qnfo-gateway/open-data.test.mjs). Remaining for this issue: the alias routes /papers/<slug>/cite.cff, /cite.bib and /cite.csl.json calling citeResponse, and PAPER-PIDS-CITE-1 in the version line. Do not rebuild the exports.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000647 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-exuvia-mcp-1%';
