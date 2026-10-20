-- DOMAIN-PLANE-AUDIT-1 (agent_issues 100230, 2026-10-20, pillar core): the inventory in docs/DOMAINS.md (## Inventory) lists every owner-facing host
-- with its plane and worker. Two quantum-plane hosts sit on qwav.tech instead of qwav.org: ask.qwav.tech (qnfo-ai-search) and the qwav.tech apex
-- (qnfo-gateway). Each gets its own DOMAIN-PLANE-1:<host> issue with a doer and a closing runtime probe, so the audit's definition of done
-- (every misplaced host has its own issue) holds. Each insert is skipped when an open issue with the same title prefix exists. No worker, cron
-- or trigger is added; the doer moves the host and keeps the old name as a 301 so links already sent keep working.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM agent_issues WHERE status = 'open' AND (title LIKE 'DOMAIN-PLANE-1:ask.qwav.tech%' OR title LIKE 'DOMAIN-PLANE-1:qwav.tech%') AND source = 'session' AND category = 'reach'

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'DOMAIN-PLANE-1:ask.qwav.tech quantum Ask page sits on qwav.tech, not qwav.org',
 'Charter pillar: reach. docs/DOMAINS.md (owner directive 2026-10-19): quantum computing surfaces live on qwav.org. ask.qwav.tech is routed to qnfo-ai-search (scripts/attach-ask-qwav-route.py, ASK-QWAV-ROUTE-1) and answers 200; ask.qwav.org has no route. Found by DOMAIN-PLANE-AUDIT-1 (docs/DOMAINS.md ## Inventory).' || char(10) ||
 'Doer: the code loop. Lever: attach ask.qwav.org to qnfo-ai-search with the repository token through the canonical path (the zone route pattern in scripts/attach-ask-qwav-route.py with ZONE_NAME qwav.org, qwav.org zone) and make ask.qwav.tech answer 301 to https://ask.qwav.org with path and query kept, so links already sent keep working; update docs/DOMAINS.md ## Inventory.' || char(10) ||
 'Definition of done: https://ask.qwav.org/health names qnfo-ai-search.' || char(10) ||
 'runtime-probe: {"url": "https://ask.qwav.org/health", "status": 200, "contains": "qnfo-ai-search"}' || char(10) ||
 'code-task: repo=qnfo-workers path=scripts/attach-ask-qwav-route.py',
 'session', 'reach', 'medium', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'DOMAIN-PLANE-1:ask.qwav.tech%');

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'DOMAIN-PLANE-1:qwav.tech quantum apex answers 200 on qwav.tech while qwav.org is canonical',
 'Charter pillar: reach. docs/DOMAINS.md (owner directive 2026-10-19): quantum computing surfaces live on qwav.org; qwav.org is the canonical host (rel=canonical, SPARE-DOMAIN-CANON-1 redirects qwav.uk, qwave.tech and q-wave.tech to it). qwav.tech/* is routed to qnfo-gateway and answers 200 as a second copy. Found by DOMAIN-PLANE-AUDIT-1 (docs/DOMAINS.md ## Inventory).' || char(10) ||
 'Doer: the code loop. Lever: only after DOMAIN-PLANE-1:ask.qwav.tech has moved the Ask page, add qwav.tech to the spare-domain redirect set (SPARE_ZONES in scripts/cf_ops_actions.py, spare-domain-canon, zone redirect rule 301 to https://qwav.org with path and query kept; ask.qwav.tech keeps its own 301) and verify from outside.' || char(10) ||
 'Definition of done: https://qwav.tech/ answers 301 to https://qwav.org.' || char(10) ||
 'runtime-probe: {"url": "https://qwav.tech/", "status": 301, "redirect_to": "https://qwav.org"}',
 'session', 'reach', 'low', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'DOMAIN-PLANE-1:qwav.tech%');
