-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: revert worker/mirror through deploy-code-orchestrator.yml; UPDATE remediation_contracts SET status='paused' WHERE class IN ('fm-code-loop-budget-claim-starvation','belief-code-loop-budget-claim-scan'); retain decision history.
-- CODE-LOOP-BUDGET-CLAIM-SCAN-1, pillar autonomy. On 2026-10-25 18:08-18:14Z,
-- three capped ticks deferred research-exec tasks behind another task's live claim.
-- Their deferrals spent the entire one-step allowance while unrelated paths stayed queued.
-- No threshold or claim protection changes; bounded scans seek one executable step.

UPDATE control_registry SET
 alternate_path='At the unchanged daily-call threshold: cheapest-first coder, one executable step per tick, bounded scan of up to 64 held tasks within the existing time budget; live claims always defer their tasks.',
 alternate_tested_at=strftime('%Y-%m-%dT%H:%M:%SZ','now'),
 evidence='spend-cap.test.mjs reproduced one held task consuming the entire capped tick before the fix; now three held paths remain unexecuted while an independent path progresses, and 65 held paths stop at 64 scans. Actual task/verifier/fallback coverage remains.',
 reviewed_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE control='code-loop-daily-calls';

INSERT OR IGNORE INTO failure_modes
 (fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,issue_id,trigger_condition,symptom,blast_radius)
VALUES
 ('code-loop-budget-claim-starvation','held claims consume a reduced tick before unrelated executable work',
  'tick bounded done.length, which counts claim-held deferrals as if they were executed task steps',
  '0.27.1 counts executed steps separately under soft routing and scans at most 64 tasks within the existing time budget; every held task keeps its lease deferral',
  'fm-code-loop-budget-claim-starvation code-read plus actual SQLite claim-deferral and scan-bound regressions',
  'fm-code-loop-budget-claim-starvation','2026-10-25T18:14:46Z',1000111,
  'daily-call threshold breached with claimed paths ordered before unrelated queued tasks',
  '18:08,18:12,18:14 capped ticks deferred research-exec tasks; verifier replacement stayed queued/read',
  'all unrelated code tasks behind a live work claim');

INSERT OR IGNORE INTO remediation_contracts
 (class,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,next_due_at)
VALUES
 ('fm-code-loop-budget-claim-starvation','CODE-LOOP-BUDGET-CLAIM-SCAN-1','failure-mode detector',
  '{"paths":["qnfo-code-orchestrator/worker.js"],"contains":"(gate.capped ? executed : done.length) < maxSteps"}',
  'code-read',3,'qnfo-code-orchestrator',1,'active',datetime('now')),
 ('belief-code-loop-budget-claim-scan','CODE-LOOP-BUDGET-CLAIM-SCAN-1','belief detector',
  '{"paths":["qnfo-code-orchestrator/worker.js"],"contains":"(!gate.capped || scanned < 64)"}',
  'code-read',3,'qnfo-code-orchestrator',1,'active',datetime('now'));

INSERT OR IGNORE INTO belief_registry (belief_key,claim,confidence,evidence,probe_class,built_on)
VALUES
 ('code-loop-budget-claim-scan','a bounded scan can honor every live work claim while allowing unrelated executable work at a soft budget threshold',
  0.95,'Actual tick fixture: three HTTP 409 claim refusals preserve all held steps/attempts and one independent task advances without a model call; 65 refusals stop at 64 scans.',
  'belief-code-loop-budget-claim-scan','CODE-LOOP-SOFT-BUDGET-1; live claim-held events at 18:08,18:12,18:14Z');

INSERT INTO decision_log
 (actor,assumption,action,evidence,outcome,blast_radius,rollback_path,capability_gain,predicted_outcome,reach_gain,surfaces_tested)
SELECT
 'copilot-session-6acb4f9a-36a5-4df9-a29c-b948c4fb0da6',
 'claim deferrals are not executable work and should not exhaust the reduced tick before independent paths',
 'CODE-LOOP-BUDGET-CLAIM-SCAN-1: count executed steps separately, scan up to 64 claimable tasks inside the existing budget, preserve every HTTP 409 deferral',
 'Live capped ticks at 18:08,18:12,18:14Z consumed by claim-held tasks; failing-before regression reproduced one deferral instead of three plus independent read.',
 'offline tick/claim/limit regressions pass; canonical deployment and original task probe remain required',
 'qnfo-code-orchestrator internal tick only; no new binding, route, cron, schema, credential or threshold',
 'revert worker and mirror through deploy-code-orchestrator.yml; pause new contracts with migration header SQL',
 'existing soft-budget routing retains progress when earlier queue paths are claimed',
 'capped ticks can defer held paths and execute one independent step; the verifier replacement progresses naturally',
 'none directly','authorized D1 events and task states; actual tick regression; existing claims-first and timer suites'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action,'CODE-LOOP-BUDGET-CLAIM-SCAN-1:')=1);
