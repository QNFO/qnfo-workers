-- ROADMAP-1 (2026-10-28, charter pillar research; BP26-PAPER-PIDS-1, agent_issues 1000338): the two build items that give paper_version_immutability a real content hash and give papers.qnfo.org citation exports.
-- qnfo-gateway is in the code loop's canaried scope (CODE-LOOP-CONTROL-PLANE-1), so each is a code-task, not a hand edit from a session.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'ROADMAP-1: QNFO.RSCH #1: papers.qnfo.org serves a content hash%' OR title LIKE 'ROADMAP-1: QNFO.RSCH #2: papers.qnfo.org exports CITATION.cff%';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: QNFO.RSCH #1: papers.qnfo.org serves a content hash and immutable version URL per paper version',
 'Charter pillar: research. Serves BP26-PAPER-PIDS-1 (agent_issues 1000338); moves metric paper_version_immutability from a ledger write-path proxy (scripts/bp26_paperver.py) to the real definition. Lever: in qnfo-gateway, add GET /papers/<slug>/v/<version> returning the body of that version with an X-Content-SHA256 header and a sha256 field in /api/papers/<slug>, taken from paper_change_bodies / the papers row, and refuse (410) a version whose stored hash no longer matches. Add a unit test with a stub store. Do not change any other route. Definition of done: the version line carries PAPER-PIDS-HASH-1, GET /api/papers/<slug> returns sha256 for a published paper, and the offline suite passes.' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-gateway/worker.js' || char(10) ||
 'code-anchor: var OAI_PAGE = 100;',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'ROADMAP-1: QNFO.RSCH #1: papers.qnfo.org serves a content hash and immutable version URL per paper version' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: QNFO.RSCH #2: papers.qnfo.org exports CITATION.cff, BibTeX and CSL-JSON per paper',
 'Charter pillar: research. Serves BP26-PAPER-PIDS-1 (agent_issues 1000338). Lever: in qnfo-gateway add GET /papers/<slug>/cite.cff, /cite.bib and /cite.csl.json built from the paper row (title, author with ORCID, version, date, the paper address; never a retired-prefix DOI: lpDoi() rules apply). Offline test: each export parses and carries the version. Definition of done: the version line carries PAPER-PIDS-CITE-1 and the three routes answer 200 for a published paper.' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-gateway/worker.js' || char(10) ||
 'code-anchor: var OAI_PAGE = 100;',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'ROADMAP-1: QNFO.RSCH #2: papers.qnfo.org exports CITATION.cff, BibTeX and CSL-JSON per paper' AND status = 'open');

