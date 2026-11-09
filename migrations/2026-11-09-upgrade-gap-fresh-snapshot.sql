-- UPGRADE-GAP-FRESH-SNAPSHOT-1 (2026-11-09, charter pillar autonomy; issue 9640 / agent_issues 1002652, family PORTFOLIO-UPGRADE-1 reopened 33 times in 7 days).
-- Root cause: portfolio-gap-action files "PORTFOLIO-UPGRADE-1: advance compat_date for <worker>" (and the UPG-<worker> roadmap row) from the newest worker_compat_state row. That snapshot can be
-- older than a compat-advancing deploy (the 6 h throttle in qnfo-ops compatSnapshot; COMPAT-SNAPSHOT-FRESH-1 lifts it only on the next tick), so the producer re-filed against a live date that had
-- already advanced and the close/reopen loop ran. Change: both inserts skip a worker whose deployment_history holds a successful compat_date=old->new deploy newer than the snapshot row
-- (the same signal compatSnapshot uses to refresh), so only a snapshot taken after the newest advance can file. The next hourly snapshot re-reads https://ops.qnfo.org/compat truth.
-- Prediction: reopens of the PORTFOLIO-UPGRADE-1 family fall from 33 a week to 0.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261109_upgrade_gap_fresh
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261109_upgrade_gap_fresh WHERE id = 'portfolio-gap-action'), version = version + 1 WHERE id = 'portfolio-gap-action'
-- spof-review: one workflow definition edited in place; previous definition kept in the backup table.
-- CAUSE-MAPPED: registers no metric_registry row.

CREATE TABLE IF NOT EXISTS bak_20261109_upgrade_gap_fresh AS
SELECT id, definition, version FROM fleet_tasks WHERE id = 'portfolio-gap-action';

UPDATE fleet_tasks
SET definition = REPLACE(REPLACE(definition,
      'AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title=''PORTFOLIO-UPGRADE-1: advance compat_date for ''||w.worker AND a.status=''open'')',
      'AND NOT EXISTS (SELECT 1 FROM deployment_history dh WHERE dh.resource_name=w.worker AND dh.status=''success'' AND dh.notes LIKE ''%compat_date=%->%'' AND replace(substr(dh.deployed_at,1,19),''T'','' '') > replace(substr(w.checked_at,1,19),''T'','' '')) AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title=''PORTFOLIO-UPGRADE-1: advance compat_date for ''||w.worker AND a.status=''open'')'),
      'AND NOT EXISTS (SELECT 1 FROM roadmap_implementation r WHERE r.item=''UPG-''||w.worker)',
      'AND NOT EXISTS (SELECT 1 FROM deployment_history dh WHERE dh.resource_name=w.worker AND dh.status=''success'' AND dh.notes LIKE ''%compat_date=%->%'' AND replace(substr(dh.deployed_at,1,19),''T'','' '') > replace(substr(w.checked_at,1,19),''T'','' '')) AND NOT EXISTS (SELECT 1 FROM roadmap_implementation r WHERE r.item=''UPG-''||w.worker)'),
    version = version + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'portfolio-gap-action' AND json_valid(definition)
  AND instr(definition, 'dh.notes LIKE ''%compat_date=%->%''') = 0;
