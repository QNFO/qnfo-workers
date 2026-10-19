-- REPO-SLUG-ANY-DEPTH-1 (2026-10-19, charter pillar: autonomy; agent_issues 100050, 100032).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_repo_slug_any_depth_v2
-- spof-review: the triggers are the second path, not a single one: qnfo-code-orchestrator repoSlug() (REPOSLUG-UNIFORM-1), scripts/code-task-publish.py repo_slug() and RED-DRAIN-1 step 3 (PR 2660) each normalise the slug on their own, and fm-code-task-repo-slug fails on any unfinished task whose repo still holds a slash
-- Rollback: DROP TRIGGER IF EXISTS code_tasks_repo_slug_upd; DROP TRIGGER IF EXISTS code_tasks_repo_slug_ai; CREATE TRIGGER code_tasks_repo_slug_ai AFTER INSERT ON code_tasks WHEN lower(substr(COALESCE(NEW.repo, ''), 1, 5)) = 'qnfo/' AND length(NEW.repo) > 5 AND instr(substr(NEW.repo, 6), '/') = 0 BEGIN UPDATE code_tasks SET repo = substr(NEW.repo, 6) WHERE id = NEW.id; END; UPDATE code_tasks SET repo = (SELECT b.repo FROM bak_20261019_repo_slug_any_depth_v2 b WHERE b.id = code_tasks.id) WHERE id IN (SELECT id FROM bak_20261019_repo_slug_any_depth_v2 WHERE kind = 'row'); UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_repo_slug_any_depth_rc b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_repo_slug_any_depth_rc); DELETE FROM failure_modes WHERE fm_key = 'code-task-repo-double-owner'
--
-- WHY (measured 2026-10-19 07:00Z)
-- LOOP-BREAKER issue 100050: "read failed: repo name refused for raw read (HTTP 400)" recurred 19 times in 24 h. ct_im100025
-- (RED-DRAIN-1 dispatch of issue 100025) had code_tasks.repo 'QNFO/QNFO/qnfo-workers': issue 100025's line read
-- 'code-task: repo=QNFO/qnfo-workers' and the dispatcher's REPLACE(repo, 'qnfo-workers', 'QNFO/qnfo-workers') prefixed the
-- owner a second time. code_tasks_repo_slug_ai (2026-10-19-resolve-code-task-publish-slug.sql) and the orchestrator's
-- repoSlug() strip exactly one owner segment, so the row kept a '/' and every read was refused until a hand repair; the
-- fm-code-task-repo-slug detector excluded the same shape (instr(substr(repo, 6), '/') = 0) and read pass throughout.
--
-- WHAT
-- 1. code_tasks_repo_slug_ai is replaced: a repo that starts with 'qnfo/' (any case, any number of owner segments) becomes
--    its last segment right after insert. code_tasks_repo_slug_upd does the same when a writer later sets such a repo.
-- 2. Live rows of that shape are repaired now (old values in bak_20261019_repo_slug_any_depth_v2).
-- 3. fm-code-task-repo-slug counts any unfinished task whose repo still holds a '/', so the blind spot is gone; failure
--    mode code-task-repo-double-owner records the root cause.
-- The dispatcher's REPLACE lives in RED-DRAIN-1, owned by another session; this file makes the table immune to it.

-- BACKUP-NONEMPTY-1 (2026-10-19, migration_runs 361): the first apply refused at statement 3 because no live row needed repair
-- (RED-DRAIN-1 writes the bare slug since PR 2660), so the row backup was empty. The backup now also holds the trigger
-- definition it replaces (kind 'trigger'), which always exists, and the repaired rows (kind 'row').
CREATE TABLE IF NOT EXISTS bak_20261019_repo_slug_any_depth_v2 AS
  SELECT 'trigger' AS kind, name AS id, sql AS repo, NULL AS status FROM sqlite_master WHERE type = 'trigger' AND name = 'code_tasks_repo_slug_ai'
  UNION ALL
  SELECT 'row' AS kind, id, repo, status FROM code_tasks WHERE lower(repo) LIKE 'qnfo/%';

CREATE TABLE IF NOT EXISTS bak_20261019_repo_slug_any_depth_rc AS
  SELECT class, verify_probe FROM remediation_contracts WHERE class = 'fm-code-task-repo-slug';

DROP TRIGGER IF EXISTS code_tasks_repo_slug_ai;

CREATE TRIGGER code_tasks_repo_slug_ai AFTER INSERT ON code_tasks
WHEN lower(COALESCE(NEW.repo, '')) LIKE 'qnfo/%' AND length(rtrim(NEW.repo, replace(NEW.repo, '/', ''))) < length(NEW.repo)
BEGIN
  UPDATE code_tasks SET repo = substr(NEW.repo, length(rtrim(NEW.repo, replace(NEW.repo, '/', ''))) + 1) WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS code_tasks_repo_slug_upd;

CREATE TRIGGER code_tasks_repo_slug_upd AFTER UPDATE OF repo ON code_tasks
WHEN lower(COALESCE(NEW.repo, '')) LIKE 'qnfo/%' AND length(rtrim(NEW.repo, replace(NEW.repo, '/', ''))) < length(NEW.repo)
BEGIN
  UPDATE code_tasks SET repo = substr(NEW.repo, length(rtrim(NEW.repo, replace(NEW.repo, '/', ''))) + 1) WHERE id = NEW.id;
END;

UPDATE code_tasks SET repo = substr(repo, length(rtrim(repo, replace(repo, '/', ''))) + 1)
  WHERE lower(repo) LIKE 'qnfo/%' AND length(rtrim(repo, replace(repo, '/', ''))) < length(repo);

UPDATE remediation_contracts SET verify_probe =
  'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN (''merged'', ''closed'', ''superseded'', ''publish_failed'', ''needs_human'', ''failed'', ''reverted'') AND (instr(COALESCE(repo, ''''), ''/'') > 0 OR (status = ''ready_to_publish'' AND julianday(updated_at) < julianday(''now'', ''-120 minutes'')))) = 0 THEN ''1'' ELSE ''0'' END AS observed',
  next_due_at = NULL
  WHERE class = 'fm-code-task-repo-slug';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, blast_radius)
VALUES ('code-task-repo-double-owner',
  'A code task written with the owner twice in its repo slug is refused at every read',
  'RED-DRAIN-1 dispatch REPLACE(repo, ''qnfo-workers'', ''QNFO/qnfo-workers'') on a code-task line that already named QNFO/qnfo-workers gave QNFO/QNFO/qnfo-workers; the insert trigger, repoSlug() and the detector each handled one owner segment only',
  'code_tasks_repo_slug_ai and code_tasks_repo_slug_upd reduce any qnfo/-prefixed repo to its last segment; fm-code-task-repo-slug counts any unfinished task whose repo holds a slash',
  'fm-code-task-repo-slug: unfinished code_tasks whose repo holds a slash, or ready_to_publish over 120 minutes',
  'fm-code-task-repo-slug', '2026-10-19T04:44:44Z', 100050,
  'code loop: every task dispatched from an issue whose code-task line names the owner');
