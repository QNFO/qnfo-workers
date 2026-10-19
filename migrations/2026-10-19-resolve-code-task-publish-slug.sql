-- REPO-SLUG-PUBLISH-1 + QUEUE-SLA code-task-unpublished (2026-10-19, RESOLVE-ALL-OPEN-1, charter pillar: autonomy).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_stuck_summary_def
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-code-task-repo-slug'; DELETE FROM failure_modes WHERE fm_key = 'code-task-repo-slug'; DROP TRIGGER IF EXISTS code_tasks_repo_slug_ai; DROP TRIGGER IF EXISTS queue_sla_code_publish_10m; DELETE FROM queue_sla WHERE stuck_type = 'code-task-unpublished'; UPDATE code_tasks SET repo = (SELECT b.repo FROM bak_20261019_code_tasks_repo_slug b WHERE b.id = code_tasks.id) WHERE id IN (SELECT id FROM bak_20261019_code_tasks_repo_slug); DROP VIEW v_stuck_summary; then run the sql column of bak_20261019_stuck_summary_def (the view without code_tasks_unpublished_120m).
--
-- WHY (measured 2026-10-19 05:05Z)
-- Six code tasks (ct_im99928, ct_im99929, ct_im99937, ct_im99960, ct_im99975, ct_im99979; RED-DRAIN-1 dispatch) sat in
-- status 'ready_to_publish' from 2026-10-18 14:49Z with a branch name and pr_url NULL. code-task-publish ran every few
-- minutes and logged, for each one, "skip ct_im99929: repo QNFO/qnfo-workers is not qnfo-workers" (run 39202719551,
-- 05:05:34Z: published 0, skipped 6). The rows were written straight into code_tasks with the owner-qualified slug;
-- qnfo-code-orchestrator strips it at read since 0.18.13 (REPO-SLUG-NORMALIZE-1), but the publisher and
-- qnfo-fleet-control's opener and merge runner compare code_tasks.repo with 'qnfo-workers' verbatim. Meanwhile the six
-- tasks held their file claims (claimsSweep renews an unfinished task's claim), so 11 queued tasks on
-- qnfo-gateway/worker.js and qnfo-fleet-control/worker.js were deferred every tick (code-task.claim-held), among them
-- ct_im100020, the fix for LOOP-BREAKER issue 100020. queue_sla's code-task-stalled row counted the stuck rows but its
-- auto_fix was "none automatic".
--
-- WHAT
-- 1. The owner-qualified rows are repaired to the bare slug now (ready_to_publish rows get a fresh updated_at, so the
--    publisher has a full SLA window before step 3 can act on them); the old values are kept in a backup table.
-- 2. code_tasks_repo_slug_ai repairs any future row inserted with 'QNFO/<repo>' (one owner segment) right after insert.
-- 3. queue_sla 'code-task-unpublished' (SLA 120 min, 10-minute cycle) with its automatic fix on the fleet tick:
--    repair an owner-qualified slug in place (any age), and a task still 'ready_to_publish' 120 minutes after its last
--    update ends 'publish_failed' with the reason (revert text in last_error), which releases its file claim and lets
--    intake take the issue again after its cooldown. ops_config queue_sla_autofix = off stops the fix, not the measure.
-- 4. v_stuck_summary gains code_tasks_unpublished_120m (the live definition, read 2026-10-19, plus one column).
-- Publisher side: scripts/code-task-publish.py repo_slug() (same PR) publishes and repairs such a row itself.

CREATE TABLE IF NOT EXISTS bak_20261019_code_tasks_repo_slug AS
  SELECT id, repo, status, updated_at FROM code_tasks WHERE lower(substr(repo, 1, 5)) = 'qnfo/';

CREATE TABLE IF NOT EXISTS bak_20261019_stuck_summary_def AS
  SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_stuck_summary';

UPDATE code_tasks SET repo = substr(repo, 6),
    updated_at = CASE WHEN status = 'ready_to_publish' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE updated_at END
  WHERE lower(substr(repo, 1, 5)) = 'qnfo/' AND length(repo) > 5 AND instr(substr(repo, 6), '/') = 0;

DROP TRIGGER IF EXISTS code_tasks_repo_slug_ai;
CREATE TRIGGER code_tasks_repo_slug_ai AFTER INSERT ON code_tasks
WHEN lower(substr(COALESCE(NEW.repo, ''), 1, 5)) = 'qnfo/' AND length(NEW.repo) > 5 AND instr(substr(NEW.repo, 6), '/') = 0
BEGIN
  UPDATE code_tasks SET repo = substr(NEW.repo, 6) WHERE id = NEW.id;
END;

INSERT OR IGNORE INTO queue_sla (stuck_type, queue, definition, cycle_min, sla_min, auto_fix, owner, summary_column, producer_cycle_min) VALUES
  ('code-task-unpublished', 'code_tasks',
   'code task in ready_to_publish not taken by code-task-publish within 120 min of its last update (REPO-SLUG-PUBLISH-1: 6 rows skipped for an owner-qualified repo slug from 2026-10-18 14:49Z)',
   10, 120,
   'queue_sla_code_publish_10m: repair an owner-qualified repo slug in place; after 120 min set publish_failed with the reason, releasing the file claim (revert: status ready_to_publish)',
   'scripts/code-task-publish.py', 'code_tasks_unpublished_120m', 10);

DROP TRIGGER IF EXISTS queue_sla_code_publish_10m;
CREATE TRIGGER queue_sla_code_publish_10m AFTER INSERT ON fleet_tick
BEGIN
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'code-task-unpublished', COUNT(*), 'repo slug repaired: ' || group_concat(id, ',') FROM code_tasks
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND status IN ('ready_to_publish', 'queued', 'publishing')
      AND lower(substr(repo, 1, 5)) = 'qnfo/' AND length(repo) > 5 AND instr(substr(repo, 6), '/') = 0
    HAVING COUNT(*) > 0;
  UPDATE code_tasks SET repo = substr(repo, 6), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status IN ('ready_to_publish', 'queued', 'publishing')
    AND lower(substr(repo, 1, 5)) = 'qnfo/' AND length(repo) > 5 AND instr(substr(repo, 6), '/') = 0;

  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'code-task-unpublished', COUNT(*), 'publish_failed after 120 min unpublished: ' || group_concat(id, ',') FROM code_tasks
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND status = 'ready_to_publish' AND julianday(updated_at) < julianday('now', '-120 minutes')
    HAVING COUNT(*) > 0;
  UPDATE code_tasks SET status = 'publish_failed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      last_error = substr('QUEUE-SLA code-task-unpublished: not taken by code-task-publish within 120 min of ready_to_publish'
        || ' (repo ' || COALESCE(repo, '?') || ', branch ' || COALESCE(branch, '?') || '; revert: status ready_to_publish). '
        || COALESCE(last_error, ''), 1, 1000)
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status = 'ready_to_publish' AND julianday(updated_at) < julianday('now', '-120 minutes');
END;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('code-task-repo-slug',
   'a code task written with an owner-qualified repo slug (QNFO/qnfo-workers) is verified but never published, and holds its file claim',
   'code_tasks.repo is compared verbatim with qnfo-workers by scripts/code-task-publish.py and by qnfo-fleet-control (publish dispatch, open and merge candidates); only qnfo-code-orchestrator normalized the slug (0.18.13)',
   'REPO-SLUG-PUBLISH-1: repo_slug() in the publisher, cmRepoSlug and widened reads in qnfo-fleet-control 0.33.19, trigger code_tasks_repo_slug_ai and the queue_sla code-task-unpublished fix (migrations/2026-10-19-resolve-code-task-publish-slug.sql)',
   'no unfinished code_tasks row carries an owner-qualified repo slug and none sits in ready_to_publish past 120 minutes',
   'fm-code-task-repo-slug', '2026-10-19', 100020,
   'a writer inserts or updates code_tasks.repo as <owner>/<repo>',
   '2026-10-18 14:49Z to 2026-10-19 05:05Z: 6 tasks ready_to_publish, publisher logged skip repo QNFO/qnfo-workers is not qnfo-workers, 11 queued tasks deferred on held file claims',
   'every code task on the files those tasks claimed (qnfo-gateway, qnfo-fleet-control, q08-signal-engine, qnfo-research-exec, personal-companion)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status) VALUES
  ('fm-code-task-repo-slug', NULL, 'REPO-SLUG-PUBLISH-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN (''merged'', ''closed'', ''superseded'', ''publish_failed'', ''needs_human'', ''failed'', ''reverted'') AND ((lower(substr(repo, 1, 5)) = ''qnfo/'' AND instr(substr(repo, 6), ''/'') = 0) OR (status = ''ready_to_publish'' AND julianday(updated_at) < julianday(''now'', ''-120 minutes'')))) = 0 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active');

DROP VIEW IF EXISTS v_stuck_summary;
CREATE VIEW v_stuck_summary AS
SELECT
  (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id
     WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error,
  (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0
     AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok'
       AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled,
  (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id WHERE q.status = 'queued'
     AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-120 minutes')) AS research_queued_180m,
  (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending,
  (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact')
     AND (datetime(created_at) < datetime('now', '-120 minutes') OR COALESCE(attempts, 0) >= 3)) AS outreach_waiting,
  (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted')
     AND datetime(updated_at) < datetime('now', '-120 minutes')) AS code_tasks_stalled,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
       AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h,
  (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes'))
     THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled,
  (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id
     WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS research_held_over_sla,
  (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap,
  (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id
     WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL
       AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift,
  (SELECT COALESCE(CAST((julianday('now') - julianday(MIN(created_at))) * 1440 AS INTEGER), 0) FROM code_tasks WHERE status = 'queued') AS code_tasks_queued_oldest_min,
  (SELECT COUNT(*) FROM code_tasks WHERE status = 'ready_to_publish'
     AND julianday(updated_at) < julianday('now', '-120 minutes')) AS code_tasks_unpublished_120m;
