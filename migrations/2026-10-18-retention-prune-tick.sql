-- RETENTION-PRUNE-1 (2026-10-18, owner directive "AUDIT BOTTLENECKS AND INEFFICIENCIES SYSTEMWIDE ... PERMANENTLY").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS retention_prune_tick;  (or set ops_config retention_prune = 'off' to pause without a deploy)
-- Measured 2026-10-18: qnfo-audit 492 MB; nothing anywhere deletes from cloud_ops_events (132 K rows, 35 MB, 66 K of them
-- ops_ai_tool telemetry older than 14 days) or fleet_probe_log (117 K rows, 8.3 K/day). Every view and trigger that reads them
-- is windowed at <= 30 days (tool_error_rate 24 h, v_trust_ledger 30 d, loop-breaker 24 h) or uses MAX(ts) per key
-- (v_probe_freshness), so rows past 35 / 21 days are pure scan cost and storage growth.
-- Mechanism: hourly-gated fleet_tick trigger (same gate as the other hourly ticks), bounded to 3000 rows per table per hour,
-- only the high-volume ephemeral kinds of cloud_ops_events, and fleet_probe_log always keeps the newest row per
-- (name, transport) so freshness views never lose a key. Neither table has a DELETE trigger, so nesting depth is +1.
-- Audit/evidence tables (remediation_verifications, agent_issues, issue_lifecycle, chatbox_conversations) are NOT pruned:
-- views count their full history and the chat log is owner data.

CREATE TRIGGER IF NOT EXISTS retention_prune_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' AND COALESCE((SELECT value FROM ops_config WHERE key = 'retention_prune'), 'on') <> 'off'
BEGIN
  DELETE FROM cloud_ops_events WHERE id IN (SELECT id FROM cloud_ops_events INDEXED BY idx_coe_ts
    WHERE ts < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-35 days')
      AND kind IN ('ops_ai_tool', 'heartbeat', 'idle', 'container.sh', 'container.exec', 'container.workspace_exec', 'container.git_clone')
    LIMIT 3000);
  DELETE FROM fleet_probe_log WHERE id IN (SELECT p.id FROM fleet_probe_log p INDEXED BY idx_fpl_ts
    WHERE p.ts < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-21 days')
      AND EXISTS (SELECT 1 FROM fleet_probe_log q INDEXED BY idx_fpl_name_transport_ts WHERE q.name = p.name AND q.transport = p.transport AND q.ts > p.ts)
    LIMIT 3000);
END;
