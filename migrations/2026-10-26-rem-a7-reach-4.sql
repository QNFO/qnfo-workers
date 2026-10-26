-- REM-A7-REACH-4 (2026-10-26, charter pillar reach; agent_issues 2924). The owner reacted to the Search Console card: human_actions 183 gsc-service-account-user reads resolved at 19:31:04Z, "done via dashboard by owner (fleet.qnfo.org, emailed code)".
-- Five seconds later, at 19:31:09Z, the fleet's first Search Console read (qnfo-fleet-dashboard 1.72.0, cloud_ops_events gsc-ingest-2026-10-23) was still refused: "Google Search Console API has not been used in project 254457120993 before or it is disabled".
-- The read happens once per day-read and that row is its throttle (a day with any ledger row is not read again), so the owner would learn the result only after the next midnight although he has just acted.
-- This file frees that one day for a second read without losing the refusal: the denied row is kept under another key (id gsc-ingest-2026-10-23@denied-1931Z, same ts, text, status, meta), so the next dashboard tick
-- (:16 and :46 past the hour) reads again. It acts only while the owner's card says the step is done and the row is the denied one; if Google still refuses, the tick writes a new denied row and the day is throttled again.
-- Nothing else changes: no worker, secret, send path, Google setting or reach_signals row is written here.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE cloud_ops_events SET id = 'gsc-ingest-2026-10-23' WHERE id LIKE 'gsc-ingest-2026-10-23@denied-%' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events x WHERE x.id = 'gsc-ingest-2026-10-23')

UPDATE cloud_ops_events
   SET id = id || '@denied-' || substr(ts, 12, 2) || substr(ts, 15, 2) || 'Z'
 WHERE id = 'gsc-ingest-2026-10-23' AND kind = 'gsc-ingest' AND status = 'denied'
   AND EXISTS (SELECT 1 FROM human_actions WHERE slug = 'gsc-service-account-user' AND status = 'resolved' AND instr(COALESCE(resolution, ''), 'done via dashboard by owner') = 1)
   AND NOT EXISTS (SELECT 1 FROM cloud_ops_events x WHERE x.id LIKE 'gsc-ingest-2026-10-23@denied-%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f1:gsc-second-read',
  'the owner has just taken the step the card asked for, so the fastest honest feedback is a second read on the next tick; the refusal stays on the ledger as evidence under its own key',
  'cloud_ops_events gsc-ingest-2026-10-23 (denied, 2026-10-26T19:31:09Z) renamed to gsc-ingest-2026-10-23@denied-1931Z so the next qnfo-fleet-dashboard tick reads Search Console again (migrations/2026-10-26-rem-a7-reach-4.sql)',
  'human_actions 183 resolved 2026-10-26 19:31:04Z by the owner through the dashboard; cloud_ops_events gsc-ingest-2026-10-23 denied at 19:31:09Z: searchAnalytics 403 PERMISSION_DENIED, Search Console API not used in project 254457120993 or disabled; the throttle is one ledger row per day-read (gscIngest)',
  'pending: the tick at :16 or :46 after the apply',
  'one cloud_ops_events row key; the dashboard reads Search Console three times more; nothing is written to reach_signals unless Google answers',
  'the Rollback line restores the key when no new row exists for the day',
  'a refusal does not freeze the owner''s feedback for a day',
  'the next tick writes gsc-ingest-2026-10-23 as ok (rows in reach_signals source gsc, the contract of agent_issues 2924 passes and closes it) or as denied again with Google''s message, which the card and gsc_runs at /api/ga4 show',
  NULL,
  'migrations/rem-a7-reach-4.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'rem-a7-f1:gsc-second-read');
