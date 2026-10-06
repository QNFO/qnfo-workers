-- TRANSFORMATION-PROGRAM-1 1.2, register fix (2026-10-06, pillar: autonomy). migrations/2026-10-06-transformation-levers-v1-2.sql
-- inserted its rows with INSERT OR IGNORE on UNIQUE(tp, n) at 08:42Z; two of its slots had been taken at 08:40Z by another
-- session's assessment ((1, 14) orchestrator-claims-first, (5, 10) one-worker-count), so its (1, 14) verify-parse-shape and
-- (5, 10) roster-prune-that-runs were ignored. They live at (1, 19) and (5, 11), as docs/TRANSFORMATION-PROGRAM.md 1.2 now
-- numbers them. Applied by session_013sMN4pr2RGmHezM4Gm6fMk through the D1 query API at 08:44Z; idempotent.
-- Rollback: DELETE FROM transformation_levers WHERE (tp = 1 AND n = 19 AND key = 'verify-parse-shape') OR (tp = 5 AND n = 11 AND key = 'roster-prune-that-runs');
INSERT OR IGNORE INTO transformation_levers (tp, n, key, title, kind, wave, pillar, path, anchor, detail, dod, issue_id, status, note, dispatched_at, landed_at, updated_at) VALUES
 (1, 19, 'verify-parse-shape', 'Parse-shape verifier: V8 parse wording without its class is a failed proposal, retried', 'code', 'W0', 'autonomy', 'qnfo-code-orchestrator/worker.js', NULL,
  'ct_lc6has32addg0m (07:41Z) ended needs_human on "Unexpected identifier ''__name''": the sandbox passes only err.message, so the verifier read a parse error as unverified.',
  'no code task ends needs_human with "could not confirm the syntax" on a message JS_PARSE_SHAPE matches, over 14 days',
  NULL, 'landed', 'JS-VERIFY-PARSE-SHAPE-1 in qnfo-code-orchestrator 0.3.19 (PR 681, 45497cb, live 08:41:46Z); verify-closed.test.mjs 22. Numbered 19: (1, 14) was taken at 08:40Z by orchestrator-claims-first.', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
 (5, 11, 'roster-prune-that-runs', 'The prober prunes ai_model_health ids outside its roster (after a backup)', 'refactor', 'W1', 'autonomy', 'qnfo-ai-calibration/worker.js', NULL,
  'checkFreshness calls _del.bind.apply(_del.bind, [null].concat(_roster)): bind gets the wrong receiver, the error is swallowed, and no row has ever been pruned (24 never-probed external ids since 2026-09-19). Back up the table, fix the receiver, prune only ids outside the canonicalised roster with no gateway failure in 7 days.',
  'ai_model_health holds only roster ids plus ids with a gateway failure in 7 days; the backup table exists',
  NULL, 'pending', 'Numbered 11: (5, 10) was taken at 08:40Z by one-worker-count.', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
