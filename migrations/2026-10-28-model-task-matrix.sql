-- MODEL-MATRIX-1 (2026-10-28, charter pillar: cost): the use-case x model matrix from docs/MODEL-MATRIX.md as data every worker can read,
-- the 14 single-turn tool-call canaries run on 2026-10-28, and four issues that hand the hypothesis rows to the code loop.
-- Evidence: Workers AI catalog (73 models), ai_call_counters 14 d (25 models used; gpt-oss-120b 47% and glm-5.3-flash 24% of neurons),
-- cf_model_catalog (clef-flash candidate, agreement 0.1667 < 0.7). Prediction: moving gate, bulk and utility calls to the cheaper rows
-- lowers cost per successful task in cost_router_metrics without worsening v_output_quality_by_surface; revert = restore the old order.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE model_task_matrix; DELETE FROM routing_capability WHERE task_class = 'tool-call-single' AND updated_at = '2026-10-28'; close the four MODEL-MATRIX-1 issues as superseded.

CREATE TABLE IF NOT EXISTS model_task_matrix (
  task_class TEXT NOT NULL,
  role TEXT NOT NULL,            -- primary | fallback | escalate | verifier
  model TEXT NOT NULL,
  price_in REAL,                 -- USD per million input tokens (0 for per-minute / per-step models, see note)
  price_out REAL,
  status TEXT NOT NULL,          -- live | hypothesis (needs the A/B harness or the ops-scale canary before wiring)
  gate TEXT,                     -- what must hold before this row serves traffic
  note TEXT,
  updated_at TEXT,
  PRIMARY KEY (task_class, role, model)
);

INSERT OR IGNORE INTO model_task_matrix (task_class, role, model, price_in, price_out, status, gate, note, updated_at) VALUES
 ('gate-decision','primary','@cf/cloudflare/clef-flash',0.038,0,'hypothesis','per-question agreement with fleet labels >= 0.7','System One body (state + typed questions); 0 output tokens; canary agreement 0.1667 today','2026-10-28'),
 ('gate-decision','fallback','@cf/cloudflare/clef',0.24,0,'hypothesis','same','higher precision, 209 ms median','2026-10-28'),
 ('gate-decision','escalate','@cf/zai-org/glm-4.7-flash',0.0605,0.4,'live','JSON schema valid','chat JSON when a decision model disagrees with the labels','2026-10-28'),
 ('gate-decision-media','primary','@cf/cloudflare/clef-omni',0.15,0,'hypothesis','same','audio and video input','2026-10-28'),
 ('extract-typed','primary','@cf/cloudflare/clairic',0.1,0,'hypothesis','schema validation','takes {model, fields}, not chat messages','2026-10-28'),
 ('second-opinion','primary','typesafe/jev',0.042,0,'hypothesis','System One body via env.AI.run','third-party decision family; chat messages fail with 7003','2026-10-28'),
 ('embed','primary','@cf/baai/bge-m3',0.0118,0,'live','dimension check against the index','new indexes only; existing Vectorize indexes keep bge-base-en-v1.5','2026-10-28'),
 ('embed','fallback','@cf/qwen/qwen3-embedding-0.6b',0.0118,0,'live','dimension check','','2026-10-28'),
 ('embed','escalate','@cf/baai/bge-base-en-v1.5',0.0666,0,'live','','current model in 5 workers','2026-10-28'),
 ('rerank','primary','@cf/baai/bge-reranker-base',0.00311,0,'hypothesis','recall@k on a golden set','add to qnfo-ai-search and personal-api retrieval','2026-10-28'),
 ('safety-screen','primary','@cf/cloudflare/clef-flash',0.038,0,'hypothesis','agreement check','pre-screen for outbound text','2026-10-28'),
 ('safety-screen','fallback','@cf/meta/llama-guard-3-8b',0.484,0.03,'live','','','2026-10-28'),
 ('utility-text','primary','@cf/qwen/qwen3-30b-a3b-fp8',0.0509,0.335,'live','JSON schema valid','title, tag, rewrite, extract','2026-10-28'),
 ('utility-text','fallback','@cf/zai-org/glm-4.7-flash',0.0605,0.4,'live','','','2026-10-28'),
 ('utility-text','escalate','@cf/openai/gpt-oss-20b',0.2,0.3,'live','','','2026-10-28'),
 ('chat','primary','@cf/zai-org/glm-5.3-flash',0.15,0.5,'live','empty-content check','unchanged default','2026-10-28'),
 ('chat','fallback','@cf/openai/gpt-oss-120b',0.35,0.75,'live','','different family','2026-10-28'),
 ('chat','escalate','@cf/zai-org/glm-5.3',1.4,4.4,'live','','','2026-10-28'),
 ('bulk-background','primary','@cf/openai/gpt-oss-20b',0.2,0.3,'hypothesis','A/B win rate >= 0.40 against the incumbent','batch scoring and summaries','2026-10-28'),
 ('bulk-background','fallback','@cf/qwen/qwen3-30b-a3b-fp8',0.0509,0.335,'hypothesis','same','','2026-10-28'),
 ('bulk-background','escalate','@cf/zai-org/glm-5.3-flash',0.15,0.5,'live','','','2026-10-28'),
 ('agent-loop','primary','@cf/deepseek-ai/deepseek-v4.1-flash-1017',0.3,1.2,'hypothesis','ops-scale multi-turn canary','cached input 0.006/M; single-turn canary passed 2026-10-28','2026-10-28'),
 ('agent-loop','fallback','@cf/openai/gpt-oss-120b',0.35,0.75,'hypothesis','ops-scale multi-turn canary','single-turn canary passed 2026-10-28','2026-10-28'),
 ('agent-loop','escalate','@cf/deepseek-ai/deepseek-v4-pro-0813',1.32,3.96,'live','canary PASS 2026-09-26 (gateway deepseek-v4-pro)','','2026-10-28'),
 ('reasoning','primary','@cf/openai/gpt-oss-120b',0.35,0.75,'live','claim check','','2026-10-28'),
 ('reasoning','fallback','@cf/nvidia/nemotron-3-120b-a12b',0.5,1.5,'hypothesis','cf_model_catalog row is rejected yet 3128 calls ran in 14 d','fix the catalog row first','2026-10-28'),
 ('reasoning','escalate','@cf/zai-org/glm-5.3',1.4,4.4,'live','','','2026-10-28'),
 ('code-draft','primary','@cf/qwen/qwen3.8-27b',0.45,3.2,'hypothesis','tests pass, node --check','compare gpt-oss-120b on the code task set','2026-10-28'),
 ('code-draft','fallback','@cf/moonshotai/kimi-k2.7-code',0.95,4,'live','','4x the output price of gpt-oss-120b','2026-10-28'),
 ('code-draft','escalate','@cf/zai-org/glm-5.3',1.4,4.4,'live','','','2026-10-28'),
 ('long-context','primary','@cf/deepseek-ai/deepseek-v4.1-flash-1017',0.3,1.2,'hypothesis','A/B win rate >= 0.40','1M context, cheapest cached input','2026-10-28'),
 ('long-context','fallback','@cf/zai-org/glm-5.3-flash',0.15,0.5,'live','','1M context','2026-10-28'),
 ('long-context','escalate','@cf/deepseek-ai/deepseek-v4-pro-0813',1.32,3.96,'live','','1M context','2026-10-28'),
 ('outsider-prose','primary','@cf/zai-org/glm-5.3',1.4,4.4,'live','ENSEMBLE-POLICY-1 gate','disjoint families: zai, openai, moonshot, deepseek','2026-10-28'),
 ('outsider-prose','fallback','@cf/openai/gpt-oss-120b',0.35,0.75,'live','','','2026-10-28'),
 ('outsider-prose','escalate','@cf/moonshotai/kimi-k2.6',0.95,4,'live','','','2026-10-28'),
 ('vision','primary','@cf/meta/llama-3.2-11b-vision-instruct',0.0485,0.676,'live','','','2026-10-28'),
 ('vision','fallback','@cf/moondream/moondream3.1-9B-A2B',0.3,1,'live','','captioning','2026-10-28'),
 ('multilingual','primary','@cf/mistralai/mistral-small-3.1-24b-instruct',0.351,0.555,'live','','SEA: gemma-sea-lion-v4-27b-it; EU: eurollm-9b-it','2026-10-28'),
 ('translate','primary','@cf/meta/m2m100-1.2b',0.342,0.342,'live','','Indic: indictrans2-en-indic-1B','2026-10-28'),
 ('asr','primary','@cf/openai/whisper-large-v3-turbo',0,0,'live','','USD 0.000513 per audio minute','2026-10-28'),
 ('asr','fallback','@cf/deepgram/nova-3',0,0,'live','','USD 0.0052 per audio minute; streaming','2026-10-28'),
 ('tts','primary','@cf/myshell-ai/melotts',0,0,'live','','USD 0.000205 per audio minute','2026-10-28'),
 ('tts','fallback','@cf/deepgram/aura-2-en',0,0,'live','','USD 0.03 per 1k characters','2026-10-28'),
 ('image','primary','@cf/black-forest-labs/flux-1-schnell',0,0,'live','','','2026-10-28'),
 ('image','fallback','@cf/black-forest-labs/flux-2-klein-4b',0,0,'live','','','2026-10-28');

-- Single-turn tool-call canaries, 2026-10-28: five-tool ops schema, task "count rows in agent_issues"; all emitted ops_d1_query with correct
-- arguments. Recorded under tool-call-single, never agent-loop: one sample each, no multi-turn evidence.
INSERT OR IGNORE INTO routing_capability (model, task_class, tool_call_ok, evidence, updated_at) VALUES
 ('@cf/openai/gpt-oss-120b','tool-call-single',1,'canary PASS 2026-10-28 2.2 s; single turn only','2026-10-28'),
 ('@cf/openai/gpt-oss-20b','tool-call-single',1,'canary PASS 2026-10-28 1.1 s; single turn only','2026-10-28'),
 ('@cf/deepseek-ai/deepseek-v4.1-flash-1017','tool-call-single',1,'canary PASS 2026-10-28 1.1 s; single turn only','2026-10-28'),
 ('@cf/deepseek-ai/deepseek-v4-flash-0731','tool-call-single',1,'canary PASS 2026-10-28 2.8 s; single turn only','2026-10-28'),
 ('@cf/google/gemma-4-26b-a4b-it','tool-call-single',1,'canary PASS 2026-10-28 but 19.5 s; too slow for a loop','2026-10-28'),
 ('@cf/zai-org/glm-4.7-flash','tool-call-single',1,'canary PASS 2026-10-28 2.5 s; single turn only','2026-10-28'),
 ('@cf/qwen/qwen3-30b-a3b-fp8','tool-call-single',1,'canary PASS 2026-10-28 2.6 s; single turn only','2026-10-28'),
 ('@cf/nvidia/nemotron-3-120b-a12b','tool-call-single',1,'canary PASS 2026-10-28 3.2 s; single turn only','2026-10-28'),
 ('@cf/qwen/qwen3.8-27b','tool-call-single',1,'canary PASS 2026-10-28 4.5 s; single turn only','2026-10-28'),
 ('@cf/mistralai/mistral-small-3.1-24b-instruct','tool-call-single',1,'canary PASS 2026-10-28 3.4 s; single turn only','2026-10-28'),
 ('@cf/meta/llama-4-scout-17b-16e-instruct','tool-call-single',1,'canary PASS 2026-10-28 4.4 s; single turn only','2026-10-28'),
 ('@cf/zai-org/glm-5.3-flash','tool-call-single',1,'canary PASS 2026-10-28 5.4 s; single turn only','2026-10-28'),
 ('@cf/moonshotai/kimi-k2.6','tool-call-single',1,'canary PASS 2026-10-28 5.8 s; single turn only','2026-10-28'),
 ('@cf/ibm-granite/granite-4.0-h-micro','tool-call-single',1,'canary PASS 2026-10-28 5.5 s; arguments arrive double-encoded, needs the JSON-repair shim','2026-10-28');

-- The four issues below hand the hypothesis rows to the code loop. Each closes on a code-probe that cannot pass before the change.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'MODEL-MATRIX-1: qnfo-ops decision-model tier gate (Clef-flash, shadow mode)',
  'Charter pillar: cost. docs/MODEL-MATRIX.md row gate-decision. Add a shadow-mode call to @cf/cloudflare/clef-flash (System One body: state = the user task, one choice question tier with criteria free_small / cheap_mid / frontier, one noul question needs_tools) next to the existing task classification, log its answer and the model actually used to cost_router_metrics, and route on it only after the log shows agreement >= 0.7 with the incumbent over 200 calls. Note clef-flash scored 0.1667 agreement on the fleet category canary, so shadow first; no routing change in this task. Predicted metric: share of chat-class calls that reach a frontier or paid-gateway tier falls with no rise in escalations.' || char(10) ||
  'Mark the change with the string MODEL-MATRIX-1 in a comment so the probe can see it.' || char(10) ||
  'code-probe: {"paths": ["qnfo-ops/worker.js"], "contains": "MODEL-MATRIX-1"}' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-ops/worker.js' || char(10) ||
  'code-anchor: var UPSTREAM_GLM_MODEL = "@cf/zai-org/glm-5.3-flash";',
  'session', 'optimization', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'MODEL-MATRIX-1: qnfo-ops decision-model tier gate (Clef-flash, shadow mode)' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'MODEL-MATRIX-1: research-exec gate and bulk stages on the cheaper rows (A/B gated)',
  'Charter pillar: cost. qnfo-research-exec is the largest consumer: gpt-oss-120b carries review, revise, verify, complete, ensemble and reconcile (about 2.7M neurons in 7 d on gpt-oss-120b across those stages, ~595 neurons per call fleet-wide). Per docs/MODEL-MATRIX.md rows bulk-background and utility-text, run the claim, release and verify stages that return a short verdict on @cf/openai/gpt-oss-20b ($0.20 / $0.30 against $0.35 / $0.75), keeping gpt-oss-120b as the per-request fallback on empty reply and the existing MODELS order for writing stages (ENSEMBLE-POLICY-1: outsider-facing prose is untouched). Declare the new model in scripts/model-policy.json so qnfo-model-eval runs the paired A/B (threshold 0.40); revert on a regression. Predicted metric: research-exec neurons per published paper falls 15-25% (estimate, not measured) with the paper-quality outcome measures unchanged.' || char(10) ||
  'Mark the change with the string MODEL-MATRIX-1 in a comment.' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "MODEL-MATRIX-1"}' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: var MODELS_COST_ORDER = ["@cf/zai-org/glm-5.3-flash", "@cf/openai/gpt-oss-120b", "@cf/moonshotai/kimi-k2.6"];',
  'session', 'optimization', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'MODEL-MATRIX-1: research-exec gate and bulk stages on the cheaper rows (A/B gated)' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'MODEL-MATRIX-1: qnfo-model-eval ops-scale agent-loop canary and decision-model lane for the matrix hypotheses',
  'Charter pillar: cost. The matrix rows agent-loop (deepseek-v4.1-flash-1017, gpt-oss-120b) and gate-decision (clef-flash, clef, clef-omni, typesafe/jev) are hypotheses. Extend qnfo-model-eval so a sweep (1) runs the five-tool ops-scale multi-turn canary (at least 8 turns, tool results fed back) on every model with a tool-call-single row and writes the result to routing_capability under task_class agent-loop, and (2) scores each decision model per question against the fleet labels and writes the agreement per question to cf_model_catalog notes, with typesafe/jev called through env.AI.run with the System One body (a chat call returns 7003; qnfo-ops /diag-wai-multi is wrong the same way and is fixed here). Predicted effect: the matrix promotes or rejects each hypothesis row from evidence within one sweep.' || char(10) ||
  'Mark the change with the string MODEL-MATRIX-1 in a comment.' || char(10) ||
  'code-probe: {"paths": ["qnfo-model-eval/worker.js"], "contains": "MODEL-MATRIX-1"}' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-model-eval/worker.js' || char(10) ||
  'code-anchor: { tier: 1, model_id: "@cf/openai/gpt-oss-120b" },',
  'session', 'optimization', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'MODEL-MATRIX-1: qnfo-model-eval ops-scale agent-loop canary and decision-model lane for the matrix hypotheses' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'MODEL-MATRIX-1: neuron attribution misses gemma-4-26b and deepseek-v4-pro-0813',
  'Charter pillar: cost. ai_call_counters (14 d to 2026-10-28) shows @cf/google/gemma-4-26b-a4b-it with 105 calls and 0 neurons and @cf/deepseek-ai/deepseek-v4-pro-0813 with 1,132 calls and about 529 neurons, so their cost is invisible to every cost view; __AI_ATTR_RATES has no entry for gemma-4 and an apparently stale one for deepseek-v4-pro. Add the rates from the Workers AI price table (gemma-4-26b $0.10 / $0.30 per M tokens, cached input $0.05; deepseek-v4-pro-0813 $1.32 / $3.96, cached $0.044; neuron = $0.011 per 1,000) to the table in qnfo-ai and make the other workers that carry a copy match. Also reconcile cf_model_catalog: @cf/nvidia/nemotron-3-120b-a12b is rejected there yet ran 3,128 calls in q08-signal-engine. Predicted metric: no model with calls > 100 and neurons = 0 in ai_call_counters over 7 d.' || char(10) ||
  'Mark the change with the string MODEL-MATRIX-1 in a comment.' || char(10) ||
  'code-probe: {"paths": ["qnfo-ai/worker.js"], "contains": "MODEL-MATRIX-1"}' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-ai/worker.js' || char(10) ||
  'code-anchor: var __AI_ATTR_RATES = { "@cf/zai-org/glm-5.3": [127273, 400000]',
  'session', 'optimization', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'MODEL-MATRIX-1: neuron attribution misses gemma-4-26b and deepseek-v4-pro-0813' AND status = 'open');

-- Failure modes found by the audit (each has a code-task issue above or in the matrix doc).
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius) VALUES
 ('decision-model-called-as-chat', 'A decision model (typesafe/jev, Clef family) is called with chat messages and returns 7003 User Input Error, so it is never used', 'qnfo-ops /diag-wai-multi and the model lanes treat every model as chat; decision models take the System One body (state + typed questions)', 'MODEL-MATRIX-1: qnfo-model-eval decision lane calls them with the System One body and scores agreement per question', 'fm-decision-model-called-as-chat: typesafe/jev calls in ai_call_counters with errors = calls over 7 d, expected 0 after the lane lands', 'd1-query', '2026-10-28', 'typesafe/jev 1 call in 14 d; /diag-wai-multi returns 7003', 'every decision-model hypothesis row in model_task_matrix'),
 ('neuron-attribution-gap', 'A model with calls but 0 neurons in ai_call_counters hides its cost from every cost view', '__AI_ATTR_RATES has no entry for gemma-4-26b and a stale one for deepseek-v4-pro-0813', 'MODEL-MATRIX-1: add the rates in qnfo-ai and the workers that carry a copy', 'fm-neuron-attribution-gap: models with calls > 100 and neurons = 0 over 7 d, expected 0', 'd1-query', '2026-10-28', 'gemma-4-26b 105 calls 0 neurons; deepseek-v4-pro-0813 1132 calls 529 neurons', 'cost per successful task and fleet_budget caps'),
 ('catalog-status-contradicts-use', 'cf_model_catalog marks a model rejected while a worker runs it in production', 'the catalog status comes from the eval battery and no check reads ai_call_counters against it', 'MODEL-MATRIX-1: reconcile nemotron-3-120b-a12b (rejected, 3128 calls in 14 d) and add the check to model-floor-guard', 'fm-catalog-status-contradicts-use: rejected models with calls > 0 over 7 d, expected 0', 'd1-query', '2026-10-28', 'nemotron-3-120b-a12b rejected yet used by q08-signal-engine', 'the capability gate, which trusts the catalog row');

INSERT OR IGNORE INTO session_records (session_id, wbs_code, agent_name, summary, decisions_made, files_changed, commits, infrastructure_changes, handoff_notes, execution_ratio, total_tasks, completed_tasks, started_at, completed_at) VALUES
 ('model-matrix-1-20261028', 'QNFO.OPS', 'claude-code', 'MODEL-MATRIX-1: audited the 73-model Workers AI catalog against 14 days of usage, wrote the use-case x model matrix, ran 14 tool-call canaries, found that JEV and Clef are decision models the fleet never calls correctly.',
  'No worker switched: every cheaper row without multi-turn or A/B evidence is a hypothesis handed to the code loop. Clef gates go shadow-first because clef-flash agreement with fleet labels measured 0.1667. Agent-loop canary results recorded as tool-call-single, not agent-loop.',
  'docs/MODEL-MATRIX.md; migrations/2026-10-28-model-task-matrix.sql', 'PR 5125 (feat/model-matrix-1)',
  'qnfo-audit (on merge): model_task_matrix, 14 routing_capability rows, 3 failure_modes rows, 4 agent_issues MODEL-MATRIX-1',
  'Doer for the four MODEL-MATRIX-1 issues is the code loop; each closes on a code-probe containing MODEL-MATRIX-1 in the named worker. Not done: any model swap, and the measured cost delta (needs the swaps).', 0.83, 6, 5, '2026-10-28T00:00:00Z', '2026-10-28T23:59:00Z');
