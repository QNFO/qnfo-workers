-- GAP-SKIP-RETIRED-WORKERS-1 (2026-11-09, charter pillar autonomy; agent_issues 1002751 and 1002747, worker qnfo-model-eval).
-- Root cause: portfolio-gap-action files "PORTFOLIO-UPGRADE-1: advance compat_date for <worker>" and the UPG-<worker> roadmap row from worker_compat_state without checking
-- service_registry. qnfo-model-eval is FOLDED (service_registry state 'retired'; its directory carries a FOLDED file), is never deployed, so no compat advance can ever clear the gap:
-- the issue re-files forever. Change: both inserts skip a worker whose service_registry state is 'retired'.
-- Prediction: PORTFOLIO-UPGRADE-1 issues filed against retired workers fall to 0 from the next hourly run.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261109_gap_skip_retired
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261109_gap_skip_retired WHERE id = 'portfolio-gap-action'), version = version + 1 WHERE id = 'portfolio-gap-action'
-- spof-review: one workflow definition edited in place; previous definition kept in the backup table.
-- CAUSE-MAPPED: registers no metric_registry row.

CREATE TABLE IF NOT EXISTS bak_20261109_gap_skip_retired AS
SELECT id, definition, version FROM fleet_tasks WHERE id = 'portfolio-gap-action';

UPDATE fleet_tasks
SET definition = REPLACE(definition,
      'AND NOT EXISTS (SELECT 1 FROM deployment_history dh WHERE dh.resource_name=w.worker',
      'AND NOT EXISTS (SELECT 1 FROM service_registry sr WHERE sr.service=w.worker AND sr.state=''retired'') AND NOT EXISTS (SELECT 1 FROM deployment_history dh WHERE dh.resource_name=w.worker'),
    version = version + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'portfolio-gap-action' AND json_valid(definition)
  AND instr(definition, 'sr.service=w.worker AND sr.state=''retired''') = 0;
