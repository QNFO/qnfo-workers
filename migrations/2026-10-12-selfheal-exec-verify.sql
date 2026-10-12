-- SELFHEAL-EXEC-VERIFY-1 (2026-10-12, pillar autonomy; agent_issues 2121). 1,120 self_heal_actions rows sat at 'executed'
-- (fleet-execute 781, fleet-issue 291, feed-auto-exec 48; the newest 2026-10-08T14:16Z): the dispatcher recorded an HTTP 2xx
-- from the producer and nothing ever read whether the triggering condition cleared. The path in use since 2026-10-08 writes
-- verified or resolved itself; these rows are the stranded remainder. Each 'executed' row older than 6 hours is now judged by
-- one read of its condition in fleet_issue_loop (ref = fingerprint or 'iss-' || fingerprint), and the claim names that read:
--   verified-failed  the condition was seen again after the action (last_seen > ts);
--   verified         the loop row closed after the action and the condition was not seen since;
--   no-action        the loop row had already closed before the action ran and the condition was not seen since (redundant);
--   unverifiable     no loop row holds a condition to read (the 48 September feed-auto-exec rows).
-- Read 2026-10-12: 24 verified-failed, 270 verified, 778 redundant, 48 unverifiable. The trigger runs hourly off fleet_tick, so a
-- future 'executed' row is judged within 6-7 hours; the migration's own tick row judges the backlog now.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS selfheal_exec_verify_tick; UPDATE self_heal_actions SET status = 'executed', verified_at = NULL, claim = (SELECT b.claim FROM bak_20261012_selfheal_executed b WHERE b.id = self_heal_actions.id) WHERE id IN (SELECT id FROM bak_20261012_selfheal_executed)

CREATE TABLE IF NOT EXISTS bak_20261012_selfheal_executed AS SELECT * FROM self_heal_actions WHERE status = 'executed';

CREATE TRIGGER IF NOT EXISTS selfheal_exec_verify_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:selfheal-exec-verify%'
BEGIN
  UPDATE self_heal_actions SET status = 'verified-failed', verified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    claim = 'SELFHEAL-EXEC-VERIFY-1: fleet_issue_loop ' || ref || ' was seen again after this action (last_seen later than ts)'
  WHERE status = 'executed' AND replace(substr(ts, 1, 19), 'T', ' ') < datetime('now', '-6 hours')
    AND EXISTS (SELECT 1 FROM fleet_issue_loop l WHERE (l.fingerprint = self_heal_actions.ref OR 'iss-' || l.fingerprint = self_heal_actions.ref)
      AND replace(substr(l.last_seen, 1, 19), 'T', ' ') > replace(substr(self_heal_actions.ts, 1, 19), 'T', ' '));
  UPDATE self_heal_actions SET status = 'verified', verified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    claim = 'SELFHEAL-EXEC-VERIFY-1: fleet_issue_loop ' || ref || ' closed after this action and was not seen since'
  WHERE status = 'executed' AND replace(substr(ts, 1, 19), 'T', ' ') < datetime('now', '-6 hours')
    AND EXISTS (SELECT 1 FROM fleet_issue_loop l WHERE (l.fingerprint = self_heal_actions.ref OR 'iss-' || l.fingerprint = self_heal_actions.ref)
      AND l.dispatch_state = 'closed' AND l.closed_at IS NOT NULL
      AND replace(substr(l.closed_at, 1, 19), 'T', ' ') > replace(substr(self_heal_actions.ts, 1, 19), 'T', ' '));
  UPDATE self_heal_actions SET status = 'no-action', verified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    claim = 'SELFHEAL-EXEC-VERIFY-1: redundant; fleet_issue_loop ' || ref || ' had already closed before this action and was not seen since'
  WHERE status = 'executed' AND replace(substr(ts, 1, 19), 'T', ' ') < datetime('now', '-6 hours')
    AND EXISTS (SELECT 1 FROM fleet_issue_loop l WHERE (l.fingerprint = self_heal_actions.ref OR 'iss-' || l.fingerprint = self_heal_actions.ref)
      AND l.closed_at IS NOT NULL AND replace(substr(l.closed_at, 1, 19), 'T', ' ') <= replace(substr(self_heal_actions.ts, 1, 19), 'T', ' '));
  UPDATE self_heal_actions SET status = 'unverifiable', verified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    claim = 'SELFHEAL-EXEC-VERIFY-1: no fleet_issue_loop row holds the condition for ' || COALESCE(ref, '(no ref)') || ', so nothing can be read'
  WHERE status = 'executed' AND replace(substr(ts, 1, 19), 'T', ' ') < datetime('now', '-6 hours')
    AND NOT EXISTS (SELECT 1 FROM fleet_issue_loop l WHERE l.fingerprint = self_heal_actions.ref OR 'iss-' || l.fingerprint = self_heal_actions.ref);
END;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('selfheal-executed-unverified', 'a self-heal action stays executed and is never verified',
  'the dispatcher recorded the producer''s HTTP 2xx and no step read whether the triggering condition cleared',
  'SELFHEAL-EXEC-VERIFY-1: an hourly fleet_tick trigger judges every executed row older than 6 h from fleet_issue_loop',
  'no executed self_heal_actions row is older than 1 day', 'fm-selfheal-executed-unverified', '2026-10-12', 2121,
  'a self-heal dispatch whose producer answers 2xx', 'executed rows piling up; the SAI heal term blind to failed fixes', 'self-improvement scored on unverified claims');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-selfheal-executed-unverified', NULL, 'SELFHEAL-EXEC-VERIFY-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM self_heal_actions WHERE status = ''executed'' AND replace(substr(ts, 1, 19), ''T'', '' '') < datetime(''now'', ''-1 day'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO fleet_tick (source) VALUES ('migration:selfheal-exec-verify');
