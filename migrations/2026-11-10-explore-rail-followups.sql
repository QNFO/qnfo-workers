-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM agent_issues WHERE source = 'explore-rail-1';
-- CAUSE-MAPPED: no metric registered; two doer issues for the remaining halves of EXPLORE-RAIL-1 (adoption by the other public workers, and the click-through read)

-- EXPLORE-RAIL-1 (owner directive 2026-11-10: every property keeps visitors exploring the rest of the Qniverse; pillar reach).
-- The rail shipped on qnfo-gateway, idea-hub, qnfo-ai-search and qnfo-ipatent. These are the two halves it did not cover.

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'EXPLORE-RAIL-2: markets.q08.org, fleet.qnfo.org and q08.org essay pages carry no Keep exploring rail',
'EXPLORE-RAIL-1 (scripts/explore-rail-apply.mjs, _shared/explore-rail.js) decorates public pages of four workers. markets.q08.org (q08-prediction-markets) and fleet.qnfo.org (qnfo-fleet-dashboard) answer visitors with no onward step to the rest of the Qniverse. Both already carry the WEBMCP default-export shape the applier needs.
code-task: repo=qnfo-workers path=scripts/explore-rail-apply.mjs
code-anchor: export const TARGETS = ["qnfo-gateway", "idea-hub", "qnfo-ai-search", "qnfo-ipatent"];
Edit: add "q08-prediction-markets" and "qnfo-fleet-dashboard" to TARGETS, run node scripts/explore-rail-apply.mjs, bump both workers with scripts/worker_release.py, and add a data-explore-rail http probe to each probes.json (at most 8 http probes per file). Check the design-system adopter test (_shared/design-system.test.mjs) still passes: the rail must not add a second primary button or text under 13 px.
runtime-probe: {"url": "https://markets.q08.org/", "status": 200, "contains": "data-explore-rail"}
Closing probe: runtime-probe above, and the same for https://fleet.qnfo.org/',
'explore-rail-1', 'reach', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'EXPLORE-RAIL-2:%' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'EXPLORE-RAIL-3: nothing reads how many visitors take a door from the Keep exploring rail',
'Every rail link carries utm_medium=explore-rail, so the gateway utm_clicks table (qnfo-graph) holds the doors taken, but no route or metric reads them, so the rail cannot be judged keep-or-revert. Add a read-only gateway route that returns, for the last 7 days, human (ua_class not bot) rail clicks by source host and destination, so a metric can be registered with its trigger. Clicks are not readers (READER-YIELD-1): report engaged sessions separately when GA4 data exists, never as a target.
code-task: repo=qnfo-workers path=qnfo-gateway/worker.js
code-anchor: // ---- EXPLORE-RAIL-1:END ----
Edit: next to the rail block add handler exploreRailStats(env) answering GET /api/explore-rail-stats as JSON {days:7, human_clicks, by_source:[...], by_target:[...]} from utm_clicks WHERE campaign = ''explore-rail'' AND ua_class != ''bot'' (read the table and column names from utmRecord in the same file), cached 10 minutes, and route it in the fetch handler before the not-found page.
runtime-probe: {"url": "https://qnfo.org/api/explore-rail-stats", "status": 200, "contains": "human_clicks"}
Closing probe: runtime-probe above',
'explore-rail-1', 'reach', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'EXPLORE-RAIL-3:%' AND status = 'open');
