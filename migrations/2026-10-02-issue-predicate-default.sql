-- ISSUE-PREDICATE-ON-FILE-1 (agent_issues 1828, 2026-10-02, pillar: autonomy). Record of a trigger applied live; idempotent.
--
-- The problem (measured 2026-10-02 ~10:40Z): 40 open agent_issues had predicate_id NULL. qnfo-fleet-control filed 19
-- of them and direct D1 inserts by sessions about 20, because neither path assigns a predicate. #1282 (closed) requires
-- every open issue to carry one, and its corrected probe failed with observed=40.
--
-- The fix, lever (2) of the issue: an AFTER INSERT trigger defaults a NULL predicate_id to the issue's class prefix,
-- which is the title up to its first colon (capped at 80 characters), or the first 80 characters of a title with no
-- colon. Every filing path is covered, the worker filers and session inserts alike, so no worker change is needed. A
-- filer that sets predicate_id itself is untouched. A concurrent session applied the trigger live and backfilled the
-- open rows. This file is the repository record, so a rebuilt qnfo-audit gets the same rule. Its SQL matches
-- sqlite_master as read on 2026-10-02 10:52Z.
--
-- Verified live 2026-10-02 10:52Z: 0 of 72 open agent_issues with predicate_id NULL. Issues 1829-1831, filed after
-- the trigger, carry their title prefix. The remediation contract issue-1828 probes "0 open issues with predicate_id
-- NULL created in the last 24h", so the hourly remediation tick closes 1828 when that holds.
--
-- Rollback: DROP TRIGGER agent_issues_predicate_default_ins;

CREATE TRIGGER IF NOT EXISTS agent_issues_predicate_default_ins AFTER INSERT ON agent_issues WHEN NEW.predicate_id IS NULL BEGIN UPDATE agent_issues SET predicate_id = CASE WHEN instr(NEW.title,':')>1 THEN substr(NEW.title,1,MIN(instr(NEW.title,':')-1,80)) ELSE substr(NEW.title,1,80) END WHERE id = NEW.id; END;

-- One-time backfill of open rows filed before the trigger (no-op once applied).
UPDATE agent_issues
   SET predicate_id = CASE WHEN instr(title,':')>1 THEN substr(title,1,MIN(instr(title,':')-1,80)) ELSE substr(title,1,80) END
 WHERE status = 'open' AND predicate_id IS NULL;
