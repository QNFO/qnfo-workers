-- ACT-BRIDGE-379-CODE-LEVER-BACKFILL-1 (2026-11-01, charter pillar autonomy).
-- Live read: breach_code_task_pct=7.1, with 6 of 85 breached triggers carrying a line-start code-task marker.
-- Three active triggers name single-worker code levers but do not expose them to ISSUE-INTAKE-1.
-- Prediction: if all three remain breached, the numerator rises from 6 to 9 and the share from 7.1% to 10.6%.
-- Rollback: UPDATE analytics_metric_triggers SET action = replace(action, char(10) || CASE id WHEN 392 THEN 'ACT-BRIDGE-379-20261101: Optimize qnfo-ai-search retrieval for the measured p95 latency regression.' || char(10) || 'code-task: repo=qnfo-workers path=qnfo-ai-search/worker.js' || char(10) || 'code-anchor: async function retrieve(env, query, cfg) {' WHEN 14731 THEN 'ACT-BRIDGE-379-20261101: Fix the dominant live probe-author rejection in qnfo-fleet-control while preserving read-only and privacy checks.' || char(10) || 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) || 'code-anchor: async function rtAuthorLivePathProbe(db, env, orphan) {' WHEN 14837 THEN 'ACT-BRIDGE-379-20261101: Improve the answer-opening plain-language prompt from sampled answer evidence without weakening grounding.' || char(10) || 'code-task: repo=qnfo-workers path=qnfo-ai-search/worker.js' || char(10) || 'code-anchor: function buildMessages(query, sources, graph, history, pinned) {' END, '') WHERE id IN (392, 14731, 14837)
-- APPLY-BY: ci
-- DB: qnfo-audit

UPDATE analytics_metric_triggers
SET action = action || char(10) ||
  CASE id
    WHEN 392 THEN 'ACT-BRIDGE-379-20261101: Optimize qnfo-ai-search retrieval for the measured p95 latency regression.'
    WHEN 14731 THEN 'ACT-BRIDGE-379-20261101: Fix the dominant live probe-author rejection in qnfo-fleet-control while preserving read-only and privacy checks.'
    WHEN 14837 THEN 'ACT-BRIDGE-379-20261101: Improve the answer-opening plain-language prompt from sampled answer evidence without weakening grounding.'
  END || char(10) ||
  CASE id
    WHEN 392 THEN 'code-task: repo=qnfo-workers path=qnfo-ai-search/worker.js'
    WHEN 14731 THEN 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js'
    WHEN 14837 THEN 'code-task: repo=qnfo-workers path=qnfo-ai-search/worker.js'
  END || char(10) ||
  CASE id
    WHEN 392 THEN 'code-anchor: async function retrieve(env, query, cfg) {'
    WHEN 14731 THEN 'code-anchor: async function rtAuthorLivePathProbe(db, env, orphan) {'
    WHEN 14837 THEN 'code-anchor: function buildMessages(query, sources, graph, history, pinned) {'
  END
WHERE id IN (392, 14731, 14837)
  AND instr(action, char(10) || 'code-task:') = 0
  AND action NOT LIKE 'code-task:%';

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES
  ('single-worker-metric-levers-reach-code-loop', 'migrations/2026-11-01-act-bridge-379-levers.sql',
   'ACT-BRIDGE-1 line-start code-task and code-anchor markers; qnfo-code-orchestrator ISSUE-INTAKE-1',
   'eligible metric-trigger actions pass their one-worker code levers to the code loop',
   '2026-11-01',
   'triggers 392, 14731, and 14837 carry explicit single-worker code-task and function-signature anchor lines');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'copilot:issue-2331',
  'The three currently breached triggers 392, 14731, and 14837 each name a code change in one worker and lack a line-start ACT-BRIDGE-1 task marker.',
  'append a concrete code-task and function-signature code-anchor to the three eligible trigger actions',
  'Read-only qnfo-audit query: breach_code_task_pct=7.1; 6 of 85 breached triggers carry the recognized marker; each selected action names a single-worker code lever.',
  'pending CI migration application and hourly metric re-read',
  'analytics_metric_triggers actions for ids 392, 14731, and 14837',
  'Rollback line of migrations/2026-11-01-act-bridge-379-levers.sql',
  'three single-worker metric levers can be dispatched to the code loop',
  'If the same 85 triggers remain breached, the recognized handoff share rises from 6/85 (7.1%) to 9/85 (10.6%) at the next metric refresh.',
  'No direct external reach gain is assumed; the change only routes eligible code work to its existing doer.',
  'Live read-only qnfo-audit trigger/actions query; offline SQLite migration replay and marker/anchor checks.'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'append a concrete code-task and function-signature code-anchor to the three eligible trigger actions'
);
