-- CODE-LOOP-SUPERSEDED-RECONCILE-1 (2026-10-19).
--
-- WHY
-- fleet_tasks 'code-loop-terminal-reconcile' closes a CODE-LOOP-EXHAUSTED-1 issue when its code task reached
-- status='merged'. Measured 2026-10-19 13:5xZ: the orchestrator's done set is ('merged','closed','superseded')
-- (0.18.14 CLAIM-TERMINAL-RELEASE-1 note in qnfo-code-orchestrator/worker.js), but only 'merged' is reconciled, so a
-- task the loop finished any other way leaves its issue open with a title that says the loop gave up. Live instances at
-- the time of writing: issue 2871 (ct_n6u8tqjg0xalz4, superseded) and issue 2876 (ct_r1obxjczfjxmsj, closed unmerged).
-- A register that keeps a "the loop exhausted this" issue for work the loop actually completed is red that no session
-- can drain - it is a false red by construction, which is the class this fleet treats as a defect.
--
-- WHAT THIS ADDS
-- A second reconciler, on the same 10-minute cadence and with the same evidence discipline, that resolves an issue
-- whose code task reached 'superseded'. It is additive on purpose: the existing task and its definition are untouched,
-- so this can be reverted by deleting one task and one cron row.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * 'closed' (a pull request closed unmerged) is NOT resolved here. That state means the change did not land, so the
--     issue still has work in it; PR-CLOSE-WITHOUT-MERGE-1 (issue 99901) owns that case. Issue 2876 is left open.
--   * nothing is deleted and no trigger is created, so D1's trigger-depth budget is unchanged.
--
-- SAFETY
--   Idempotent: INSERT OR IGNORE on fleet_tasks/fleet_crons, and the reconciliation itself is an upsert into
--   issue_triage guarded on a.status='open'. Re-applying changes nothing.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM fleet_crons WHERE name='code-loop-superseded-reconcile-10m';
--   DELETE FROM fleet_tasks WHERE id='code-loop-superseded-reconcile';
--
-- Verify after apply (within 10 minutes):
--   SELECT a.id, t.status FROM agent_issues a JOIN code_tasks t ON instr(a.title,t.id)>0
--    WHERE a.title LIKE 'CODE-LOOP-EXHAUSTED-1: %' AND a.status='open' AND t.status='superseded';   -- expect none

INSERT OR IGNORE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES (
  'code-loop-superseded-reconcile',
  'Code loop terminal reconcile: a code task that reached superseded resolves its CODE-LOOP-EXHAUSTED-1 issue',
  'sql',
  '{"steps":[{"type":"sql","db":"AUDIT","sql":"INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT a.id, ''code-loop-superseded-reconcile'', ''resolved'', ''qnfo-code-orchestrator'', datetime(''now'',''+1 day''), ''Disposition: code task '' || t.id || '' reached superseded, which is in the orchestrator done set. code_tasks.status=superseded. Auto-closed by CODE-LOOP-SUPERSEDED-RECONCILE-1.'' FROM agent_issues a JOIN code_tasks t ON instr(a.title, t.id) > 0 WHERE a.status = ''open'' AND a.title LIKE ''CODE-LOOP-EXHAUSTED-1: ct_%'' AND t.status = ''superseded'' ON CONFLICT(issue_id) DO UPDATE SET triage_state=''resolved'', close_evidence=excluded.close_evidence"}]}',
  60000, 0, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now')
);

-- fleet_crons.id is INTEGER (autoincrement), so the cron is inserted by name and guarded by NOT EXISTS rather than by
-- an explicit primary key (measured 2026-10-19: an INSERT naming a text id fails with SQLITE_MISMATCH).
INSERT INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
SELECT 'code-loop-superseded-reconcile-10m', '*/10 * * * *', 'code-loop-superseded-reconcile', 1, 'UTC',
       strftime('%Y-%m-%dT%H:%M:%SZ','now')
 WHERE NOT EXISTS (SELECT 1 FROM fleet_crons WHERE name = 'code-loop-superseded-reconcile-10m');
