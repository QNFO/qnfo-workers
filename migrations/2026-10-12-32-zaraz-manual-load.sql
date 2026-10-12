-- ZARAZ-MANUAL-LOAD-1 (2026-10-12, agent_issues 2345, charter pillar reach; qnfo-gateway 3.16.1, idea-hub 1.8.5). ZARAZ-GA4-1 published
-- the GA4 tool on qnfo.org (cf-ops-actions zaraz-set-ga4, 12:10Z) and the live config has autoInjectScript on (read 12:36Z), yet no page
-- of qnfo.org, papers.qnfo.org or q08.org carried /cdn-cgi/zaraz/s.js: Zaraz auto-inject does not touch HTML a Worker serves on a route.
-- The edge answers /cdn-cgi/zaraz/i.js on every host of a configured zone (qnfo.org, papers.qnfo.org, qwav.tech: 200), so the pages
-- load the Zaraz loader themselves. This file: the issue's probe becomes the runner-https check of the live page (the worker's own
-- request to its zone is the issue-1190 artifact, so it runs from the GitHub runner), the failure mode and its record, and the red-team
-- row that retires the belief "Zaraz needs only the config".
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM failure_modes WHERE fm_key = 'zaraz-autoinject-worker-html'; DELETE FROM blocker_redteam WHERE target = 'issue:2345' AND claim LIKE 'Zaraz GA4 is live once%'; UPDATE remediation_contracts SET verify_transport = 'd1-query', module = 'issue', verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 2345) <> ''open'' THEN ''ok'' ELSE ''open'' END AS observed' WHERE class = 'issue-2345'

UPDATE remediation_contracts SET
  verify_probe = '{"url": "https://qnfo.org/", "status": 200, "contains": "/cdn-cgi/zaraz/i.js"}',
  verify_transport = 'runner-https', module = 'runtime-probe-line-v2', status = 'active', max_items = 5, budget_ms = 45000,
  precondition = 'qnfo-gateway 3.16.1 ZARAZ-MANUAL-LOAD-1 deployed through the canonical path',
  action = 'ZARAZ-MANUAL-LOAD-1: the page HTML carries the zone Zaraz loader; GA4 G-LV7RHRVW6R is configured on qnfo.org and qwav.tech (zaraz-set-ga4 runs 119 and 120, 2026-10-12)'
WHERE class = 'issue-2345';

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('zaraz-autoinject-worker-html', 'Zaraz is configured and published but no page carries its script',
  'Zaraz auto-inject acts on origin HTML; every public page of the fleet is HTML a Worker serves on a route, which auto-inject does not touch',
  'ZARAZ-MANUAL-LOAD-1: qnfo-gateway 3.16.1 and idea-hub 1.8.5 emit <script src="/cdn-cgi/zaraz/i.js"> from their shared head; the edge answers /cdn-cgi/* before any route',
  'runner-https GET https://qnfo.org/ contains /cdn-cgi/zaraz/i.js (contract issue-2345, from the GitHub runner)', 'issue-2345', '2026-10-12', 2345,
  'a worker that serves HTML drops its inline analytics for Zaraz, or a new HTML-serving worker is added without the loader line',
  'GA4 receives no page views from the fleet; the Zaraz dashboard shows the tool published and zero events',
  'every public page of the qnfo.org and qwav.tech zones');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, ts)
SELECT 'issue:2345', 'Zaraz GA4 is live once the zone config carries the tool with autoInjectScript on',
  'zaraz-set-ga4 live on qnfo.org (run 119, already configured) and qwav.tech (run 120, published 200); live config read: zarazEnabled true, settings.autoInjectScript true, tool ga4-qnfo-org enabled on the Pageview trigger; GET https://qnfo.org/, https://papers.qnfo.org/, https://q08.org/ with a browser UA, cache HIT and MISS: zero occurrences of cdn-cgi/zaraz; GET https://qnfo.org/cdn-cgi/zaraz/i.js: 200 application/javascript 2228 bytes',
  'workaround-built', 'the config was never the blocker: Worker-served HTML is not auto-injected; the pages now load /cdn-cgi/zaraz/i.js themselves (qnfo-gateway 3.16.1, idea-hub 1.8.5)',
  'session_01Kddqwk5gQT5qSSHVKjT2EA', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:2345' AND claim LIKE 'Zaraz GA4 is live once%');
