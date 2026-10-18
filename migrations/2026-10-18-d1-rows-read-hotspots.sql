-- D1-ROWS-READ-HOTSPOTS-1 (2026-10-18, owner directive "AUDIT BOTTLENECKS AND INEFFICIENCIES SYSTEMWIDE ... REMEDIATE
-- AUTOMATICALLY, PERMANENTLY, AND ROBUSTLY").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP the idx_* indexes named below (each is additive, no data change) and re-create autonomy_selfheal_tick from
--           migrations/2026-10-14-sla-120m-6-doer-120m.sql.
-- BACKUP: bak_20261018_autonomy_selfheal_tick
-- spof-review: rewrite of an existing fleet_tick trigger (same inputs/outputs, no new dependency); the remediation tick in qnfo-fleet-control and scripts/metric refresh are the second path for these metrics.
-- Measured on qnfo-audit (D1 GraphQL d1QueriesAdaptiveGroups, 24 h to 2026-10-18T08:40Z, ranked by rows read):
--   1. INSERT INTO fleet_tick (cron:qnfo-fleet-dashboard / cron:qnfo-code-orchestrator): 287 M rows read in 474 inserts,
--      ~1.08 M rows read and ~0.9 s per insert. Profiled trigger by trigger: autonomy_selfheal_tick = 1.0 M of it
--      (open_issues_without_doer_* 862 K: full work_claims scans per open issue; remediation_tick_age_min 133 K: a LIKE
--      over every remediation_verifications row). Every other fleet_tick trigger reads < 14 K.
--   2. analytics_action_log lookups by trigger_id (~48 K calls/day, 90 M rows): no index on trigger_id.
--   3. research_queue x idea_proposals join on CAST(p.id AS TEXT) (80 M rows): no expression index.
--   4. cloud_ops_events error/latest scans (v_loop_breaker_signatures 133 K rows per probe, MAX(ts), tool_error_rate_filer
--      67 K rows per ops_ai_tool insert): no (status, ts), (ts) or (kind, text, ts) index.
--   5. reach_signals / fleet_probe_log / fleet_deploys / work_claims group-by and lookups without covering indexes.
-- After (same probes, live): fleet_tick insert 1.08 M -> ~0.29 M rows (then remediation_tick_age_min 133 K -> 476 below);
-- analytics_action_log lookups -> 0-1 rows; v_loop_breaker_signatures 133 K -> 481; tool_error filer COUNT 67 K -> 0;
-- MAX(ts) 121 K -> 1; research_queue join 80 M/day -> 2.3 K per call.
-- Indexes are additive; the trigger rewrite returns the same value (verified: 6 min both ways at 2026-10-18T09:1xZ).

CREATE INDEX IF NOT EXISTS idx_coe_status_ts ON cloud_ops_events(status, ts);
CREATE INDEX IF NOT EXISTS idx_coe_kind_text_ts ON cloud_ops_events(kind, text, ts);
CREATE INDEX IF NOT EXISTS idx_coe_ts ON cloud_ops_events(ts);
CREATE INDEX IF NOT EXISTS idx_aal_trigger_id ON analytics_action_log(trigger_id, id);
CREATE INDEX IF NOT EXISTS idx_aal_trigger_fired ON analytics_action_log(trigger_id, fired_at);
CREATE INDEX IF NOT EXISTS idx_ip_id_text ON idea_proposals(CAST(id AS TEXT));
CREATE INDEX IF NOT EXISTS idx_rq_status ON research_queue(status);
CREATE INDEX IF NOT EXISTS idx_rs_source_type_metric_date ON reach_signals(source, entity_type, metric, date);
CREATE INDEX IF NOT EXISTS idx_rs_entity ON reach_signals(channel, entity_type, entity_id, metric, date);
CREATE INDEX IF NOT EXISTS idx_fpl_name_transport_ts ON fleet_probe_log(name, transport, ts);
CREATE INDEX IF NOT EXISTS idx_fdeploy_worker_ok ON fleet_deploys(worker, ok, ts);
CREATE INDEX IF NOT EXISTS idx_rv_action_ref ON remediation_verifications(action_ref, id);
CREATE INDEX IF NOT EXISTS idx_rv_verifier_ts ON remediation_verifications(verifier, verified_at);
CREATE INDEX IF NOT EXISTS idx_work_claims_path_open ON work_claims(path, released_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_work_claims_open ON work_claims(released_at, expires_at);
-- Second pass (2026-10-18 09:4xZ, same probes, values unchanged): v_trust runtime share 151 K -> 36 K; reach_signals
-- work-with-me MAX(collected_at) 323 -> 1; notes_intake area list 6.6 K -> 2; research_queue 72 h join 1.9 K -> 1.3 K.
CREATE INDEX IF NOT EXISTS idx_rv_verified_norm ON remediation_verifications(replace(substr(verified_at, 1, 19), 'T', ' '));
CREATE INDEX IF NOT EXISTS idx_rq_created_norm ON research_queue(replace(substr(created_at, 1, 19), 'T', ' '));
CREATE INDEX IF NOT EXISTS idx_rq_created ON research_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_worker_logs_ingested ON worker_logs(ingested_at);
CREATE INDEX IF NOT EXISTS idx_rs_source_collected ON reach_signals(source, collected_at);
CREATE INDEX IF NOT EXISTS idx_notes_intake_type_status ON notes_intake(type, status);
-- container freshness probe (qnfo-containers-pilot, ~50 calls/h at 131 K rows each): partial index on the LIKE predicate;
-- 5 231 -> 5 rows for LIMIT 5, results identical to a NOT INDEXED scan for LIMIT 5 and LIMIT 500.
CREATE INDEX IF NOT EXISTS idx_coe_container_ts ON cloud_ops_events(ts) WHERE kind LIKE 'container.%';

CREATE TABLE IF NOT EXISTS bak_20261018_autonomy_selfheal_tick AS SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name = 'autonomy_selfheal_tick';
DROP TRIGGER IF EXISTS autonomy_selfheal_tick;
CREATE TRIGGER autonomy_selfheal_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at <= (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
        AND instr(COALESCE(a.description, ''), 'code-task:') = 0
        AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human'))
        AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL
                          AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS TEXT)
  WHERE metric = 'open_issues_without_doer_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at <= (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
        AND instr(COALESCE(a.description, ''), 'code-task:') = 0
        AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human'))
        AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL
                          AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS TEXT)
  WHERE metric = 'open_issues_without_doer_120m';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(DISTINCT a.id) FROM agent_issues a JOIN remediation_contracts c ON c.issue_id = a.id AND c.status IN ('active', 'holding')
      WHERE a.status = 'open' AND (COALESCE(c.last_verdict, '') IN ('vacuous-probe-result', 'probe-not-machine-executable', 'probe-error', 'probe-same-account-host')
            OR instr(c.verify_probe, 'THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ') > 0)) AS TEXT)
  WHERE metric = 'contracts_unexecutable_open';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(CAST(ROUND((julianday('now') - julianday((SELECT verified_at FROM remediation_verifications INDEXED BY idx_remediation_verifications_ts
      WHERE verifier LIKE 'qnfo-fleet-control/remediation-tick%' ORDER BY verified_at DESC LIMIT 1))) * 1440) AS INTEGER), 9999)) AS TEXT)
  WHERE metric = 'remediation_tick_age_min';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(CASE WHEN COALESCE(a.close_channel, '') NOT LIKE 'session%' AND COALESCE(a.close_channel, '') NOT LIKE 'claude%'
                                   AND COALESCE(a.close_channel, '') NOT LIKE 'issue-triage%'
                                   AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id
                                                   AND (COALESCE(t.owner, '') LIKE 'session%' OR COALESCE(t.owner, '') LIKE 'claude%'))
                              THEN 1 ELSE 0 END) / MAX(1, COUNT(*)), 3)
      FROM agent_issues a WHERE a.status IN ('closed', 'resolved') AND a.updated_at > (CAST(strftime('%s', 'now') AS INTEGER) - 604800) * 1000) AS TEXT)
  WHERE metric = 'server_side_close_share_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(ROUND(100.0 * (
        MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'autonomy_rate_7d'), 0)))
      + MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'server_side_close_share_7d'), 0)))
      + MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'issue_auto_close_2h_share_24h'), 0)))
      + MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'issue_drain_ratio_24h'), 0) / 1.5))
      + MIN(1.0, MAX(0.0, (120.0 - COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'remediation_tick_age_min'), 120)) / 100.0))
      + MAX(0.0, 1.0 - COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'contracts_unexecutable_open'), 10) / 10.0)
      + MAX(0.0, 1.0 - COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'open_issues_without_doer_120m'), 0)
                       / MAX(1.0, (SELECT COUNT(*) FROM agent_issues WHERE status = 'open')))
    ) / 7.0, 1) AS TEXT)
  WHERE metric = 'autonomy_selfheal_score';
END;

ANALYZE;
