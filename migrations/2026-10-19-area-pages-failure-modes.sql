-- AREA-PAGES-1 failure modes (2026-10-19, qnfo-fleet-dashboard 1.45.0, charter pillar: autonomy).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-kpi-route-500', 'fm-page-css-never-sent', 'fm-area-without-page'); DELETE FROM failure_modes WHERE fm_key IN ('kpi-route-500', 'page-css-never-sent', 'area-without-page');
--
-- WHY (measured live on 2026-10-19 while refactoring the dashboard by functional area)
-- 1. GET https://fleet.qnfo.org/kpi answered HTTP 500 on 1.44.5. Offline the same route failed with "days.map is not a function".
--    A half-built KPI-THRESHOLDS-1 (agent_issues 2727, still open) looped over the finished KPI document as if it were a map of
--    metrics. No suite drove the route; kpi.test.mjs exercises only the pure shapers.
-- 2. The live overview HTML carried no .fx-r, .fx or .ctl-l rule: AREAS2_CSS (AREAS-2) was defined and never concatenated into
--    the page head, so the per-area rows rendered unstyled.
-- 3. GET /area/platform answered 404 while GET /api/area/platform answered 200: the page and the feeds each kept their own list
--    of areas (five in the metric model, six in FEED_AREAS).
-- Each gets a failure_modes row and an fm-<key> detector (runner-https, hourly) so a recurrence shows within the hour. The
-- code fixes are in the same pull request (qnfo-fleet-dashboard 1.45.0); the detectors fail until it is deployed.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('kpi-route-500',
   'a page route answers HTTP 500 for every request because it post-processes a shaped document as if it were a different structure',
   'GET /kpi and /api/kpi in qnfo-fleet-dashboard 1.44.5 iterated the KPI document as a map of metrics (KPI-THRESHOLDS-1, agent_issues 2727, half built): each top-level field was rebuilt as an object, so kpiHtml received days as an object and threw, and the metric_registry read took the { results } object of .all() for rows; no test drove the route',
   'qnfo-fleet-dashboard 1.45.0 serves the document as computed; area-pages.test.mjs drives /kpi and /api/kpi through the worker (D4, D6b); 2727 stays open for a shaper inside kpiCompute',
   'GET https://fleet.qnfo.org/kpi answers 200 and shows the Issues tile',
   'fm-kpi-route-500', '2026-10-19', 2727,
   'a route rebuilds, filters or enriches the document a shaper produced before rendering it',
   'live /kpi and /api/kpi answered HTTP 500 on 1.44.5 (observed 2026-10-19)',
   'the Metrics tab and /api/kpi: every reader of the fleet''s issue, reach and Buffer figures'),
  ('page-css-never-sent',
   'a stylesheet constant is defined in worker.js and never concatenated into the page head, so the markup it styles renders unstyled',
   'AREAS2_CSS (per-area rows, pipeline-switch list and summary link, AREAS-2) was defined beside AREAS_CSS but fleetHead concatenated only AREAS_CSS; no test rendered the page and looked for the rules',
   'fleetHead sends AREAS2_CSS (qnfo-fleet-dashboard 1.45.0); area-pages.test.mjs F1 and F2 require the rules in the rendered head',
   'GET https://fleet.qnfo.org/ contains the .fx-r rule',
   'fm-page-css-never-sent', '2026-10-19', NULL,
   'a CSS constant is added to a worker and no renderer reads it',
   'live overview on 1.44.5 (measured 2026-10-19): .fx-r, .fx, .ctl-l and .fl-sum absent from the HTML while the markup used them',
   'the By functional area rows and the switch list on the overview, for every visitor'),
  ('area-without-page',
   'a functional area is listed by the feeds and the registry but its page answers 404',
   'the page (areasModel, five metric areas) and the feeds (FEED_AREAS, six areas) kept separate lists: /area/platform matched the route, was looked up in the metric model and answered 404 while /api/area/platform answered 200',
   'AREA_REGISTRY is the one table (qnfo-fleet-dashboard 1.45.0); the page, FEED_AREAS and the metric model derive from it; area-pages.test.mjs B1 to B11 hold them to each other',
   'GET https://fleet.qnfo.org/area/platform answers 200 and shows the feeds-by-area table',
   'fm-area-without-page', '2026-10-19', NULL,
   'an area is added to one list of areas and not to another',
   'live GET /area/platform answered 404 on 1.44.5 while /api/area/platform answered 200',
   'the Platform area had no page and no navigation entry; the overview could not link it');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-kpi-route-500', NULL, '{"url": "https://fleet.qnfo.org/kpi", "status": 200, "contains": "Open issues now"}', 'runner-https', 3, 1, 'active', 'AREA-PAGES-1', 'failure-mode detector', 'qnfo-fleet-control');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-page-css-never-sent', NULL, '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": ".fx-r{"}', 'runner-https', 3, 1, 'active', 'AREA-PAGES-1', 'failure-mode detector', 'qnfo-fleet-control');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-area-without-page', NULL, '{"url": "https://fleet.qnfo.org/area/platform", "status": 200, "contains": "Feeds by area"}', 'runner-https', 3, 1, 'active', 'AREA-PAGES-1', 'failure-mode detector', 'qnfo-fleet-control');
