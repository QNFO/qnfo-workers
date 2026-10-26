-- BP26-SQL-PRODUCERS-1 (2026-10-26, charter pillar autonomy; owner directive 2026-10-26 BP26 catalogue; breach bp26_metrics_unmeasured, trigger 14541).
-- WHAT WAS WRONG: bp26_metrics_unmeasured read 56. Its trigger action says the lever is "build the producer named in each metric's
-- source_of_truth (a D1 trigger on fleet_tick_heavy for qnfo-audit data ...); never write a value by hand". Three of the 56 name
-- qnfo-audit tables that already hold the input, and no producer existed for them (git grep on origin/main 2026-10-26: no hit outside the
-- catalogue migration and docs/BEST-PRACTICES-2026.md):
--   orphaned_leases           work_claims rows past expires_at and not released                      (guard, target 0)
--   compat_date_age_days_max  oldest live compatibility_date of any worker in its latest snapshot, whole days   (guard, target <= 90)
--   agent_pr_revert_rate      code-loop pull requests merged in 30 days whose revert candidate merged / all merged  (guard, target <= 0.1)
-- WHAT THIS DOES: one trigger on fleet_tick_heavy (never fleet_tick: FLEET-TICK-SPLIT-1), each statement gated on its own metric being 50
-- minutes old so the 10-minute heavy heartbeat refreshes each hourly, and the same three statements once at apply so the metrics read now,
-- not after the first heavy tick. A statement whose input is empty writes nothing: unknown is never a value. The source_of_truth text
-- names the producer and keeps the [BP26] tag that bp26_headline_heavy_tick counts.
-- MEASURED 2026-10-26T16:2xZ against live qnfo-audit before this file was written (each SELECT below, read-only):
--   orphaned_leases 207 (239 unreleased of 6468 claims; oldest unreleased expiry 2026-10-25T07:26:11Z): a real breach, now visible.
--   compat_date_age_days_max 25 (36 workers in the 2026-10-26T16:02:12.838Z snapshot, oldest live_date 2026-10-01): inside the 90-day target.
--   agent_pr_revert_rate 0.0045 (1 merged revert of 223 code-loop merges since 2026-09-26; revert candidate 119 has merged_sha): inside the 0.1 target.
-- NOT BUILT HERE, and why (the other 53 stay unmeasured on purpose; each needs a probe, a CI step, a worker cron or another database):
--   deploy-ledger metrics (change_failure_rate, mttr_rollback_min_p95, deploys_via_gradual): fleet_deploys and deployment_history mix settings
--   reasserts, probes and mirrored copies and hold no incident, detection time or rollout percentage; pre_migration_bookmark_recorded and
--   gateway_coverage name a column that does not exist (migration_runs has no bookmark, ai_call_counters no route); slo_attainment_28d_min:
--   fleet_probe_log probes workers.dev hosts and three custom hosts, not the public surfaces; duplicate_side_effects: social_media_posts
--   .content_preview is a label ("roll-up of 15 papers"), a join on it counted three false duplicates; subscribers_with_consent_proof and the
--   mail metrics: the q08 and companion lists live in other databases (personal/research separation) and qnfo-audit.subscribers holds four rows;
--   repo scans (observability_enabled_share, workers_with_source_maps, kv_used_for_locking), CI steps, API polls and probes need a runner.
-- The orphaned_leases breach is the producer working, not a defect of it: 207 claims were left unreleased by sessions that ended without
-- POST /work-lock/release (CLAUDE.md, Work claims). The metric is a leak detector, so no sweeper is added here: one that stamped
-- released_at on every expired claim would zero the metric by erasing the evidence. Its BP26 trigger (analytics_metric_triggers
-- orphaned_leases, predicate BP26-LEASES-KILLSWITCH) files the ticket; the fix is that a session releases what it claims.
-- Revert: drop the trigger and null the three metrics (Rollback line); the metrics return to UNMEASURED and bp26_metrics_unmeasured to 56.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS bp26_sql_producers_heavy_tick; UPDATE metric_registry SET last_value = NULL, last_refreshed = NULL, state = 'UNMEASURED', source_of_truth = CASE metric WHEN 'orphaned_leases' THEN 'qnfo-audit.work_claims [BP26]' WHEN 'compat_date_age_days_max' THEN 'qnfo-audit.worker_compat_state (qnfo-ops compatSnapshot) [BP26]' ELSE 'code_tasks + revert ledger (to compute) [BP26]' END WHERE metric IN ('orphaned_leases', 'compat_date_age_days_max', 'agent_pr_revert_rate');
-- spof-review: fleet_tick_heavy has one producer until FLEET-TICK-HEAVY-SECOND-PRODUCER-1 lands; a missed heavy tick only delays these three metrics, and BP26 trigger staleness (metric_staleness_breach_rec) records the gap. Each statement reads one table once and the trigger adds no view.

UPDATE metric_registry SET source_of_truth = 'qnfo-audit.work_claims (released_at IS NULL and expires_at in the past), refreshed by trigger bp26_sql_producers_heavy_tick on fleet_tick_heavy [BP26]'
  WHERE metric = 'orphaned_leases';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.worker_compat_state (newest row per worker in the last 2 days, whole days since live_date), refreshed by trigger bp26_sql_producers_heavy_tick on fleet_tick_heavy [BP26]'
  WHERE metric = 'compat_date_age_days_max';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.code_tasks (merged_at in the last 30 days) joined to evolve_candidates (revert_cid with merged_sha): the code loop''s own merges, not session pull requests, refreshed by trigger bp26_sql_producers_heavy_tick on fleet_tick_heavy [BP26]'
  WHERE metric = 'agent_pr_revert_rate';

-- First measurement at apply (the same three statements the trigger runs, without the 50-minute gate).
UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM work_claims WHERE released_at IS NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) AS TEXT)
  WHERE metric = 'orphaned_leases';
UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT CAST(MAX(julianday('now') - julianday(w.live_date)) AS INTEGER) FROM worker_compat_state w
                        WHERE w.checked_at = (SELECT MAX(x.checked_at) FROM worker_compat_state x WHERE x.worker = w.worker)
                          AND w.checked_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')
                          AND w.live_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]') AS TEXT)
  WHERE metric = 'compat_date_age_days_max'
    AND EXISTS (SELECT 1 FROM worker_compat_state w WHERE w.checked_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')
                  AND w.live_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT ROUND(1.0 * SUM(CASE WHEN EXISTS (SELECT 1 FROM evolve_candidates ec WHERE ec.id = t.revert_cid AND ec.merged_sha IS NOT NULL AND trim(ec.merged_sha) <> '') THEN 1 ELSE 0 END) / COUNT(*), 4)
                        FROM code_tasks t WHERE t.merged_at IS NOT NULL AND t.merged_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')) AS TEXT)
  WHERE metric = 'agent_pr_revert_rate'
    AND EXISTS (SELECT 1 FROM code_tasks t WHERE t.merged_at IS NOT NULL AND t.merged_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days'));

-- Hourly refresh on the heavy heartbeat (one trigger, three gated statements).
CREATE TRIGGER IF NOT EXISTS bp26_sql_producers_heavy_tick AFTER INSERT ON fleet_tick_heavy
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT COUNT(*) FROM work_claims WHERE released_at IS NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) AS TEXT)
    WHERE metric = 'orphaned_leases' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT CAST(MAX(julianday('now') - julianday(w.live_date)) AS INTEGER) FROM worker_compat_state w
                          WHERE w.checked_at = (SELECT MAX(x.checked_at) FROM worker_compat_state x WHERE x.worker = w.worker)
                            AND w.checked_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')
                            AND w.live_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]') AS TEXT)
    WHERE metric = 'compat_date_age_days_max' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'))
      AND EXISTS (SELECT 1 FROM worker_compat_state w WHERE w.checked_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')
                    AND w.live_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT ROUND(1.0 * SUM(CASE WHEN EXISTS (SELECT 1 FROM evolve_candidates ec WHERE ec.id = t.revert_cid AND ec.merged_sha IS NOT NULL AND trim(ec.merged_sha) <> '') THEN 1 ELSE 0 END) / COUNT(*), 4)
                          FROM code_tasks t WHERE t.merged_at IS NOT NULL AND t.merged_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')) AS TEXT)
    WHERE metric = 'agent_pr_revert_rate' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'))
      AND EXISTS (SELECT 1 FROM code_tasks t WHERE t.merged_at IS NOT NULL AND t.merged_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days'));
END;
