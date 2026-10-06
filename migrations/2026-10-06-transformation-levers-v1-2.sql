-- TRANSFORMATION-PROGRAM-1 version 1.2 (2026-10-06, pillar: autonomy). docs/TRANSFORMATION-PROGRAM.md section 1.12 (third
-- read, 07:40-08:10Z) replaces T1 lever 8 and adds T1.13-T1.18, T3.10-T3.15 and T5.10. This file brings
-- qnfo-audit.transformation_levers (the register TRANSFORMATION-LOOP-1 in qnfo-fleet-control reads every hour) in line:
--   * (1, 8) branch-protection-control-plane is superseded. It contradicted human_actions 21 (option (a), applied under
--     rule 8: the verifier workers stay manual), and its landing would have opened the whole control plane to code
--     dispatch (TP_CONTROL_PLANE_LEVER). 'superseded' is a done state the planner never treats as landed, so that switch
--     stays closed.
--   * Levers that landed in the ENGINE-GUARD-2 pull request (qnfo-code-orchestrator 0.3.19, qnfo-fleet-control 0.4.133,
--     qnfo-ai-calibration 1.3.2) are recorded landed with that evidence: (1, 14), (1, 15), (3, 15).
--   * New pending levers carry kind, wave, path and the dependency facts read on 2026-10-06; the loop routes each to the code
--     loop or a session by its own rules (control-plane paths and non-code kinds go to a session; 'owner' is never
--     dispatched).
-- Applied by the session that wrote it, through the D1 query API, after the pull request merged and its versions read live.
-- Idempotent (INSERT OR IGNORE on UNIQUE(tp, n); the UPDATEs are guarded by key).
-- Rollback: DELETE FROM transformation_levers WHERE (tp = 1 AND n IN (14, 15, 16, 17, 18)) OR (tp = 3 AND n IN (10, 11, 12,
-- 13, 14, 15)) OR (tp = 5 AND n = 10); UPDATE transformation_levers SET status = 'pending', note = NULL WHERE tp = 1 AND n = 8
-- AND key = 'branch-protection-control-plane'; the detail and note texts updated below are additive (their old text is the
-- prefix kept by the || concatenation).

UPDATE transformation_levers
   SET status = 'superseded',
       note = 'Superseded by program 1.2 (section 1.12): human_actions 21 keeps the verifier workers manual (lever 18) and allows staged automatic changes to qnfo-ai and qnfo-gateway after a live staged-rollout test (lever 17); the merge runner already merges only on green required checks.',
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE tp = 1 AND n = 8 AND key = 'branch-protection-control-plane';

INSERT OR IGNORE INTO transformation_levers (tp, n, key, title, kind, wave, pillar, path, anchor, detail, dod, issue_id, status, note, dispatched_at, landed_at, updated_at) VALUES
 (1, 14, 'verify-parse-shape', 'Parse-shape verifier: V8 parse wording without its class is a failed proposal, retried', 'code', 'W0', 'autonomy', 'qnfo-code-orchestrator/worker.js', NULL,
  'ct_lc6has32addg0m (07:41Z) ended needs_human on "Unexpected identifier ''__name''": the sandbox passes only err.message, so the verifier read a parse error as unverified.',
  'no code task ends needs_human with "could not confirm the syntax" on a message JS_PARSE_SHAPE matches, over 14 days',
  NULL, 'landed', 'JS-VERIFY-PARSE-SHAPE-1 in qnfo-code-orchestrator 0.3.19 (ENGINE-GUARD-2 pull request); verify-closed.test.mjs 22.', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (1, 15, 'merge-scope-intake', 'Merge-scope intake: a control-plane task is refused before any model call; its issue becomes a session task', 'code', 'W0', 'autonomy', 'qnfo-code-orchestrator/worker.js', NULL,
  'ct_u4ih8uzgsfxzvm (issue 2005) and ct_rwqd5kegl1awi4 (issue 2023) were built and then refused by the merge runner (CM_DENY), each a model call and a failed row in code_task_success_rate_30d, the unmet W0 exit.',
  'no code task on a CM_DENY worker created after the landing, over 14 days',
  NULL, 'landed', 'MERGE-SCOPE-INTAKE-1 in qnfo-code-orchestrator 0.3.19 (ENGINE-GUARD-2 pull request); scope-intake.test.mjs 21.', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (1, 16, 'w0-leading-exit', 'W0 exits on the success rate of tasks created after levers 14 and 15 landed (at least 8 finished)', 'code', 'W0', 'autonomy', 'qnfo-fleet-control/worker.js', 'var TP_WAVES = [',
  'The 42 closures of 2026-10-02..10-05 stay in the 30-day window until November, so code_task_success_rate_30d cannot measure the engine as it is now. The 30-day metric keeps its scoreboard row and trigger; section 4 and TP_WAVES change together (transformation.test.mjs parity).',
  'TP_WAVES W0 exit and document section 4 name the leading measure; transformation.test.mjs passes',
  NULL, 'pending', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (1, 17, 'staged-rollout-ai-gateway', 'Staged rollout for qnfo-ai and qnfo-gateway, then both leave the never-auto-merge lists together', 'refactor', 'W1', 'autonomy', '.github/workflows/canonical-deploy.yml', NULL,
  'human_actions 21 option (a): staged automatic changes to qnfo-ai and qnfo-gateway after a staged-rollout path passes a live test. Upload a version, deploy it to a fraction of traffic, probe, promote or roll back without running through the changed worker. Then remove both from EVOLVE_DENY, PLAN_DENY_WORKERS and TP_CONTROL_PLANE in one change (fold-guard.test.mjs keeps them equal).',
  'one live staged deploy of each worker promoted and one rolled back by the path itself; both workers off the three lists; a code-loop PR on qnfo-gateway merged by the runner',
  NULL, 'pending', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (1, 18, 'verifier-workers-manual', 'The verifier workers (qnfo-fleet-control, qnfo-deploy-guard, qnfo-ops, the code loop) stay manual', 'owner', 'W1', 'autonomy', NULL, NULL,
  'human_actions 21, option (a), applied 2026-10-02 under rule 8 (agents may not weaken verification probes, guard metrics, deploy lock or rollback). Listed so no plan routes around it; the owner reopens it with a card.',
  'owner decision recorded; never dispatched',
  NULL, 'pending', 'owner-held (human_actions 21)', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (3, 10, 'personal-plane-one-worker', 'personal-companion and calendar-api fold into personal-api', 'refactor', 'W2', 'personal', 'personal-api/worker.js', NULL,
  'Dependency read 2026-10-06: personal-companion has no binders and no URL callers (hourly cron); calendar-api is bound by personal-api, qnfo-intent-orchestrator and radar-hub (cron 17 * * * *). The plane separation is between planes, not inside one.',
  'both scripts absent from the account with FOLDED markers; their tables still fill; worker_count down by 2',
  NULL, 'pending', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (3, 11, 'intent-orchestrator-fold', 'qnfo-intent-orchestrator folds into idea-hub; promotions route to qnfo-research-exec', 'refactor', 'W2', 'core', 'idea-hub/worker.js', NULL,
  'Its downstream qnfo-agent-orchestrator is retired (PR 674); seven promoted candidates wait on a dispatch that fails (epic 2010). Binders qnfo-ai, qnfo-fleet-control, qnfo-ops, qnfo-tools-mcp (three control plane): re-point them first.',
  'qnfo-intent-orchestrator absent from the account with a FOLDED marker; promoted candidates reach research_queue',
  NULL, 'pending', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (3, 12, 'observability-into-calibration', 'qnfo-observability folds into qnfo-ai-calibration on its */30 tick', 'refactor', 'W2', 'core', 'qnfo-ai-calibration/worker.js', NULL,
  'Both measure. The */30 tick carries the hourly ingest at :00 and the scorer at 05:00; the host already awaits a member. The scorer protection moves with it (FOLD-GUARD-PARITY-1 fails CI otherwise).',
  'qnfo-observability absent from the account with a FOLDED marker; autonomy_scores refreshed daily; qnfo-ai-calibration on the three never-auto-merge lists',
  NULL, 'pending', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (3, 13, 'subscribers-into-email', 'qnfo-subscribers folds into qnfo-email: one list, one transport, one suppression list', 'refactor', 'W2', 'reach', 'qnfo-email/worker.js', NULL,
  'URL callers idea-hub, qnfo-gateway and qnfo-ipatent re-point to the host route first (qnfo-gateway is control plane, so a session); weekly cron 0 16 * * 1.',
  'qnfo-subscribers absent from the account with a FOLDED marker; a double opt-in from each surface lands in the list',
  NULL, 'pending', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (3, 14, 'fold-kit', 'scripts/fold_worker.py: a fold is one command and a review', 'repo', 'W1', 'autonomy', 'scripts/fold_worker.py', NULL,
  'Generalise the builders of fold waves 1 to 3 (IIFE wrap, VERSION and export rewrite, env map, tick map, health route, props-member routing, the parity test template) so T1.11 can take folds.',
  'the next fold in this program is produced by the kit with no hand edit to the host beyond its env map',
  NULL, 'pending', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (3, 15, 'fold-guard-parity', 'A fold never lifts the never-auto-merge protection; the three deny lists stay equal', 'code', 'W0', 'autonomy', 'qnfo-fleet-control/worker.js', NULL,
  'SCORER-FOLD-1 moved qnfo-autonomy-scorer (denied) into qnfo-observability (not denied), so the planner and merge runner accepted changes to the scoring formula.',
  'fold-guard.test.mjs in deploy-gate; qnfo-observability on CM_DENY, PLAN_DENY_WORKERS and TP_CONTROL_PLANE',
  NULL, 'landed', 'SCORER-HOST-DENY-1 in qnfo-fleet-control 0.4.133 and qnfo-code-orchestrator 0.3.19 (ENGINE-GUARD-2 pull request); fold-guard.test.mjs 9.', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (5, 10, 'roster-prune-that-runs', 'The prober prunes ai_model_health ids outside its roster (after a backup)', 'refactor', 'W1', 'autonomy', 'qnfo-ai-calibration/worker.js', NULL,
  'checkFreshness calls _del.bind.apply(_del.bind, [null].concat(_roster)): bind gets the wrong receiver, the error is swallowed, and no row has ever been pruned (24 never-probed external ids since 2026-09-19). Back up the table, fix the receiver, prune only ids outside the canonicalised roster with no gateway failure in 7 days.',
  'ai_model_health holds only roster ids plus ids with a gateway failure in 7 days; the backup table exists',
  NULL, 'pending', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

UPDATE transformation_levers
   SET note = COALESCE(note || ' ', '') || '1.2: writer side landed in qnfo-ai-calibration 1.3.2 (no kaizen signal, version_queue an event register, amh_coverage over the roster); PR 677 deleted the dead rows.',
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE tp = 5 AND n = 7 AND key = 'freshness-measures' AND COALESCE(note, '') NOT LIKE '%1.2: writer side%';

UPDATE transformation_levers
   SET detail = COALESCE(detail || ' ', '') || '1.2: the owner''s desktop clients reach qnfo-memory-mcp by URL (owner_client_keys, 3 rows), a dependent the repository cannot show: re-point them or keep the hostname as a route of the host.',
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE tp = 3 AND n = 2 AND key = 'mcp-two-to-one' AND COALESCE(detail, '') NOT LIKE '%owner_client_keys%';
