-- SOTA-SCAN-CAP-1 (2026-11-12, charter pillar autonomy; follow-up to SOTA-SCAN-1 and MARKET-SCOUT-1).
-- Measured 2026-11-12 20:50Z: the first domain-managers tick after SOTA-SCAN-1 (20:46, run 105894, 23 steps ok) inserted no sota-scan and no market-scan request. Cause: the
-- COST-LEVERS-1 trigger cf_agent_requests_manager_cap_bi counts 48 program-manager:* requests in 24 h (QNFO.OPS 31, mostly doer, lever and parked loops) = manager_agent_daily_cap 48,
-- so RAISE(IGNORE) dropped both scans silently. v_sota_scan was empty, product_competitors had 0 rows. A scan is at most 5 requests a day and is the fleet's outward-looking input,
-- so the cap now exempts instances roadmap-<program>-sota-<day> and roadmap-<program>-comp-<day>; every other program-manager request stays capped (cost lever unchanged).
-- Prediction: v_sota_scan holds a row (proposal from a cited source URL) within 24 h of this migration; cf_agent_requests has instance roadmap-QNFO.OPS-sota-<day>.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261112_manager_cap_trigger
-- Rollback: DROP TRIGGER IF EXISTS cf_agent_requests_manager_cap_bi; CREATE TRIGGER cf_agent_requests_manager_cap_bi BEFORE INSERT ON cf_agent_requests WHEN NEW.requester >= 'program-manager:' AND NEW.requester < 'program-manager;' AND (SELECT COUNT(*) FROM cf_agent_requests WHERE id > (SELECT COALESCE(MAX(id), 0) FROM cf_agent_requests) - 700 AND requester >= 'program-manager:' AND requester < 'program-manager;' AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')) >= CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'manager_agent_daily_cap'), '48') AS INTEGER) BEGIN SELECT RAISE(IGNORE); END;
-- CAUSE-MAPPED: registers no metric_registry row.

CREATE TABLE IF NOT EXISTS bak_20261112_manager_cap_trigger AS SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name = 'cf_agent_requests_manager_cap_bi';

DROP TRIGGER IF EXISTS cf_agent_requests_manager_cap_bi;
CREATE TRIGGER cf_agent_requests_manager_cap_bi BEFORE INSERT ON cf_agent_requests
WHEN NEW.requester >= 'program-manager:' AND NEW.requester < 'program-manager;'
 AND COALESCE(NEW.instance, '') NOT LIKE 'roadmap-%-sota-%'
 AND COALESCE(NEW.instance, '') NOT LIKE 'roadmap-%-comp-%'
 AND (SELECT COUNT(*) FROM cf_agent_requests
      WHERE id > (SELECT COALESCE(MAX(id), 0) FROM cf_agent_requests) - 700
        AND requester >= 'program-manager:' AND requester < 'program-manager;'
        AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day'))
     >= CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'manager_agent_daily_cap'), '48') AS INTEGER)
BEGIN
  SELECT RAISE(IGNORE);
END;
