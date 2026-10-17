-- AGENT-ISSUES-TRIGGER-DEPTH-2 (2026-10-17, pillar reliability; recurrence of D1-TRIGGER-DEPTH-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- D1 refuses any write whose trigger programs nest more than 10 levels, counted at compile time, and self-updating
-- triggers count. agent_issues has regrown to ~33 triggers, of which ~14 self-UPDATE agent_issues (the 8 timestamp
-- normalisers, the 2 timestamp defaulters, predicate_default, directive_newline, evidence_annotate, recheck_count).
-- The remediation_verifications INSERT path (autoclose_ins -> INSERT issue_triage -> triage_close_sync_issue_ins ->
-- UPDATE agent_issues -> the timestamp normalisers -> ...) exceeds the limit, so every self-heal verification write
-- fails with "triggers nested too deep" (SQLITE_ERROR 7500). Last verification write 2026-10-17 14:40Z;
-- remediation_tick_age_min=300 vs target <=20. Measured live 2026-10-17: INSERT/UPDATE on remediation_verifications
-- both refused; agent_issues/issue_triage/mettic_registry probes compile.
-- FIX: fold the 10 timestamp triggers (8 normalisers + 2 defaulters) into 2 triggers (one AFTER INSERT, one
-- AFTER UPDATE OF created_at, updated_at) that normalise both columns in one pass. Behaviour is bit-identical
-- (validated against the 10 originals on a scratch table: null/text/secs/ms and the UPDATE path all agree).
-- Rollback: recreate the 10 triggers from bak_20261017_agent_issues_ts_triggers (name, sql) by hand; no data is touched.
-- BACKUP: bak_20261017_agent_issues_ts_triggers

CREATE TABLE IF NOT EXISTS bak_20261017_agent_issues_ts_triggers AS
SELECT name, tbl_name, sql FROM sqlite_master
WHERE type = 'trigger' AND tbl_name = 'agent_issues'
  AND name IN (
    'agent_issues_created_at_default_ins','agent_issues_created_at_norm_ins','agent_issues_created_at_norm_secs_ins',
    'agent_issues_created_at_norm_upd','agent_issues_created_at_norm_secs_upd',
    'agent_issues_updated_at_default_ins','agent_issues_updated_at_norm_ins','agent_issues_updated_at_norm_secs_ins',
    'agent_issues_updated_at_norm_upd','agent_issues_updated_at_norm_secs_upd'
  );

DROP TRIGGER IF EXISTS agent_issues_created_at_default_ins;
DROP TRIGGER IF EXISTS agent_issues_created_at_norm_ins;
DROP TRIGGER IF EXISTS agent_issues_created_at_norm_secs_ins;
DROP TRIGGER IF EXISTS agent_issues_created_at_norm_upd;
DROP TRIGGER IF EXISTS agent_issues_created_at_norm_secs_upd;
DROP TRIGGER IF EXISTS agent_issues_updated_at_default_ins;
DROP TRIGGER IF EXISTS agent_issues_updated_at_norm_ins;
DROP TRIGGER IF EXISTS agent_issues_updated_at_norm_secs_ins;
DROP TRIGGER IF EXISTS agent_issues_updated_at_norm_upd;
DROP TRIGGER IF EXISTS agent_issues_updated_at_norm_secs_upd;

CREATE TRIGGER IF NOT EXISTS agent_issues_ts_norm_ins AFTER INSERT ON agent_issues
WHEN NEW.created_at IS NULL OR typeof(NEW.created_at)='text'
  OR (typeof(NEW.created_at)='integer' AND NEW.created_at > 0 AND NEW.created_at < 100000000000)
  OR NEW.updated_at IS NULL OR typeof(NEW.updated_at)='text'
  OR (typeof(NEW.updated_at)='integer' AND NEW.updated_at > 0 AND NEW.updated_at < 100000000000)
BEGIN
  UPDATE agent_issues SET
    created_at = CASE
      WHEN NEW.created_at IS NULL THEN CAST(strftime('%s','now') AS INTEGER)*1000
      WHEN typeof(NEW.created_at)='text' THEN COALESCE(CAST(strftime('%s', NEW.created_at) AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000)
      WHEN NEW.created_at > 0 AND NEW.created_at < 100000000000 THEN NEW.created_at*1000
      ELSE NEW.created_at END,
    updated_at = CASE
      WHEN NEW.updated_at IS NULL THEN CAST(strftime('%s','now') AS INTEGER)*1000
      WHEN typeof(NEW.updated_at)='text' THEN COALESCE(CAST(strftime('%s', NEW.updated_at) AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000)
      WHEN NEW.updated_at > 0 AND NEW.updated_at < 100000000000 THEN NEW.updated_at*1000
      ELSE NEW.updated_at END
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS agent_issues_ts_norm_upd AFTER UPDATE OF created_at, updated_at ON agent_issues
WHEN NEW.created_at IS NULL OR typeof(NEW.created_at)='text'
  OR (typeof(NEW.created_at)='integer' AND NEW.created_at > 0 AND NEW.created_at < 100000000000)
  OR NEW.updated_at IS NULL OR typeof(NEW.updated_at)='text'
  OR (typeof(NEW.updated_at)='integer' AND NEW.updated_at > 0 AND NEW.updated_at < 100000000000)
BEGIN
  UPDATE agent_issues SET
    created_at = CASE
      WHEN NEW.created_at IS NULL THEN CAST(strftime('%s','now') AS INTEGER)*1000
      WHEN typeof(NEW.created_at)='text' THEN COALESCE(CAST(strftime('%s', NEW.created_at) AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000)
      WHEN NEW.created_at > 0 AND NEW.created_at < 100000000000 THEN NEW.created_at*1000
      ELSE NEW.created_at END,
    updated_at = CASE
      WHEN NEW.updated_at IS NULL THEN CAST(strftime('%s','now') AS INTEGER)*1000
      WHEN typeof(NEW.updated_at)='text' THEN COALESCE(CAST(strftime('%s', NEW.updated_at) AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000)
      WHEN NEW.updated_at > 0 AND NEW.updated_at < 100000000000 THEN NEW.updated_at*1000
      ELSE NEW.updated_at END
  WHERE id = NEW.id;
END;
