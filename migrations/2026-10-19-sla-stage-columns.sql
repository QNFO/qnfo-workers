-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_v_sla_compliance
-- Rollback: re-create v_sla_compliance from the 'view' row of bak_20261019_v_sla_compliance (its sql column is the text read live on
--           2026-10-19 09:20Z) and set remediation_contracts.verify_probe of class issue-2827 back to the 'probe' row of the same table.
--
-- SLA-STAGES-1 (charter pillar autonomy, cluster code-loop-1/dod-checkable-and-code-task-merge-sla, issue 2827)
--
-- Defect, read live on 2026-10-19 09:30Z: v_sla_compliance code-task-merge reads queue 402.9 min, step 402.9 min, worst 1973, state breach
-- over 69 merges, and cannot say where the time goes: its code-task branch measures created_at to merged_at for BOTH columns
-- (migrations/2026-10-17-path-enforcement.sql, "no claim timestamp on code_tasks"). code_tasks.pr_opened_at exists and is set on all 69 merged
-- rows of the window (0 null, 0 earlier than created_at, 0 later than merged_at), so the wait before a pull request exists and the merge lane
-- can be told apart without a worker change. Computed with the columns below on the same 69 rows: created to pr_opened averages 368.2 minutes
-- and pr_opened to merged 34.7, so the 7-day mean is mostly the time spent before a PR exists (propose and verify retries), not the merge lane.
-- The 7-day mean is also slow to move: the 46 merges of the last 24 hours average 511.7 minutes because a backlog created on 2026-10-18 is still
-- draining through them, while tasks created since 2026-10-19 04:00Z average 54 minutes. recent_24h_minutes shows the trend a day after it
-- turns instead of seven; it still includes a backlog while that backlog drains, which is what the number should say.
--
-- Change: three columns appended to both branches, after `measurement`. Every existing column keeps its name, position and value, and the
-- state and queue_state rules and the 120-minute sla_min are untouched (no threshold changes).
--   propose_wait_minutes   code: created_at to pr_opened_at.  research: created_at to COALESCE(claimed_at, created_at) (wait before a claim).
--   work_minutes           code: pr_opened_at to merged_at (the merge lane).  research: published_at minus COALESCE(claimed_at, created_at), = step_minutes.
--   recent_24h_minutes     mean created-to-finish minutes of the rows that finished in the last 24 hours (julianday compare, so the mixed
--                          'YYYY-MM-DD hh:mm:ss' and ISO timestamps are read as the instants they are), NULL when none finished.
-- The code-task-merge measurement text is left as it is: its step_minutes is still created to merged, and the new columns carry the split.
--
-- Closing probe of issue 2827: its contract (class issue-2827) carries the generic loop template, which measures only the issue's age and
-- passes or fails on nothing about the SLA. It now reads the process contract worklist (DoD intent, 0 today) and v_sla_compliance, and
-- requires BOTH state and queue_state to be ok, because the end-to-end created-to-merge clock is the one the owner directive measures.
-- Observed reads 'pending: ...' with the split while the 7-day window still holds the 2026-10-18 backlog, and 'ok' once it clears; a window
-- with no merge at all reads 'no-merges-in-window', never ok; a closed issue reads ok, as the template did. The 8 tasks still queued in propose and research-publish's own backlog belong to their own clusters.
-- spof-review: one view re-created and one probe text. No threshold, trigger, cap or hold is added or changed.

-- 0. Backup of what this file replaces (BACKUP-CREATES-1).
CREATE TABLE IF NOT EXISTS bak_20261019_v_sla_compliance AS
  SELECT 'view' AS kind, name AS k, sql AS v FROM sqlite_master WHERE name = 'v_sla_compliance'
  UNION ALL SELECT 'probe', class, verify_probe FROM remediation_contracts WHERE class = 'issue-2827';

-- 1. The view: text read live 2026-10-19, same 9 columns and rules, three appended.
DROP VIEW IF EXISTS v_sla_compliance;
CREATE VIEW v_sla_compliance AS
SELECT
  'research-publish' AS process,
  COUNT(*) AS finished_7d,
  ROUND(AVG((julianday(published_at) - julianday(created_at)) * 1440), 1) AS queue_minutes,
  ROUND(AVG((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440), 1) AS step_minutes,
  MAX(CAST((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440 AS INTEGER)) AS worst_step_minutes,
  120 AS sla_min,
  CASE WHEN AVG((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440) > 120 THEN 'breach' ELSE 'ok' END AS state,
  CASE WHEN AVG((julianday(published_at) - julianday(created_at)) * 1440) > 120 THEN 'breach' ELSE 'ok' END AS queue_state,
  'measured' AS measurement,
  ROUND(AVG((julianday(COALESCE(claimed_at, created_at)) - julianday(created_at)) * 1440), 1) AS propose_wait_minutes,
  ROUND(AVG((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440), 1) AS work_minutes,
  ROUND(AVG(CASE WHEN julianday(published_at) > julianday('now', '-1 day') THEN (julianday(published_at) - julianday(created_at)) * 1440 END), 1) AS recent_24h_minutes
FROM research_queue
WHERE published_at IS NOT NULL AND created_at IS NOT NULL AND published_at > datetime('now', '-7 days')
UNION ALL
SELECT
  'code-task-merge',
  COUNT(*),
  ROUND(AVG((julianday(merged_at) - julianday(created_at)) * 1440), 1),
  ROUND(AVG((julianday(merged_at) - julianday(created_at)) * 1440), 1),
  MAX(CAST((julianday(merged_at) - julianday(created_at)) * 1440 AS INTEGER)),
  120,
  CASE WHEN AVG((julianday(merged_at) - julianday(created_at)) * 1440) > 120 THEN 'breach' ELSE 'ok' END,
  CASE WHEN AVG((julianday(merged_at) - julianday(created_at)) * 1440) > 120 THEN 'breach' ELSE 'ok' END,
  'measured (no claim timestamp on code_tasks, so step and queue are the same clock)',
  ROUND(AVG((julianday(pr_opened_at) - julianday(created_at)) * 1440), 1),
  ROUND(AVG((julianday(merged_at) - julianday(pr_opened_at)) * 1440), 1),
  ROUND(AVG(CASE WHEN julianday(merged_at) > julianday('now', '-1 day') THEN (julianday(merged_at) - julianday(created_at)) * 1440 END), 1)
FROM code_tasks
WHERE merged_at IS NOT NULL AND created_at IS NOT NULL AND merged_at > datetime('now', '-7 days');

-- 2. The closing probe of issue 2827 measures the SLA. UPDATE on the class, as ORPHAN-GUARD-BIRTH-1 requires (an INSERT OR IGNORE would be ignored).
UPDATE remediation_contracts SET ts = datetime('now'), verify_probe =
 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 2827) <> ''open'' THEN ''ok'' WHEN (SELECT COUNT(*) FROM v_process_contract_dod_worklist) <> 0 THEN ''dod-worklist-nonzero'' WHEN (SELECT COUNT(*) FROM v_sla_compliance WHERE process = ''code-task-merge'') = 0 THEN ''no-code-task-merge-row'' WHEN (SELECT finished_7d FROM v_sla_compliance WHERE process = ''code-task-merge'') = 0 THEN ''no-merges-in-window'' WHEN (SELECT state || queue_state FROM v_sla_compliance WHERE process = ''code-task-merge'') = ''okok'' THEN ''ok'' ELSE ''pending: code-task-merge '' || (SELECT state || ''/'' || queue_state || '' '' || queue_minutes || '' min vs '' || sla_min || '', wait before PR '' || COALESCE(propose_wait_minutes, ''n/a'') || '', merge lane '' || COALESCE(work_minutes, ''n/a'') || '', finished in last 24h '' || COALESCE(recent_24h_minutes, ''n/a'') FROM v_sla_compliance WHERE process = ''code-task-merge'') END AS observed'
WHERE class = 'issue-2827';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766', 'a 7-day mean over a clock that spans queue and work cannot name the stage that needs a fix, and moves only a week after a regression turns',
  'SLA-STAGES-1: v_sla_compliance gains propose_wait_minutes, work_minutes and recent_24h_minutes for both processes, the issue-2827 contract probe measures the SLA; no existing column, rule or threshold changes',
  'read 2026-10-19 09:30Z: code-task-merge finished_7d 69, queue and step 402.9 min, worst 1973, state breach; pr_opened_at set on all 69; created to pr_opened 368.2 min and pr_opened to merged 34.7 min over the same rows, 46 merges in the last 24 hours averaging 511.7 min; research-publish finished_7d 118, wait before claim 4628.1 min, work 168.7 min',
  'migration merged', 'one view re-created with three appended columns, one probe text', 'see the Rollback header',
  'the stage that holds a code task (wait before a pull request versus the merge lane) and the one-day trend are a column read, not an audit',
  'state and queue_state keep their values; the new columns read a wait before PR far above the merge lane, recent_24h_minutes falls below 120 once the 2026-10-18 backlog has drained, and the probe of issue 2827 stays pending until the 7-day mean clears',
  'the owner directive on code-task merge time is measured per stage',
  'd1:qnfo-audit v_sla_compliance, code_tasks, research_queue, v_sla_instrument_coverage, remediation_contracts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-STAGES-1:') = 1);
