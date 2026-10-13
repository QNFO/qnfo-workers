-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM spof_alternate_probes WHERE component IN ('audits_stale refresher', 'publish freshness metrics')
-- METRIC-REFRESHER-2 (2026-10-13, pillar autonomy, metric spofs_total 4 against target 0). qnfo-fleet-control 0.25.0 adds a
-- second path for the four metrics only D1 triggers on fleet_tick wrote: audits_stale (audit_freshness_tick_10m) and
-- papers_hours_since_last_publish, ideas_hours_since_last_proposal and social_hours_since_last_post (publish_freshness_tick).
-- Every 20 minutes it computes each value with the trigger's own SQL, writes it when the trigger path is stale (30 and 90
-- minutes) and records it beside the registry's otherwise; its first clean run moves the two spof_registry rows to
-- spof_registry_resolved. CHAOS-DRILL-1 keeps testing that alternate every 6 hours through the two probe rows below, which read
-- the step's own ledger; a failure files CHAOS-DRILL-FAILED-1 for the component.
INSERT OR IGNORE INTO spof_alternate_probes (component, probe_sql, exercise, window_note, enabled, created_at) VALUES
  ('audits_stale refresher',
   'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''metric-refresher-2'' AND status = ''ok'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-1 hour'')) THEN ''ok'' ELSE ''no clean METRIC-REFRESHER-2 run in the last hour'' END AS observed',
   NULL, '1 h: qnfo-fleet-control METRIC-REFRESHER-2 runs every 20 minutes', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('publish freshness metrics',
   'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''metric-refresher-2'' AND status = ''ok'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-1 hour'')) THEN ''ok'' ELSE ''no clean METRIC-REFRESHER-2 run in the last hour'' END AS observed',
   NULL, '1 h: qnfo-fleet-control METRIC-REFRESHER-2 runs every 20 minutes', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a metric written only by one D1 trigger has a single point of failure; a worker cron that computes the same SQL and takes over when the trigger is stale is a tested second path once it has run clean',
   'METRIC-REFRESHER-2: qnfo-fleet-control 0.25.0 computes audits_stale and the three publish-freshness metrics every 20 minutes (write when stale, shadow otherwise) and moves their two spof_registry rows to spof_registry_resolved after a clean run; CHAOS-DRILL-1 probes added',
   'spof_registry 06:50 UTC: 4 rows, two of them the triggers audit_freshness_tick_10m and publish_freshness_tick; the step''s four SELECTs run on qnfo-audit at 06:58 UTC give 0, 0.2, 0.5 and 30.4, matching the registry within its refresh age',
   'merged through the canonical path', 'spofs_total 4 -> 2 after the first clean run; a stalled fleet_tick no longer freezes these four metrics', 'revert qnfo-fleet-control 0.25.0 and the Rollback line of this file; reinsert the rows from spof_registry_resolved',
   'four freshness metrics survive a stalled fleet_tick trigger path', 'spofs_total reads 2 at the next metric tick after 0.25.0 deploys; the CHAOS-DRILL-1 probes pass', 'none', 'd1:spof_registry, metric_registry, v_audit_stale, research_queue, idea_proposals, social_media_posts');
