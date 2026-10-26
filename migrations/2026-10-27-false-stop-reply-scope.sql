-- FALSE-STOP-REPLY-SCOPE-1 (2026-10-27, pillar autonomy; metrics false_stops_7d and doctrine_proposals_open; kernel EVOLUTION classify step)
--
-- WHAT THE BREACH SAID: false_stops_7d read 9 (target 0) and doctrine_proposals_open read 1 (proposal 316,
-- false_stop:menu:ops_ai_log, open since 2026-10-25T09:00Z). The lever in both triggers is "the emitter": the worker whose reply
-- carries the signature. MEASURED 2026-10-26 on live D1: all nine hits are ops_ai_log rows. Read row by row (the full response, the
-- completion_tokens and the tool_calls of each), they are three different things, and only three of the nine are false stops.
--
--   REAL, kept (3): ops-1a418c26da88ce and ops-cbe5974fdaf051 (2026-10-20, an owner_verify probe from curl: "If you want owner
--     access, say so and I'll call owner_login ...") and ops-2ec01565c60188 (2026-10-22: "if you want it as a formal agent issue ...
--     the next time a write-capable session runs"). They are conditional offers. No reply since 2026-10-22T04:02Z carries one, so the
--     emitter already stopped; the hits leave the 7-day window by themselves (two at 2026-10-27T11:00Z, the last at 2026-10-29T05:00Z).
--     Nothing here hides them.
--
--   MODEL REASONING STORED AS THE REPLY (4 hits, 3 rows): ops-6a811b4c1aa914, ops-935c733638a008, ops-b5681a392e5615. Each has
--     completion_tokens equal to the generation cap (8192 for the streamed agent-tools turn, 8000 for the two BUDGET-AUTO-PROMOTE-1
--     continuations, tool_calls [] on both) and a response of 19989 to 20000 characters that is the model thinking aloud: "Good data.
--     Now let me analyze", "Let me reconstruct where I am", "Hmm hold on, wait. Let me re-", ending mid-word. qnfo-ops merges
--     reasoning_content into content when content is empty (callGLM, budgetFallback: FM-GLM-REASONING 2026-09-27), so a turn that runs
--     out of tokens while still reasoning is logged ok = 1 with its chain of thought as the answer, and "alternatively", "would you
--     like" and "the fix is to" inside that thinking are counted as the agent's decisions. That is a defect, but in qnfo-ops, not a
--     doctrine failure: it is registered below as failure mode ops-capped-reply-logged-ok with its own detector and a code task, and
--     v_agent_replies stops counting output that was cut at the cap as a reply. 64 ops_ai_log rows of the last 7 days sit at or above
--     8000 completion tokens, but completion_tokens is summed over the rounds of a tool turn (the maximum is 56815), so the rule keys
--     on the two exact cap values (8000, 8192), never on a threshold: 15 rows in 14 days carry one of them and 13 of the 15 are
--     19000 or more characters long.
--
--   NOT AN OPTION OR AN OFFER (2 hits): ops-020796cbd0e3c5 reports that two proposals duplicated an in-force recognition and quotes the
--     kernel's signature strings in double quotes ("if you want", "let me know if", "shall I", "would you like"); doctrine CONVENTION
--     says strings in quotes are quoted patterns, evidence of a shape and not statements. ops-97b030716fb1c7 is a final reply whose
--     failure-mode paragraph names two competing causes of a budget cut ("... alternatively the 10-20 cut may have been a deliberate
--     owner cost decision"), which CORE-PROMPT rule 1 requires and which hands the owner nothing to choose. v_false_stop_candidates
--     now ignores a phrase that appears only inside double quotes or backticks. The second is a judgment on one row and is recorded as
--     such, not turned into a rule: "alternatively" stays a menu signature.
--
-- WHAT THIS FILE DOES
--   1. Copies the six hits that are not false stops into false_stop_hits_reclassified, each with its class and reason (the BACKUP table:
--      nothing is lost, and the Rollback line puts them back), then deletes them from false_stop_hits. The capped-output hits are
--      chosen by the rule (reply_id joined to ops_ai_log with completion_tokens in 8000, 8192), the other two by id.
--   2. Re-creates v_agent_replies (the ops_ai_log branch skips rows cut at the generation cap) and v_false_stop_candidates (a phrase
--      inside double quotes or backticks is a mention). The kernel_registries_tick trigger on fleet_tick reads the second view, so the
--      two DROP VIEW / CREATE VIEW statements follow each other directly. The other four branches are unchanged.
--   3. Disposes doctrine proposal 316 as rejected with its red-team result. The proposal asks the emitter to choose and execute instead
--      of listing options. That rule is already in force (kernel 8.2.1 RECOGNITION carries the menu signature and false_stop_register
--      carries the redirect), and the signal behind it was not a recurrence of the shape (above). Nothing is adopted and no rule text
--      changes, so there is no governance change to land by PR. A proposal row is keyed by source, so a later real menu pattern from
--      ops_ai_log is not proposed again, but false_stops_7d still counts it.
--   4. Registers failure mode ops-capped-reply-logged-ok with its detector (remediation_contracts class fm-ops-capped-reply-logged-ok,
--      d1-query, expected 0) and files the code task for qnfo-ops. qnfo-ops/worker.js was under another session's live claim
--      (qnfo-code-orchestrator ct_k8a2vo2fkvbuq1) when this was written, so the fix goes to the code loop and is not made here.
--   5. Records the decision in decision_log.
--
-- EXPECTED AFTER APPLY: false_stops_7d reads 3 at the next hourly refresh (the kernel_registries_tick runs when the minute is under 10),
-- 1 from 2026-10-27T12:00Z and 0 from 2026-10-29T06:00Z if no new reply carries a signature. doctrine_proposals_open reads 0 at the
-- next refresh. The detector contract reads observed 15 or so until qnfo-ops stops logging capped output as a successful reply.
--
-- RISK: a legitimate reply that finished at exactly 8000 or 8192 completion tokens is not scanned. That is a one-in-thousands
-- coincidence for a summed multi-round turn and the cap itself is the reason for the truncation, and the fm detector still reports
-- every such row. If qnfo-ops changes max_tokens, add the new value here and in fm-ops-capped-reply-logged-ok together.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: false_stop_hits_reclassified
-- Rollback: INSERT OR IGNORE INTO false_stop_hits (id, ts, source, reply_id, reply_ts, pattern_key, phrase, excerpt) SELECT id, ts, source, reply_id, reply_ts, pattern_key, phrase, excerpt FROM false_stop_hits_reclassified WHERE migration = 'FALSE-STOP-REPLY-SCOPE-1';
--           DROP VIEW IF EXISTS v_false_stop_candidates; DROP VIEW IF EXISTS v_agent_replies; then re-run the two CREATE VIEW statements of migrations/2026-10-12-20-kernel-registries.sql;
--           UPDATE doctrine_proposals SET status = 'proposed', red_team_result = NULL, metrics_improved = NULL, version = NULL, disposed_at = NULL WHERE id = 316 AND source = 'false_stop:menu:ops_ai_log';
--           DELETE FROM remediation_contracts WHERE class = 'fm-ops-capped-reply-logged-ok'; DELETE FROM failure_modes WHERE fm_key = 'ops-capped-reply-logged-ok';

CREATE TABLE IF NOT EXISTS false_stop_hits_reclassified AS
SELECT h.id, h.ts, h.source, h.reply_id, h.reply_ts, h.pattern_key, h.phrase, h.excerpt,
  CASE WHEN h.reply_id = 'ops-020796cbd0e3c5' THEN 'quoted-signature'
       WHEN h.reply_id = 'ops-97b030716fb1c7' THEN 'hypothesis-not-option'
       ELSE 'output-cap-reasoning' END AS reclass_class,
  CASE WHEN h.reply_id = 'ops-020796cbd0e3c5' THEN 'the reply quotes the kernel signature strings in double quotes while reporting that two proposals duplicated an in-force recognition: a quoted pattern is a mention, not a statement (doctrine CONVENTION)'
       WHEN h.reply_id = 'ops-97b030716fb1c7' THEN 'the final reply names two competing causes in its failure-mode paragraph (CORE-PROMPT rule 1 requires one): a hypothesis about a cause, not an option handed to the owner'
       ELSE 'model reasoning cut at the generation cap and stored as the response: completion_tokens equals the cap (8000 or 8192) and the text is chain of thought, not an emitted reply (qnfo-ops merges reasoning_content into content when content is empty). Tracked as fm-ops-capped-reply-logged-ok.' END AS reclass_reason,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS reclassified_at,
  'FALSE-STOP-REPLY-SCOPE-1' AS migration
FROM false_stop_hits h
WHERE h.source = 'ops_ai_log'
  AND (h.reply_id IN ('ops-020796cbd0e3c5', 'ops-97b030716fb1c7')
       OR h.reply_id IN (SELECT o.id FROM ops_ai_log o WHERE o.completion_tokens IN (8000, 8192)));

DELETE FROM false_stop_hits WHERE id IN (SELECT id FROM false_stop_hits_reclassified WHERE migration = 'FALSE-STOP-REPLY-SCOPE-1');

DROP VIEW IF EXISTS v_false_stop_candidates;

DROP VIEW IF EXISTS v_agent_replies;

CREATE VIEW v_agent_replies AS
SELECT source, reply_id, reply_ts, body FROM (
  SELECT 'ops_ai_log' AS source, id AS reply_id, replace(substr(ts, 1, 19), 'T', ' ') AS reply_ts, COALESCE(response, '') AS body
    FROM ops_ai_log WHERE COALESCE(response, '') <> '' AND COALESCE(completion_tokens, 0) NOT IN (8000, 8192)
  UNION ALL
  SELECT 'owner_prompts', id, replace(substr(ts, 1, 19), 'T', ' '), COALESCE(response, '')
    FROM owner_prompts WHERE COALESCE(response, '') <> ''
  UNION ALL
  SELECT 'session_records', session_id, replace(substr(created_at, 1, 19), 'T', ' '), COALESCE(summary, '') || ' ' || COALESCE(handoff_notes, '')
    FROM session_records
)
UNION ALL
SELECT source, reply_id, reply_ts, body FROM (
  SELECT 'ask_events' AS source, id AS reply_id, replace(substr(ts, 1, 19), 'T', ' ') AS reply_ts, COALESCE(answer, '') AS body
    FROM ask_events WHERE COALESCE(answer, '') <> ''
  UNION ALL
  SELECT 'chatbox_conversations', id, replace(substr(ts, 1, 19), 'T', ' '), COALESCE(response, '')
    FROM chatbox_conversations WHERE source = 'chatbox' AND COALESCE(response, '') <> ''
);

CREATE VIEW v_false_stop_candidates AS
SELECT r.source, r.reply_id, r.reply_ts, p.pattern_key, p.phrase,
       substr(r.body, MAX(1, instr(lower(r.body), p.phrase) - 60), 200) AS excerpt
  FROM v_agent_replies r JOIN false_stop_phrases p ON p.scope = 'reply'
       AND instr(replace(replace(lower(r.body), '"' || p.phrase || '"', ''), char(96) || p.phrase || char(96), ''), p.phrase) > 0
  WHERE NOT EXISTS (SELECT 1 FROM false_stop_phrases d WHERE d.scope = 'disposition' AND instr(lower(r.body), d.phrase) > 0)
UNION ALL
SELECT r.source, r.reply_id, r.reply_ts, 'report-as-question', '?', substr(r.body, MAX(1, length(r.body) - 200), 201)
  FROM v_agent_replies r
  WHERE substr(rtrim(r.body, ' ' || char(9) || char(10) || char(13)), -1) = '?'
    AND NOT EXISTS (SELECT 1 FROM false_stop_phrases d WHERE d.scope = 'disposition' AND instr(lower(r.body), d.phrase) > 0)
UNION ALL
SELECT 'owner_prompts.prompt', o.id, replace(substr(o.ts, 1, 19), 'T', ' '), p.pattern_key, p.phrase,
       substr(o.prompt, MAX(1, instr(lower(o.prompt), p.phrase) - 60), 200)
  FROM owner_prompts o JOIN false_stop_phrases p ON p.scope = 'user' AND instr(lower(COALESCE(o.prompt, '')), p.phrase) > 0;

UPDATE doctrine_proposals SET status = 'rejected', version = '8.2.1', disposed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  metrics_improved = 'false_stops_7d, doctrine_proposals_open',
  red_team_result = 'Red-team 2026-10-26 (FALSE-STOP-REPLY-SCOPE-1, migrations/2026-10-27-false-stop-reply-scope.sql). The proposal asks the ops_ai_log emitter to choose and execute instead of presenting a menu. That rule is already in force: kernel 8.2.1 RECOGNITION carries the menu signature and false_stop_register.menu carries the redirect (choose, execute the chosen path, mention the alternative only as context), so adopting it again adds no doctrine. The signal behind it was also not a recurrence of the shape. Of the three counted hits, ops-b5681a392e5615 and ops-935c733638a008 are model reasoning cut at the 8000-token generation cap and stored as the response (tool_calls empty, 19989 and 20000 characters, ending mid-sentence), and ops-97b030716fb1c7 is a final reply whose failure-mode paragraph names two competing causes, which CORE-PROMPT rule 1 requires and which hands the owner no choice. Classified transient (a detector artifact), not a doctrine defect, in the kernel EVOLUTION classify step, so no rule is proposed and no text changes. The artifact is fixed at its cause: v_agent_replies no longer counts output cut at the generation cap, and the capped-output defect is its own failure mode (fm-ops-capped-reply-logged-ok) with a code task for qnfo-ops. Risk named: a proposal row is keyed by source, so a later real menu pattern from ops_ai_log is not proposed again, but false_stops_7d still counts it.'
WHERE id = 316 AND source = 'false_stop:menu:ops_ai_log' AND status = 'proposed';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('ops-capped-reply-logged-ok', 'a qnfo-ops model turn that stops at the generation cap while still reasoning is returned and logged as a successful reply with its chain of thought as the text',
  'callGLM and budgetFallback copy reasoning_content into content when content is empty (FM-GLM-REASONING, 2026-09-27, so a reasoning-only reply never surfaces as empty), and nothing looks at finish_reason: a turn that spends all 8000 (BUDGET-AUTO-PROMOTE-1 continuation) or 8192 (streamed turn) tokens thinking returns 20000 characters of thinking as the answer with ok = 1',
  'the code loop changes qnfo-ops so that a turn cut at the cap with no content is continued or retried once, or answered with a one-line incomplete notice, instead of returning its reasoning, without raising ops_agent_empty_answers_7d (which counts empty and ok = 0 agent-tools rows); v_agent_replies already skips these rows so the kernel scan does not read thinking as a decision',
  'the fm-ops-capped-reply-logged-ok contract counts ops_ai_log rows of the last 7 days with ok = 1 and completion_tokens equal to 8000 or 8192, expected 0',
  'fm-ops-capped-reply-logged-ok', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'an ops_ai_log row with ok = 1 and completion_tokens exactly 8000 or 8192',
  'a chat or workflow caller receives pages of unfinished reasoning as the answer, and the false_stops_7d scan counted words inside it ("alternatively", "would you like") as decisions: 4 of 9 hits on 2026-10-26',
  'qnfo-ops agent-tools, chat and job-workflow turns that exhaust the output cap while reasoning (15 rows in 14 days), and every caller that reads their text');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-ops-capped-reply-logged-ok', NULL, 'FALSE-STOP-REPLY-SCOPE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ops_ai_log WHERE ok = 1 AND completion_tokens IN (8000, 8192) AND ts > strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-7 days'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-ops', 1, 'active', 'failure-mode', datetime('now'));

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'OPS-CAPPED-REPLY-1: a qnfo-ops turn cut at the generation cap returns its reasoning as the reply',
  'Charter pillar: autonomy. Root cause: qnfo-ops copies reasoning_content into content when content is empty (callGLM, FM-GLM-REASONING 2026-09-27) and never reads finish_reason, so a turn that spends its whole output cap thinking is returned and logged ok = 1 with its chain of thought as the answer. Measured 2026-10-26 on qnfo-audit.ops_ai_log: 15 rows in 14 days have completion_tokens exactly 8000 (job-workflow, BUDGET-AUTO-PROMOTE-1 continuations, tool_calls empty) or 8192 (streamed agent-tools and chat turns), 13 of them 19000 or more characters long and ending mid-sentence; ops-6a811b4c1aa914 was logged as the reply to a public chat turn and begins "Good data. Now let me analyze". Four of the nine false_stops_7d hits on 2026-10-26 were words inside this thinking.' || char(10) ||
  'Doer: qnfo-code-orchestrator (qnfo-ops is on the loop canary list). Lever: where the model result is turned into the reply, read finish_reason. When it is length and the text came from reasoning_content, do not return the reasoning: continue or retry the round once, or return one honest line that the output cap was reached, and write the row so that the fm detector counts it only when it still happens. Do not mark agent-tools rows ok = 0 as the only change, because ops_agent_empty_answers_7d counts ok = 0 agent-tools rows and is already in breach. Tag the change OPS-CAPPED-REPLY-1 in the version line.' || char(10) ||
  'Definition of done: the contract fm-ops-capped-reply-logged-ok (SELECT COUNT(*) FROM ops_ai_log WHERE ok = 1 AND completion_tokens IN (8000, 8192) AND ts > now - 7 days) reads 0 seven days after the deploy, ops_agent_empty_answers_7d is not higher than before the change, and the deployed /health version carries the tag. Write the numbers into issue_triage.close_evidence.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-ops/worker.js' || char(10) ||
  'code-anchor: if (_g0 && !String(_g0.content || "").trim() && _g0.reasoning_content && !(_g0.tool_calls && _g0.tool_calls.length)) _g0.content = String(_g0.reasoning_content);' || char(10) ||
  'code-probe: {"paths": ["qnfo-ops/worker.js"], "contains": "OPS-CAPPED-REPLY-1"}',
  'session', 'reliability', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title LIKE 'OPS-CAPPED-REPLY-1:%' AND status = 'open'
);

UPDATE failure_modes SET issue_id = (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'OPS-CAPPED-REPLY-1:%')
WHERE fm_key = 'ops-capped-reply-logged-ok' AND issue_id IS NULL;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'fork-falsestops',
  'a detector counts emitted replies: model thinking cut at the output cap, a quoted signature string and a stated cause are not false stops, and a reclassification keeps the rows and the reason',
  'FALSE-STOP-REPLY-SCOPE-1: six false_stop_hits moved to false_stop_hits_reclassified with a class and reason each, v_agent_replies skips ops_ai_log output cut at the cap (completion_tokens 8000 or 8192), v_false_stop_candidates ignores a phrase only inside double quotes or backticks, doctrine proposal 316 rejected with its red-team result, failure mode ops-capped-reply-logged-ok with a detector and a code task for qnfo-ops',
  'qnfo-audit 2026-10-26 read-only: the nine false_stop_hits rows read with their ops_ai_log response, completion_tokens and tool_calls (3 real conditional offers, 4 hits in 3 reasoning rows at 8000 or 8192 tokens, 1 quoted signature list, 1 hypothesis); 15 capped ok = 1 rows in 14 days with 13 over 19000 characters; the new candidate view run against the last 8 days returned only the three real offers plus the one hypothesis',
  'migration merged',
  'two views (the old text is in migrations/2026-10-12-20-kernel-registries.sql), six rows moved to a backup table, one proposal row, one failure mode, one detector contract, one agent_issues row',
  'the Rollback header of migrations/2026-10-27-false-stop-reply-scope.sql',
  'a reply scan that reads emitted replies and keeps a ledger of what it set aside',
  'false_stops_7d reads 3 after the next hourly refresh, 1 from 2026-10-27T12:00Z, 0 from 2026-10-29T06:00Z with no new signature in a reply, doctrine_proposals_open reads 0',
  'none',
  'd1:qnfo-audit read-only ops_ai_log rows and candidate query, node:sqlite fixtures in migrations/false-stop-reply-scope.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'FALSE-STOP-REPLY-SCOPE-1:%');
