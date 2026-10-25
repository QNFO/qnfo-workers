-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: revert the qnfo-code-orchestrator worker and mirror through their owning deployment workflow; UPDATE control_registry SET disposition='keep',disposition_state='applied',evidence='worker rollback restores the former daily call hold' WHERE control='code-loop-daily-calls'; UPDATE remediation_contracts SET status='paused' WHERE class IN ('fm-code-loop-budget-stops-work','fm-code-loop-replay-marker-lost','belief-code-loop-budget-routing','issue-1000111'); decision_log and the evidence ledgers remain append-only history.
-- CODE-LOOP-SOFT-BUDGET-1, pillar autonomy. Live 2026-10-25 17:10Z:
-- healthy 0.26.0 ticks held all work at 141 calls against the configured threshold 140.
-- ct_s6cvwtytdlavkm stayed queued/read after the verifier fix, with no close evidence for 1000111.
-- Thresholds, verifier/publication gates, bindings and crons are unchanged.
-- spof-review: the cheap model is not a new single path; the existing configured coding
-- ladder and bounded timeout/failure retries remain fallback paths. No secret is copied.

INSERT INTO control_registry
 (control,location,kind,guards_against,critical_path,disposition,disposition_state,alternate_path,alternate_tested_at,evidence,issue_id)
VALUES
 ('code-loop-daily-calls','qnfo-code-orchestrator spendGate/tick; ops_config code_loop_daily_calls',
  'cap','unbounded premium-model throughput',1,'demote','applied',
  'At the unchanged threshold use the cheapest priced configured coder first and one lane/step; existing bounded ladder retries supply fallback. Below threshold normal routing resumes.',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'),
  '141 calls >= 140 held every tick despite a healthy heartbeat. spend-cap.test.mjs verifies 139/140/141, scoped bindings, read/propose/verify/commit to ready_to_publish, fallback and standalone planning.',
  1000111)
ON CONFLICT(control) DO UPDATE SET disposition=excluded.disposition,disposition_state=excluded.disposition_state,
 alternate_path=excluded.alternate_path,alternate_tested_at=excluded.alternate_tested_at,evidence=excluded.evidence,
 issue_id=excluded.issue_id,reviewed_at=strftime('%Y-%m-%dT%H:%M:%SZ','now');

INSERT OR IGNORE INTO failure_modes
 (fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,issue_id,trigger_condition,symptom,blast_radius)
VALUES
 ('code-loop-budget-stops-work','a daily call budget stops all code-task progress',
  'spendGate returned false at the threshold and tick returned before every lane, planning and SLA sweep',
  '0.27.0 preserves the threshold, reorders the coding ladder cheapest-first and runs one lane/step with bounded fallback',
  'fm-code-loop-budget-stops-work: a breached meter has recent routed evidence and no newer held event',
  'fm-code-loop-budget-stops-work','2026-10-25T17:10:48Z',1000111,
  'modelCallsToday >= ops_config code_loop_daily_calls','141 calls held against 140; replacement task queued/read',
  'all autonomous code-task steps and planning'),
 ('code-loop-replay-marker-lost','a terminal verifier failure can be replayed more than once',
  'the read step rebuilt ctx without verifier_replay_attempted or its provenance',
  '0.27.0 carries the replay marker, timestamp and reason through read and stale-base rereads',
  'fm-code-loop-replay-marker-lost code-read plus verifier-replay.test.mjs actual read-step regression',
  'fm-code-loop-replay-marker-lost','2026-10-25T17:29:00Z',1000111,
  'a replayed task reads fresh source and later ends failed/verify again',
  'the one-time marker vanishes on the read step','terminal compile-failure recovery');

INSERT OR IGNORE INTO remediation_contracts
 (class,issue_id,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,next_due_at)
VALUES
 ('fm-code-loop-budget-stops-work',NULL,'CODE-LOOP-SOFT-BUDGET-1','failure-mode detector',
  'WITH meter AS (SELECT COALESCE(SUM(calls),0) AS used FROM ai_call_counters WHERE day=date(''now'') AND worker=''qnfo-code-orchestrator''), route AS (SELECT MAX(ts) AS ts FROM cloud_ops_events WHERE job=''qnfo-code-orchestrator'' AND kind=''code-task.spend-cap'' AND status=''routed'') SELECT ''0'' AS expected, CAST(CASE WHEN meter.used < COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key=''code_loop_daily_calls''),1500) THEN 0 WHEN route.ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-120 minutes'') AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job=''qnfo-code-orchestrator'' AND e.kind=''code-task.spend-cap'' AND e.status=''held'' AND e.ts > route.ts) THEN 0 ELSE 1 END AS TEXT) AS observed FROM meter CROSS JOIN route',
  'd1-query',3,'qnfo-code-orchestrator',1,'active',datetime('now')),
 ('fm-code-loop-replay-marker-lost',NULL,'VERIFIER-FAILURE-REPLAY-1','failure-mode detector',
  '{"paths":["qnfo-code-orchestrator/worker.js"],"contains":"nctx.verifier_replay_attempted = true;"}',
  'code-read',3,'qnfo-code-orchestrator',1,'active',datetime('now')),
 ('belief-code-loop-budget-routing',NULL,'CODE-LOOP-SOFT-BUDGET-1','belief detector',
  '{"paths":["qnfo-code-orchestrator/worker.js"],"contains":"gate.capped ? 1 : 64"}',
  'code-read',3,'qnfo-code-orchestrator',1,'active',datetime('now'));

-- Replace the birth-time 48h placeholder, never INSERT OR IGNORE over an existing issue contract.
-- This is the original definition of done, with a deployed-version prerequisite, not a lower bar.
UPDATE remediation_contracts SET
 precondition='CODE-LOOP-EXHAUSTED-1 issue 1000111: deployed verifier recovery and verified replacement task',
 action='Keep verification/publication gates; the remediation runner records close evidence only after the replacement is ready to publish or later.',
 verify_probe='SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_heartbeat WHERE worker=''qnfo-code-orchestrator'' AND ok=1 AND (CAST(version AS INTEGER)>0 OR CAST(substr(version,instr(version,''.'')+1) AS INTEGER)>=27)) AND EXISTS (SELECT 1 FROM code_tasks WHERE id IN (''ct_gklnf6hb3g8j7l'',''ct_s6cvwtytdlavkm'') AND status IN (''ready_to_publish'',''published'',''pr_open'',''merged'',''deployed'')) THEN ''ok'' ELSE ''pending: deployed verifier recovery and verified task required'' END AS observed',
 verify_transport='d1-query',escalate_to='qnfo-code-orchestrator',expected_cadence_h=1,
 status='active',next_due_at=datetime('now'),attempts=0
WHERE class='issue-1000111' AND issue_id=1000111;

INSERT OR IGNORE INTO belief_registry (belief_key,claim,confidence,evidence,probe_class,built_on)
VALUES
 ('code-loop-budget-routing','the call threshold can reduce cost/throughput without stopping deterministic verification or publication',
  0.95,'spend-cap.test.mjs uses the actual tick with real SQLite at 141/140, reaches ready_to_publish and exercises the existing fallback ladder; runtime detector checks routed evidence',
  'belief-code-loop-budget-routing','BUDGET-SOFT-ROUTE-1; measured healthy cron with held spend-cap events');

INSERT OR IGNORE INTO capability_ledger (capability,provenance,prerequisites,reliability,acquired_at,last_exercised_at,evidence)
VALUES
 ('code-loop-soft-budget-routing','qnfo-code-orchestrator 0.27.0; CODE-LOOP-SOFT-BUDGET-1',
  'existing Workers AI coding ladder and qnfo-audit call meter; no new bindings, crons or secrets',
  'offline boundary, fallback, verified publication and standalone-planner regression coverage',
  datetime('now'),datetime('now'),'spend-cap.test.mjs; verifier-replay.test.mjs; issue 1000111 remains evidence-gated');

INSERT INTO decision_log
 (actor,assumption,action,evidence,outcome,blast_radius,rollback_path,capability_gain,predicted_outcome,reach_gain,surfaces_tested)
SELECT
 'copilot-session-6acb4f9a-36a5-4df9-a29c-b948c4fb0da6',
 'the confirmed stall is a daily-call hard stop, not a missing cron; BUDGET-SOFT-ROUTE-1 requires cheap work to continue',
 'CODE-LOOP-SOFT-BUDGET-1: preserve threshold 140, route cheapest-first with one lane/step and the existing retry fallback; retain replay provenance across reads',
 'live D1 17:10Z: heartbeat 0.26.0 healthy, used=141 cap=140, spend-cap held; replay task queued/read. Actual read-step regression reproduced marker loss before the fix.',
 'implemented with unchanged verification/publication guards; canonical deployment and live task evidence still required',
 'qnfo-code-orchestrator only; no metric threshold, credential, binding, table schema or cron changes',
 'revert worker and mirror through deploy-code-orchestrator; registry rollback is in the migration header',
 'code tasks can progress at a breached call threshold without losing one-time recovery state',
 'routed spend-cap events replace held events and the queued replacement reaches ready_to_publish or later',
 'none directly','authorized Wrangler D1 reads; public health; spend-cap and verifier-replay offline suites'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action,'CODE-LOOP-SOFT-BUDGET-1:')=1);
