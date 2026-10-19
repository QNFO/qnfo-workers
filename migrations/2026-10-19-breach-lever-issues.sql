-- BREACH-LEVER-ISSUES-1 (2026-10-19, pillar autonomy; follow-up of migrations/2026-10-19-breach-code-task-anchors.sql, agent_issues 99926).
-- That file gave triggers 9193, 5394 and 5916 a lever, a code-task line and an anchor, which lifts breach_code_task_pct. It cannot hand the
-- levers to the code loop: the open METRIC-TRIGGER issues 100045 (9193), 99943 (5394) and 99949 (5916) were filed before the lever, and
-- evaluateMetricTriggers (qnfo-fleet-control) files a trigger action only when it inserts a new issue, dedupes against an open one and
-- reopens a closed or monitoring twin with its old description (METRIC-TRIGGER-TWIN-1), so none of them will ever carry a code-task line.
-- OWNER-NO-LOOSE-ENDS-1: a suggestion is implemented or filed as an agent_issues row a doer executes. A session could not write D1
-- directly, so the canonical path (this migration, applied by CI) carries the three rows, one per lever, with the code-task and code-anchor
-- lines of the trigger and a code-probe that closes the row when the edit is on main. Each marker below is text the edit must introduce and
-- that occurs nowhere in its file today (read 2026-10-19 on main). The rows are single-row VALUES inserts: agent_issues refuses the
-- INSERT ... SELECT shape at compile time (migrations/2026-10-18-issue-sla-guard-reliable.sql). No worker, cron or trigger is added.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM agent_issues WHERE title LIKE 'BREACH-LEVER-9193:%' OR title LIKE 'BREACH-LEVER-5394:%' OR title LIKE 'BREACH-LEVER-5916:%'

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'BREACH-LEVER-9193: q08-signal-engine factCheckExtra gives qwen3.8-27b no reasoning switch, so 89 of 114 calls failed in 24 h',
 'Charter pillar: autonomy (ACT-BRIDGE-1). Trigger 9193 ai_model_error_rate_max_1d (open METRIC-TRIGGER issue 100045, which carries no code-task line because evaluateMetricTriggers never rewrites an open issue) is the highest per-model error rate in ai_call_counters over 24 h. Measured 2026-10-19 12:00Z: @cf/qwen/qwen3.8-27b 114 calls, 89 errors (0.781), caller q08-signal-engine only. factCheckExtra (read by the compose, title-repair, reader-panel and fact-check calls) gives nemotron, kimi, deepseek and gpt-oss a measured reasoning switch, and its comment says models without one (glm, gemma, llama, qwen) get none: a reasoning model spends the token budget before it answers, so the reply is empty.' || char(10) ||
 'Edit: in q08-signal-engine/worker.js factCheckExtra add one line straight after the nemotron line: if (m.indexOf("qwen") >= 0) return { chat_template_kwargs: { enable_thinking: false } }; and drop qwen from the comment above the function. Keep every other branch and every other caller as they are.' || char(10) ||
 'Definition of done: ai_model_error_rate_max_1d is under 0.5 at two metric refreshes. The next model, @cf/zai-org/glm-5.3-flash at 0.516, is mostly qnfo-research-exec calls retried after a rate limit and is the lever after this one.' || char(10) ||
 'code-task: repo=qnfo-workers path=q08-signal-engine/worker.js' || char(10) ||
 'code-anchor: if (m.indexOf("nemotron") >= 0) return { chat_template_kwargs: { enable_thinking: false } };' || char(10) ||
 'code-probe: {"paths": ["q08-signal-engine/worker.js"], "contains": "m.indexOf(\"qwen\") >= 0"}',
 'claude-session:session_01JADz8uHqYt9eUMBTwbbBE6', 'reliability', 'high', 'open',
 CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'BREACH-LEVER-5394: POOL-BOUND-1 never parks owner-corpus rows, so the 267-row deferred research pool stays above 120',
 'Charter pillar: research (ACT-BRIDGE-1). Trigger 5394 research_deferred_pool (open METRIC-TRIGGER issue 99943, which carries no code-task line because evaluateMetricTriggers never rewrites an open issue) stands at 267 against a target of 120. Measured 2026-10-19 12:00Z: research_queue holds 267 deferred rows, every one with a source proposal named owner-corpus and contact owner. The POOL-BOUND-1 pool query in qnfo-fleet-control researchBackpressureTick ranks name LIKE owner% and contact owner as pri 1, and the bound parks only pri 2 rows beyond research_deferred_max (60, no ops_config row), so the pool of 267 is never parked. idea-hub proposalKind separates corpus (a model extraction from the owner notebook, accepted at score 0) from direct (owner-written); 532 corpus rows entered research_queue between 10-13 and 10-17, so the idea-hub admission cap is not the lever.' || char(10) ||
 'Edit: in qnfo-fleet-control/worker.js researchBackpressureTick change only the pri CASE of the pool query (the SELECT that ends AS pri): after the remediation branch add WHEN EXISTS (SELECT 1 FROM idea_proposals p WHERE CAST(p.id AS TEXT) = q.source_id AND p.name = ''owner-corpus'') THEN 2, so the notebook extractions are parked like any generated row. Leave RB_ORDER_SQL and the ready-queue order as they are, so the best 60 stay in line and the rest are parked with the revert line POOL-BOUND-1 writes and re-armed by priority when the pool is under 30. Test: a pool of 267 owner-corpus rows parks 207 and keeps 60.' || char(10) ||
 'Definition of done: research_deferred_pool is at or under 120 and content_items_over_stage_sla falls with it.' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
 'code-anchor: var over = pool.slice(pbMax).filter(function (r) { return Number(r.pri) === 2; });' || char(10) ||
 'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "owner-corpus"}',
 'claude-session:session_01JADz8uHqYt9eUMBTwbbBE6', 'research', 'medium', 'open',
 CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'BREACH-LEVER-5916: the reviser aiText sends deepseek no reasoning switch, so the thin-paper writer answers with nothing and 140 thin papers stay live',
 'Charter pillar: research (ACT-BRIDGE-1). Trigger 5916 papers_live_failing_release_gate (open METRIC-TRIGGER issue 99949, which carries no code-task line because evaluateMetricTriggers never rewrites an open issue) reads 139 against a target of 0: the quality sweep reports revise=140 on 10-17, 10-18 and 10-19 (640 published, 500 pass). THIN-PRIOR-WORK-1 (qnfo-research-exec since 0.21.0) runs once an hour with THIN_BATCH 2 and logged 4 outcomes in paper_revision_log: 1 thin-prior-work-queued and 3 thin-prior-work-rejected with section check too-short (0 chars). Its writer is @cf/deepseek-ai/deepseek-v4-flash-0731 called through the reviser aiText(env, prompt, model, maxTokens), which sends no reasoning switch and returns an empty string when the reply has no content; q08 factCheckExtra records chat_template_kwargs thinking false as the measured switch for deepseek (finish length, 0 chars without it). A rejected paper waits a day (thinCandidates), so each empty reply costs the paper 24 hours.' || char(10) ||
 'Edit: in qnfo-research-exec/worker.js aiText build the request in a const body (messages, max_tokens) and, when the model is deepseek, add the switch: if (/deepseek/.test(m)) body.chat_template_kwargs = { thinking: false }; then pass body to env.AI.run in place of the inline object. Keep the cross-family re-read, the HARD-finding fail-closed rule and the release gate check as they are.' || char(10) ||
 'Definition of done: papers_live_failing_release_gate is below 139 and falling, and paper_revision_log shows thin-prior-work-queued for most thin-paper writer calls.' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
 'code-anchor: async function aiText(env, prompt, model, maxTokens) {' || char(10) ||
 'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "/deepseek/.test(m)"}',
 'claude-session:session_01JADz8uHqYt9eUMBTwbbBE6', 'research', 'medium', 'open',
 CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
