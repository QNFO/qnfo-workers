-- INHOUSE-PUBLISH-3 release (2026-10-09, pillar research). Ships with qnfo-research-exec 0.10.4 (same PR). A session held
-- research_queue row c28e027e (status held, error 'PUBLISH-RECORD-UNDEFINED-1 ...') because 0.10.3 failed every publish tick
-- with D1_TYPE_ERROR; its revert text says: status review, stage publish. Releasing it at merge could hand it to 0.10.3 if the
-- migration lands before the deploy, so the release waits for the worker's own heartbeat to report a version past 0.10.3 and
-- runs on the 10-minute fleet_tick (same depth as scorecard_v2_tick; no trigger on fleet_heartbeat, D1-TRIGGER-DEPTH-1). It
-- touches only rows held for this reason, so after the first release it is a no-op.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS publish_record_release_tick;

CREATE TRIGGER IF NOT EXISTS publish_record_release_tick AFTER INSERT ON fleet_tick
WHEN EXISTS (SELECT 1 FROM fleet_heartbeat WHERE worker = 'qnfo-research-exec'
             AND version NOT LIKE '0.9.%' AND version NOT LIKE '0.10.0%' AND version NOT LIKE '0.10.1-%'
             AND version NOT LIKE '0.10.2-%' AND version NOT LIKE '0.10.3-%')
 AND EXISTS (SELECT 1 FROM research_queue WHERE status = 'held' AND error LIKE 'PUBLISH-RECORD-UNDEFINED-1%')
BEGIN
  UPDATE research_queue SET status = 'review', stage = 'publish', claimed_at = NULL,
         error = 'INHOUSE-PUBLISH-3 ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ': released to publish after the 0.10.4 heartbeat. Was: ' || error
  WHERE status = 'held' AND error LIKE 'PUBLISH-RECORD-UNDEFINED-1%';
END;
