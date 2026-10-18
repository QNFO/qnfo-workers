-- CTX-JSON-1 (2026-10-18, pillar autonomy): a malformed JSON cell must be refused where it is written, not discovered by
-- the loop that reads it.
--
-- WHAT HAPPENED
-- code_tasks row ct_plain_language_1 carried 11112 characters of prose in the ctx column ("RED-TEAM CORRECTION
-- (supersedes the plainGround ...)"), inserted by hand at 20:00:00Z with attempts 0 - the loop itself never writes a
-- non-JSON ctx (validTask does not accept a ctx at all, and every worker write is JSON.stringify). Every claimsSweep
-- query reads that column with json_extract, so the statement threw "malformed JSON" on every tick. The sweep's earlier
-- loops still ran (lanes emitted code-task.claim-held throughout), but its LAST block - releasing the claim of a
-- finished task - never did: ct_im2936 stayed 'superseded' holding file:qnfo-fleet-dashboard/worker.js, and ct_im2924,
-- ct_im2727, ct_im2935 and ct_ndnfg4kxco2hlr were deferred on every tick from 20:18Z until the row was repaired at
-- 20:46Z (the release landed by itself at 20:49:26Z with release_status 200).
--
-- THE TWO PATHS (SLA-AND-PATHS-1)
-- 1. READ: qnfo-code-orchestrator 0.18.18 (CTX-JSON-GUARD-1, PR 2543) wraps every sweep json_extract in
--    (CASE WHEN json_valid(ctx) THEN ctx ELSE '{}' END), so one bad row can only cost its own claim.
-- 2. WRITE: this file refuses the bad row at the source, on INSERT and on UPDATE OF ctx, naming the column that should
--    have carried the prose. A writer outside the worker cannot dodge it.
-- Both are kept deliberately: a reader that must not fall over is a different guarantee from a writer that must not be
-- wrong, and the two failures are invisible to each other.
--
-- COST: json_valid runs only when ctx is non-null, on the writes the loop already performs (one per step, hundreds a
-- day), and the trigger has no body on the accepted path. No row is touched by this file; it adds two guards and
-- changes no data.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS code_tasks_ctx_json_ins; DROP TRIGGER IF EXISTS code_tasks_ctx_json_upd; DELETE FROM spof_registry WHERE component = 'code_tasks.ctx JSON guard (d1-trigger)';

CREATE TRIGGER IF NOT EXISTS code_tasks_ctx_json_ins
BEFORE INSERT ON code_tasks
FOR EACH ROW
WHEN NEW.ctx IS NOT NULL AND json_valid(NEW.ctx) = 0
BEGIN
  SELECT RAISE(ABORT, 'CTX-JSON-1: code_tasks.ctx must be JSON text (the claim sweep reads it with json_extract); put prose in goal or last_error');
END;

CREATE TRIGGER IF NOT EXISTS code_tasks_ctx_json_upd
BEFORE UPDATE OF ctx ON code_tasks
FOR EACH ROW
WHEN NEW.ctx IS NOT NULL AND json_valid(NEW.ctx) = 0
BEGIN
  SELECT RAISE(ABORT, 'CTX-JSON-1: code_tasks.ctx must be JSON text (the claim sweep reads it with json_extract); put prose in goal or last_error');
END;

-- SPOF-REVIEW-GATE-1: naming the second path for the two triggers this file adds. The trigger is one of two independent
-- guards on the same column; each was proven by mutation against its own suite.
INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, reviewed_at)
VALUES (
  'code_tasks.ctx JSON guard (d1-trigger)',
  'code_tasks_ctx_json_ins / code_tasks_ctx_json_upd: a BEFORE INSERT/UPDATE OF ctx trigger refuses a non-JSON ctx, so a bad row cannot reach the column every claimsSweep query reads with json_extract',
  'Two other paths, deliberately: (1) the reader tolerates it - qnfo-code-orchestrator 0.18.18 (PR 2543, CTX-JSON-GUARD-1) wraps every sweep json_extract in (CASE WHEN json_valid(ctx) THEN ctx ELSE ''{}'' END), so claim release survives even if these triggers are dropped, bypassed by a writer with trigger rights, or lost in a restored backup; (2) the write is refused again by ensureSchema on any database the loop initialises, so a fresh D1 gets the guard without this migration. If the reader guard regresses the trigger still refuses the bad write, and if the trigger is gone the reader still releases claims.',
  '2026-10-18',
  'Incident 2026-10-18: ct_plain_language_1 held 11112 chars of prose in ctx; json_extract threw malformed JSON on every claimsSweep tick and the finished-task release stopped (ct_im2936 stayed superseded holding file:qnfo-fleet-dashboard/worker.js; ct_im2924, ct_im2727, ct_im2935 and ct_ndnfg4kxco2hlr deferred 20:18Z-20:49Z). Both paths are mutation-checked: with the triggers inert, code-tasks-ctx-json.test.mjs accepts prose and fails 2 assertions; with JCTX reverted, claims-sweep-resilient.test.mjs reports malformed JSON and fails 3.',
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
);
