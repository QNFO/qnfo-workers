-- CLOSE-CHANNEL-REQUIRED-1 part 2 (2026-10-21, agent_issues 100419, pillar autonomy).
-- WHY: triage_close_sync_issue_ins/_upd close agent_issues whenever an issue_triage row reaches closed/closed-refuted/wontfix, and
--      write no close_channel. Every worker close that goes through issue_triage (backlog-exec, lifecycle, fleet-control ticks,
--      sessions) therefore landed with close_channel NULL: 449 of 900 closes in the 7 days to 2026-10-21. Observed live at
--      14:20Z: agent_issues 100420 closed through this trigger with close_channel NULL.
-- WHAT: both triggers keep their WHEN clause and status mapping and now set close_channel when the issue has none:
--      'auto:triage-sync:' || issue_triage.owner (or 'auto:triage-sync' when no owner). A channel already set is never overwritten.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261021_triage_close_sync_triggers
-- Rollback: recreate both triggers from bak_20261021_triage_close_sync_triggers (DROP TRIGGER, then run each saved sql)
-- runtime-probe (D1): SELECT COUNT(*) FROM agent_issues WHERE status IN ('closed','resolved','wontfix') AND close_channel IS NULL AND updated_at > <applied_ms> -- expected 0

CREATE TABLE IF NOT EXISTS bak_20261021_triage_close_sync_triggers AS SELECT type, name, tbl_name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at FROM sqlite_master WHERE type = 'trigger' AND name IN ('triage_close_sync_issue_ins', 'triage_close_sync_issue_upd');

DROP TRIGGER IF EXISTS triage_close_sync_issue_upd;
CREATE TRIGGER IF NOT EXISTS triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END), updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;

DROP TRIGGER IF EXISTS triage_close_sync_issue_ins;
CREATE TRIGGER IF NOT EXISTS triage_close_sync_issue_ins AFTER INSERT ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END), updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;
