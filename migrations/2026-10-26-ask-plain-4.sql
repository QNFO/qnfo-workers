-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-ask-empty-answer-no-retry'; DELETE FROM failure_modes WHERE fm_key = 'ask-empty-answer-no-retry'
-- spof-review: no new cron, binding, host, credential or critical-path dependency; one failure_modes row, one detector contract and one decision.
-- ASK-PLAIN-4 (2026-10-26, charter pillar reach; qnfo-ai-search 2.10.3). Live replays after 2.10.2: (1) the selected-passage question was still answered from the wording's own sentence
-- because that sentence stayed in the body sections of the excerpt; (2) the qwen challenger returned no text after 50 s and the visitor saw nothing: ask_events counted an error against the arm
-- but no retry existed. Both are fixed in 2.10.3.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('ask-empty-answer-no-retry', 'a visitor asks a question on ask.qwav.tech and gets no answer text at all, only the sources',
  'the writer model returned no text (the qwen challenger arm spends its output budget thinking: 50 s, then an empty reply); the answer path logged "empty answer from <model>" against the arm and sent a bare done event, and only an exception, not an empty reply, fell back to another model',
  'ASK-PLAIN-4 (qnfo-ai-search 2.10.3): an empty reply is retried once on the champion model (FALLBACK_MODEL when the champion was the empty one) inside the 150 s answer deadline; the first try still counts against its arm',
  'code: the empty-answer retry is in the answer path', 'fm-ask-empty-answer-no-retry', '2026-10-26', NULL,
  'a question served by a model arm that returns no text (reasoning model, token budget spent)',
  'ask_events.error starts "empty answer from"; the page shows sources and no answer; done carries no follow-ups',
  'about one in five questions while a challenger arm is running (CHALLENGER_SHARE), and any question on a model that returns empty');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-ask-empty-answer-no-retry', NULL, 'ASK-PLAIN-4', 'failure-mode detector: the answer path retries an empty reply once on another model',
  '{"paths": ["qnfo-ai-search/worker.js"], "contains": "empty-answer retry"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('claude-code-ask-plain-20261026', 'a visitor always gets an answer when any configured model can write one, and an explain answer is built from the passages that explain, not from the sentence being explained',
   'ASK-PLAIN-4 (qnfo-ai-search 2.10.3): the wording''s sentence and the listed sentences are cut from the body sections of an explain excerpt; an empty reply is retried once on the champion''s model; answer cache revision r6',
   'live replays after 2.10.2 deployed: the selected-passage question answered "Anyon condensation means some anyons condense" and "Anyons condense to form a new phase"; the plain question returned a bare done event from the qwen arm after 50232 ms; What is a confined anyon? returned the extractive answer built from the listed passages',
   'applies with the canonical deploy of qnfo-ai-search 2.10.3', 'qnfo-ai-search answers on ask.qwav.tech and the paper-page rail; the retry adds at most one model call (inside the 150 s deadline) to an answer that would have been empty', 'revert qnfo-ai-search to 2.10.2 through the canonical path; DELETE rows named in the Rollback line of migrations/2026-10-26-ask-plain-4.sql',
   'ask.qwav.tech answers every question that a configured model can answer',
   'ask_events rows with error starting "empty answer from" are followed by an answer text from the champion model (answer_chars above 80); a replay of the selected-passage question lists what survives and what is confined', 'ask.qwav.tech and papers.qnfo.org readers', 'offline suites (ask-plain.test.mjs 62 checks: empty retry, both empty, wording cut, no repeat); live replay after the deploy');
