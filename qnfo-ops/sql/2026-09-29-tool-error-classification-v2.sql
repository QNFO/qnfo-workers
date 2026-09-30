-- TOOL-FAILURE-CLASSIFY-2 (2026-09-29)
-- Supersedes TOOL-FAILURE-CLASSIFY-1 (trigger tool_error_files_issue, 2026-09-29 morning).
--
-- PROBLEM WITH v1: the exclusion set was a hardcoded chain of ~13
--   `COALESCE(NEW.meta,'') NOT LIKE '%...%'` clauses. Any error class not
--   anticipated at authoring time kept filing noise tickets. Observed: the
--   `unknown tool: X` class (client-side tool names persisted into the ops audit
--   log) was absent from the list, so 5 noise tickets (save_memory, delete_memory,
--   read_file, exec, execute) were auto-filed for a non-defect. Extending the list
--   required a trigger DDL change.
--
-- FIX: the exclusion set becomes DATA, not DDL. The trigger consults
--   tool_error_exclusions via `instr()` (substring match, deterministic, no LIKE
--   wildcard escaping hazards). Adding a new benign class is now a one-row INSERT
--   by any agent, with no schema change and no redeploy.
--
-- SAFETY: applied as tool_error_files_issue_v2 FIRST, verified, and only then is
--   the v1 trigger dropped - so there is never a window with no filing protection.
--
-- ADVERSARIAL / KNOWN LIMITATION: exclusion is a substring match on meta+text. A
--   genuine error whose message happens to contain an excluded substring (e.g. an
--   unrelated error mentioning "HTTP 500" in prose) would be suppressed. Mitigation:
--   err_class is recorded per pattern so the audit can quantify how much is being
--   suppressed, and the `same-zone-fetch` / `upstream-availability` classes are the
--   only broad ones. Re-audit monthly; a class that suppresses a real defect must be
--   narrowed rather than deleted.

CREATE TABLE IF NOT EXISTS tool_error_exclusions (
  pattern   TEXT PRIMARY KEY,
  err_class TEXT NOT NULL,
  rationale TEXT,
  added_at  TEXT DEFAULT (datetime('now'))
);

DROP TRIGGER IF EXISTS tool_error_files_issue_v2;
CREATE TRIGGER tool_error_files_issue_v2
AFTER INSERT ON cloud_ops_events
WHEN NEW.kind = 'ops_ai_tool'
 AND NEW.status = 'error'
 AND NOT EXISTS (
   SELECT 1 FROM tool_error_exclusions e
   WHERE instr(COALESCE(NEW.meta, ''), e.pattern) > 0
      OR instr(COALESCE(NEW.text, ''), e.pattern) > 0
 )
BEGIN
  INSERT OR IGNORE INTO agent_issues
    (title, description, source, category, priority, status, created_at, updated_at)
  SELECT
    'TOOL-FAILURE: ' || NEW.text || ' [error]',
    'Auto-filed by trigger tool_error_files_issue_v2 (TOOL-FAILURE-CLASSIFY-2, 2026-09-29). '
      || 'Only error classes ABSENT from tool_error_exclusions reach this branch, i.e. genuine '
      || 'residual failures. Evidence: cloud_ops_events id=' || NEW.id
      || ' ts=' || NEW.ts
      || ' job=' || COALESCE(NEW.job, '-')
      || ' tool=' || NEW.text
      || ' meta=' || COALESCE(substr(NEW.meta, 1, 500), '-'),
    'cloud_ops_events:' || NEW.id,
    'observability', 'medium', 'open',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE NOT EXISTS (
    SELECT 1 FROM agent_issues a
    WHERE a.status = 'open'
      AND lower(trim(a.title)) = lower(trim('TOOL-FAILURE: ' || NEW.text || ' [error]'))
  );
END;
