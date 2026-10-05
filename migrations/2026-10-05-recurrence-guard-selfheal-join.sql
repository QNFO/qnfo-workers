-- RECURRENCE-GUARD-SELFHEAL-JOIN-1 (2026-10-05, agent_issues 1863, pillar core). Idempotent. Applied to qnfo-audit on 2026-10-05.
--
-- Issue 1297 fix (b) verified this predicate: no self_heal_actions row stays status='dispatched' with verified_at NULL once the
-- matching fleet_issue_dispatch row (fingerprint = ref) has reached a terminal state. fleet_tasks 'recurrence-guard' re-files
-- RECURRENCE-REVIOLATION-1 when that predicate breaks, but its SQL dropped the join: it fired on ANY dispatched row older than
-- 2h. A fleet-issue self-heal row stays dispatched while its remediation is in flight (resolved rows 2026-10-02..05: mean
-- 2.49h, max 4h from dispatch to verified_at), so the guard re-filed #1863 on normal in-flight work. Read 2026-10-05 16:15Z:
-- 3 dispatched rows, all three matching fleet_issue_dispatch rows in state 'queued' (in flight), 0 with a closed/done dispatch.
-- The guard keeps its 2h grace and now checks the predicate it names.
--
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT data FROM infra_state WHERE id = 'backup-recurrence-guard-20261005')
--           WHERE id = 'recurrence-guard';

INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-recurrence-guard-20261005', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'fleet_tasks-backup', definition
FROM fleet_tasks WHERE id = 'recurrence-guard';

UPDATE fleet_tasks
SET definition = replace(definition,
  'WHERE (SELECT COUNT(*) FROM self_heal_actions WHERE status=''dispatched'' AND verified_at IS NULL AND ts < strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-2 hours'')) > 0',
  'WHERE (SELECT COUNT(*) FROM self_heal_actions s WHERE s.status=''dispatched'' AND s.verified_at IS NULL AND s.ts < strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-2 hours'') AND EXISTS (SELECT 1 FROM fleet_issue_dispatch f WHERE f.fingerprint = s.ref AND f.state IN (''closed'',''done''))) > 0'),
    updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE id = 'recurrence-guard'
  AND instr(definition, 'WHERE (SELECT COUNT(*) FROM self_heal_actions WHERE status=''dispatched'' AND verified_at IS NULL AND ts < strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-2 hours'')) > 0') > 0;
