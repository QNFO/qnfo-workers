-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'nothing to restore: the two issues are withdrawn by closing them through issue_triage.close_evidence with the reason (a status write without evidence is refused), and decision_log is append-only';
--
-- QNFO-AI-SPEND-REFUSAL-TWIN-1 (2026-10-26, charter pillar cost; companion to the independent review of qnfo-ai 5.40.0, agent_issues 1000408). decision_log is append-only and an issue is closed only with
-- evidence, so the Rollback line restores nothing; no DELETE or DROP runs in this file, so it names no BACKUP table.
--
-- WHAT THE REVIEW FOUND (both verified by driving the real qnfo-ai fetch handler with stub bindings and a stub D1, 2026-10-26, severity low to medium): the router serves a DeepSeek route whose paid upstream
--   is refused (the 402 breaker, or spendGuardPaid at the router ledger and fleet caps: "spend-governor: ... paid upstream skipped") by the same family on Workers AI, by name (DEEPSEEK-TWIN-1, BUDGET-SOFT-ROUTE-1:
--   a breached cap steers model choice and never stops work). That holds for the non-stream turn (runModelTurn). It does not hold for two other callers of callDeepSeek:
--   1. the STREAM branch: the refusal falls into the stream catch, whose qnfoAiFreeFallback starts at glm-5.3-flash with tools dropped, and the one-chunk SSE it writes names the route asked for (routedModel) as the
--      model that answered;
--   2. the oversize-ensemble context fallback (a prompt past the ensemble's 262k context): a refusal returns HTTP 502, a stop, where a breached cap must steer (it needs roughly 760k characters, so it is rare;
--      it fails the same way for the 402 breaker with no cap breached, so the quality floor of 5.40.0 only adds one more way in).
-- WHAT THIS FILE DOES: files one issue for each, with the doer (the code loop, a one-file change in qnfo-ai/worker.js), the anchor and a closing code-probe, and records the decision, including three review
--   findings that are recorded and not scheduled, with the reason.

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'QNFO-AI-STREAM-SPEND-TWIN-1: a streamed DeepSeek route that the paid-call guard refuses ends on glm-5.3-flash with tools dropped, not on its Workers AI twin, and the stream names the wrong model',
  'Charter pillar: cost. BUDGET-SOFT-ROUTE-1 (owner directive 2026-10-06): a breached spend cap steers model choice and never stops work; DEEPSEEK-TWIN-1: a DeepSeek route whose paid key is unfunded or spend-capped is served by the same family on Workers AI, by name. Found 2026-10-26 by the independent review of qnfo-ai 5.40.0 and reproduced by driving the real fetch handler with stub bindings.' || char(10) ||
  'Defect: runModelTurn (non-stream) catches /^deepseek 402|^spend-governor/ from callDeepSeek and serves dsTwinSpec(effSpec) with served_by and twin_reason. The stream branch (effSpec.api, the callDeepSeek call in the code-anchor below) has no such catch: the refusal reaches the stream catch, which calls qnfoAiFreeFallback (the free chain starts at glm-5.3-flash, tools dropped), and the SSE chunks it writes carry model: routedModel, the route the caller asked for, not the model that answered. Trigger: stream true, model deepseek-v4-pro or deepseek-v4-flash (or an auto route that resolves to an api model), and a refusal at spendGuardPaid (router ledger total at or over its cap, the deepseek cap, or the fleet cap; the live ledger read 61.47 against a cap of 60 on 2026-10-26) while spendGovern still allows the route, for example because the quality floor lifted its downgrade.' || char(10) ||
  'Doer: qnfo-code-orchestrator, one file. In the stream branch, catch the refusal (the same pattern runModelTurn matches) and, when dsTwinSpec(effSpec) returns a twin, serve the twin through the Workers AI stream branch that precedes it, set _servedBy to effSpec.waTwin, and name the model that served in the SSE chunks (the free fallback chunks too). Add a suite that drives the fetch handler with stream true on deepseek-v4-pro and deepseek-v4-flash with the guard refusing and the 402 breaker open (served by the twin, tools kept, the chunk model named) and with no twin (the existing free fallback, honestly named). Put the marker QNFO-AI-STREAM-SPEND-TWIN-1 in the code comment. Bump VERSION as a patch above main and keep deployed-current.worker.js identical.' || char(10) ||
  'Definition of done: the code-probe below passes and the suite is in the repository.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-ai/worker.js' || char(10) ||
  'code-anchor: const upstream = await callDeepSeek(env, effSpec.api, messages, max_tokens, true, tools, { temperature: effTemp, top_p: effTopP, tool_choice: clientToolChoice });' || char(10) ||
  'code-probe: {"paths": ["qnfo-ai/worker.js"], "contains": "QNFO-AI-STREAM-SPEND-TWIN-1"}',
  'session', 'reliability', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'QNFO-AI-STREAM-SPEND-TWIN-1:%' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1: the oversize-ensemble context fallback returns HTTP 502 when the paid DeepSeek upstream is refused, a stop where BUDGET-SOFT-ROUTE-1 says steer',
  'Charter pillar: cost. BUDGET-SOFT-ROUTE-1 (owner directive 2026-10-06): a breached spend cap steers model choice and never stops work. Found 2026-10-26 by the independent review of qnfo-ai 5.40.0 and reproduced (HTTP 502 "ensemble failed: spend-governor: deepseek 30d spend ... paid upstream skipped") by driving the real fetch handler with stub bindings.' || char(10) ||
  'Defect: when an ensemble request (model ensemble, or an auto route that ensembles) carries a prompt past the ensemble primary context minus CTX_SAFETY_MARGIN (roughly 225k tokens, 760k characters), the router takes the ensemble-context-fallback branch and calls callDeepSeek (the code-anchor below) with no guard against its refusal. A refusal (the 402 breaker, the deepseek cap, or the router ledger total at its cap) lands in the ensemble catch and returns 502. The same request returns 200 with the key funded and no cap breached. It fails the same way with no cap breached when the key returns 402, so it predates the quality floor; the floor of 5.40.0 adds one more way in (it lifts the ensemble collapse at a breached total cap, which used to route the request to a single cheap leg). The oversize path also truncates to the 1M-token deepseek-v4-flash context because MODELS has no entry named ensemble.' || char(10) ||
  'Doer: qnfo-code-orchestrator, one file. Catch the refusal in the context-fallback branch (the pattern /^deepseek 402|^spend-governor/ that runModelTurn matches) and serve the request from the Workers AI twin of deepseek-v4-flash (MODELS["deepseek-v4-flash"].waTwin through runWorkersAI) with the _router block naming the twin and the reason, truncating the prompt to the twin context. Add a suite that drives the fetch handler with an oversize ensemble prompt and the guard refusing (200 from the twin) and funded (unchanged). Put the marker QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1 in the code comment. Bump VERSION as a patch above main and keep deployed-current.worker.js identical.' || char(10) ||
  'Definition of done: the code-probe below passes and the suite is in the repository.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-ai/worker.js' || char(10) ||
  'code-anchor: const fb = await callDeepSeek(env, MODELS["deepseek-v4-flash"].api, messages, fbCap, false);' || char(10) ||
  'code-probe: {"paths": ["qnfo-ai/worker.js"], "contains": "QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1"}',
  'session', 'reliability', 'low', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1:%' AND status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'two refusal paths that end in a stop or a free-fallback instead of the same-family twin are defects against BUDGET-SOFT-ROUTE-1 and belong with the code loop as one-file tasks; the other findings of the review are either refuted as a documented limit or too small to be worth their code',
  'QNFO-AI-SPEND-REFUSAL-TWIN-1: filed QNFO-AI-STREAM-SPEND-TWIN-1 (medium) and QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1 (low) with the doer, anchor and closing code-probe; recorded and not scheduled: (a) the floor reads one global scalar (skeptics refuted it as a defect: COST-QUALITY-FLOOR-1 reading 1 specifies it, and a per-surface gate needs outcome measures that do not exist yet for papers and ask), (b) the lift is all-or-nothing across callers (same reading), (c) the week-over-week sawtooth (a persistent drop reads flat after seven days; the baseline belongs to docs/OUTPUT-QUALITY-LEDGER.md and the measures have under seven days of history), (d) the cold-isolate race (concurrent first requests see the initial 0 for one D1 read, about 30 ms; waiting on the read would put a D1 round trip on every cold request for a guard that is advisory), (e) coverage beyond qnfo-ai (the workers that spend most neurons call their own AI binding and carry their own caps)',
  'review of 5.40.0 by four lenses with independent skeptics (53 journal entries); the two filed items were reproduced by driving the real fetch handler with stub bindings; (a) and (b) were refuted by a skeptic against the written reading, (c) (d) (e) were reproduced and rated low',
  'applied through the canonical path on merge: the migration runner applies this file; the code loop picks the two code tasks',
  'two agent_issues rows and one decision row in qnfo-audit; the doers touch qnfo-ai/worker.js behind the canary and automatic revert. No secret, no binding, no other table',
  'run the Rollback line (stops the stream-path issue when it has no evidence) and close the ensemble-context issue through the triage row with the reason',
  'a refused paid DeepSeek upstream is served by the same family on every path that calls it, as the non-stream turn already does',
  'the two code-probes pass on main and no stream or oversize-ensemble request ends on a free fallback or a 502 for a spend refusal',
  'router callers that stream (chat clients, the dashboard) keep their requested family under a breached cap; no change for any outside audience',
  'repository read of qnfo-ai/worker.js, node:sqlite replay in migrations/qnfo-ai-spend-refusal-twin.test.mjs, the review workflow journal (four lenses, skeptic verdicts)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'QNFO-AI-SPEND-REFUSAL-TWIN-1:') = 1);
