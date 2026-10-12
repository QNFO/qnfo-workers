-- CLOSEOUT-FAILURE-MODES-1 (2026-10-12, pillar autonomy; owner directive 2026-10-12 "Remediate all failure modes and remaining
-- systems problems"). Each failing fm-* detector was read live on 2026-10-12 06:50Z and gets its fix here, or a doer:
--  1. fm-superseded-closure-reopened read 3 (2294, 2295, 2297): PR 965 closed them through agent_issues.status with SUPERSEDED
--     evidence while issue_triage.triage_state stayed 'triaged', and SUPERSEDED-CLOSURE-HOLDS-1 fired only on triage_state.
--     A twin trigger on agent_issues.status closes the gap; the three rows are repaired.
--  2. fm-code-refusal-not-repaired read 3: all three tasks were refused by goal review while still a pushed branch (pr_url is a
--     compare link), and CODE-REPAIR-INTASK-1 repairs only an open pull request. ct_7xtqmvrmppmoxw (#2052, still needed) gets the
--     repair round it was denied; ct_frhtt8hi1nztli (#2121, fixed in D1 by SELFHEAL-EXEC-VERIFY-1) and ct_jy19s7wu3hzm93 plus the
--     queued ct_uc1fnkvme62wc9 (#2106, DeepSeek 402: 0 occurrences in companion_runs since 2026-10-11 06:00Z) are closed as moot.
--     The code gap is CODE-REPAIR-PREPR-1 below (qnfo-fleet-control, held by another session's claim; code-probe closes it).
--  3. fm-companion-publish-stall (50 h): the stall's cause is no longer the 402 of #2106 but the grounding gate: 51 of 60
--     rejections since 2026-10-11 06:00Z name figures or names that are not in the source, and five attempts per run each
--     re-recall them. COMPANION-GROUNDING-REPAIR-1 carries the deterministic repair for the code loop; #2106 is superseded by it.
--  4. #2283 is moot: every directory it names carries a RETIRED or FOLDED marker and answers 404; in live workers the old theme
--     nouns occur only in an idea-hub comment (line 725) and a radar-hub classification keyword (line 18), not in a prompt.
-- Left with their owners: fm-observability-config-inert waits on PR 942 (qnfo-ops, open, another session); fm-register-row-
-- reescalated (4) on PR 965's rows 328/331/341/345; fm-closure-relapse-unreopened (5) reopens each issue on its next failing
-- probe; fm-removal-unprobeable and fm-unprobed-issues count issues filed in the last hours by other live sessions.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_superseded_contracts_upd; UPDATE code_tasks SET status = 'failed' WHERE id IN ('ct_frhtt8hi1nztli', 'ct_jy19s7wu3hzm93') AND merge_note LIKE 'CLOSEOUT-FAILURE-MODES-1%'; UPDATE code_tasks SET status = 'queued' WHERE id = 'ct_uc1fnkvme62wc9' AND merge_note LIKE 'CLOSEOUT-FAILURE-MODES-1%'; -- issues: reopen by issue_triage

-- 1. superseded closures through agent_issues.status
CREATE TRIGGER IF NOT EXISTS agent_issues_superseded_contracts_upd AFTER UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed', 'resolved') AND COALESCE(OLD.status, '') NOT IN ('closed', 'resolved')
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id
              AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'))
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END;

UPDATE issue_triage SET triage_state = 'closed'
WHERE issue_id IN (SELECT a.id FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id
                   WHERE a.status IN ('closed', 'resolved') AND t.triage_state <> 'closed'
                     AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'));

-- 2. refused code tasks
UPDATE code_tasks SET status = 'closed', lease_until = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  merge_note = 'CLOSEOUT-FAILURE-MODES-1 2026-10-12: moot; issue 2121 was fixed in D1 by SELFHEAL-EXEC-VERIFY-1 (migrations/2026-10-12-selfheal-exec-verify.sql), no worker change is needed'
WHERE id = 'ct_frhtt8hi1nztli' AND status = 'failed';
UPDATE code_tasks SET status = 'closed', lease_until = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  merge_note = 'CLOSEOUT-FAILURE-MODES-1 2026-10-12: moot; issue 2106''s DeepSeek 402 has 0 occurrences in companion_runs since 2026-10-11 06:00Z (composer gpt-oss-120b); the stall is the grounding gate, COMPANION-GROUNDING-REPAIR-1'
WHERE id IN ('ct_jy19s7wu3hzm93', 'ct_uc1fnkvme62wc9') AND status IN ('failed', 'queued');
UPDATE code_tasks SET status = 'queued', step = 'propose', attempts = attempts + 1, lease_until = NULL, pr_url = NULL,
  branch = 'codeagent-7xtqmvrmppmo-r2', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  ctx = json_remove(json_set(ctx, '$.repair_round', 1, '$.lastError', 'the merge runner refused your change: ' || substr(replace(last_error, 'merge-runner: ', ''), 1, 600) || '. Keep the goal; fix exactly this and keep every behaviour the worker''s existing tests pin.'), '$.proposal'),
  merge_note = 'CLOSEOUT-FAILURE-MODES-1 round 1 of 2 (CODE-REPAIR-INTASK-1 applied by hand: refused as a branch, before a pull request existed): re-proposed with the refusal as feedback'
WHERE id = 'ct_7xtqmvrmppmoxw' AND status = 'failed';

-- 3. companion grounding repair, superseding 2106
INSERT INTO agent_issues (title, description, priority, status, source)
SELECT 'COMPANION-GROUNDING-REPAIR-1: personal-companion throws away drafts whose only problem is a few ungrounded names or figures',
 'Charter pillar: personal. reading.q08.org has published nothing for 50 h (metric companion_hours_since_last_piece). Measured 2026-10-12 in personal-life.companion_runs since 2026-10-11 06:00Z: 60 rejections, 51 of them by groundingProblems (figure or name not in the source: e.g. "Proximal Policy Optimisation", "Soft Actor Critic", "78 %"), 0 DeepSeek 402s. The retry feedback already lists the problems and asks the model to remove them; gpt-oss-120b re-recalls them on each of the five attempts. Edit (one function, no model call): in the compose loop, when validatePiece fails and every problem starts with "grounding:", remove from the draft each sentence that contains one of the named items (exact substring, case-insensitive), then validate again; accept the repaired draft only if it passes validatePiece in full (length floor included) and at most a quarter of its sentences were removed; otherwise keep the current feedback path. Removing an unsupported sentence can only reduce claims, so the fact-check that follows still runs unchanged. Log the repair as a companion_runs stage row ("grounding repair: removed N sentences").
code-task: repo=qnfo-workers path=personal-companion/worker.js
code-anchor: var shortOnly = expandFeedback(v.problems, form, piece);',
 'high', 'open', 'session:closeout-failure-modes'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'COMPANION-GROUNDING-REPAIR-1:%' AND status = 'open');

UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = ''companion_hours_since_last_piece'') AS REAL) < 36 THEN ''1'' ELSE ''0'' END AS observed',
  verify_transport = 'd1-query', status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE 'COMPANION-GROUNDING-REPAIR-1:%' ORDER BY id DESC LIMIT 1);

UPDATE issue_triage SET triage_state = 'closed',
  close_evidence = 'superseded by #' || (SELECT id FROM agent_issues WHERE title LIKE 'COMPANION-GROUNDING-REPAIR-1:%' ORDER BY id DESC LIMIT 1) || ' (COMPANION-GROUNDING-REPAIR-1): the DeepSeek 402 has 0 occurrences in companion_runs since 2026-10-11 06:00Z; the stall''s cause is now the grounding gate (51 of 60 rejections)'
WHERE issue_id = 2106;
UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 2106 AND status = 'open';

-- 4. 2283 moot
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'moot: every directory the issue names (agent-orchestrator, qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-skill-sync, qnfo-errata-watch, qnfo-autopilot, qnfo-paper-explainer, jnl-referee, jnl-pipeline) carries a RETIRED or FOLDED marker and its workers.dev /health answers 404 (read 2026-10-12); in live workers the old theme nouns occur only in an idea-hub comment (worker.js:725) and a radar-hub classification keyword (worker.js:18), never in a prompt'
WHERE issue_id = 2283;
UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 2283 AND status = 'open';

-- 5. the pre-PR repair gap in qnfo-fleet-control (claimed by another session; the code-probe closes this when main has it)
INSERT INTO agent_issues (title, description, priority, status, source)
SELECT 'CODE-REPAIR-PREPR-1: in-task repair skips a goal-review refusal that arrives before the pull request exists',
 'Charter pillar: autonomy. qnfo-fleet-control CODE-REPAIR-INTASK-1 repairs a refusal only when "num && g.pr && g.pr.state === open", but the goal review refuses many tasks while they are still a pushed branch (pr_url is a compare link), so those fail without a repair round: ct_7xtqmvrmppmoxw, ct_jy19s7wu3hzm93 and ct_frhtt8hi1nztli on 2026-10-11 (fm-code-refusal-not-repaired). Edit: let the repair branch run when there is no pull request number (condition (!num || (g.pr && g.pr.state === "open")) && cmRepairable(t, d.why)), and in cmRepairInTask post the comment and close the pull request only when num is set. Owner: the next session that holds the claim on qnfo-fleet-control/worker.js (control plane; the code loop does not plan it until lever T1.23).
code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "absent": "if (d.action === \"refuse\" && num && g.pr && g.pr.state === \"open\" && cmRepairable(t, d.why))"}',
 'high', 'open', 'session:closeout-failure-modes'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'CODE-REPAIR-PREPR-1:%' AND status = 'open');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('superseded-closure-via-status', 'an issue closed through agent_issues.status with superseded evidence keeps active contracts',
  'SUPERSEDED-CLOSURE-HOLDS-1 fired only on issue_triage.triage_state, and some closers set agent_issues.status alone',
  'CLOSEOUT-FAILURE-MODES-1: agent_issues_superseded_contracts_upd fires on the status change too', 'covered by fm-superseded-closure-reopened', 'fm-superseded-closure-reopened', '2026-10-12', 2294,
  'a closer that writes agent_issues.status and close_evidence but not triage_state', 'closed superseded issues with active contracts', 'superseded closures reopened by their own probes');

-- 6. SESSION-RECORD-1 for this session.
INSERT OR REPLACE INTO session_records (session_id, wbs_code, agent_name, summary, decisions_made, files_changed, commits, infrastructure_changes, handoff_notes, execution_ratio, total_tasks, completed_tasks, started_at, completed_at)
VALUES ('session_01CWLpf5v1NjC9GXbM6rnH4k', 'AUTOREMEDIATE-2026-10-11', 'claude-code-session',
 'Owner asks 2026-10-11/12: audit and remediate every issue, failure mode and root cause automatically; raise code-loop success; resolve open issues; close out. Delivered PRs 904, 908, 913, 919, 962, 966, 971, 976, 977 and this closeout: probe drain, absent/min_version/code-probe forms, blocker red-team runner, in-task repair and suite pre-check for the code loop, companion parallel fact-check, superseded-closure holds, register dispositions, D1 reopen of relapsed closures, verification of 1,120 stranded self-heal rows, retired capability rows, heartbeat-free probes, probe-line edit-only triggers, and the closeout of the failing fm-* detectors.',
 'Fix in D1 where a loop is claimed by another session (reopen, self-heal verify, superseded closures); leave control-plane code to its claim holder with a code-probe issue (REGISTER-SCAN-DEDUPE-1, CODE-REPAIR-PREPR-1); close moot code tasks rather than retry dead causes; never close an owner-bound step (2077 cards 65/66 stay open, IDENTITY-BOUND).',
 'migrations/2026-10-11-*.sql, migrations/2026-10-12-*.sql (this session''s), scripts/remediation_consumer.py, scripts/blocker_redteam_runner.py, scripts/code-task-publish.py, qnfo-fleet-control/worker.js 0.16.0, qnfo-code-orchestrator/worker.js 0.10.0, personal-companion/worker.js 1.15.8, CLAUDE.md',
 'PRs 904 908 913 919 962 966 971 976 977 and the closeout PR',
 'D1 triggers: remediation_reopen_on_relapse_d1, selfheal_exec_verify_tick, service_registry_retire_capability_row, agent_issues_runtime_probe_upd/code_probe_upd (edit-only), triage/agent_issues superseded-contract triggers',
 'Open with owners: CODE-REPAIR-PREPR-1 and REGISTER-SCAN-DEDUPE-1 (qnfo-fleet-control, claimed by session_01GMk; code-probes close them); COMPANION-GROUNDING-REPAIR-1 (code loop, metric probe); 2077 (owner cards 65 and 66); 2272 (multi-worker grounding audit, code-task); PR 942 (qnfo-ops observability, other session) clears fm-observability-config-inert; PR 965 rows clear fm-register-row-reescalated; q08 publish stall 2034 with session_014Kr.',
 0.85, 20, 17, '2026-10-11T00:00:00Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
