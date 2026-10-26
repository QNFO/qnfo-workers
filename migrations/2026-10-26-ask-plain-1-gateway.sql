-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-ask-api-closed-quotation'; DELETE FROM failure_modes WHERE fm_key = 'ask-api-closed-quotation'
-- spof-review: no new cron, binding, host, credential or critical-path dependency; one failure_modes row and one detector contract.
-- ASK-PLAIN-1, second surface (2026-10-26, charter pillar reach; qnfo-gateway 3.43.4; the ask.qwav.tech half is migrations/2026-10-26-ask-plain-1.sql). POST papers.qnfo.org/api/ask told
-- the model to "quote or paraphrase it closely" and the agent-skill description promised an answer "whose every line quotes the paper": the opposite of the brief that Ask answers use plain,
-- simple language grounded in the existing sources. The prompt now asks for plain language with each specialist term explained from the paper's own text and forbids explaining a phrase by repeating it.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('ask-api-closed-quotation', 'the paper-page ask API answers by quoting the paper closely, so a reader who asks what a phrase means gets the phrase back',
  'qnfo-gateway askSystemPrompt rule 1 said "quote or paraphrase it closely" and the ask-qnfo-paper agent skill promised that every returned line quotes a sentence of the paper; neither asked for plain words or for each specialist term to be explained',
  'ASK-PLAIN-1 (qnfo-gateway 3.43.4): rule 1 asks for plain language, short sentences, each specialist term explained from the paper text on first use, and no circular explanation; the skill description and body say the same and carry a new digest',
  'code: askSystemPrompt no longer asks for close quotation', 'fm-ask-api-closed-quotation', '2026-10-26', NULL,
  'a question to POST /api/ask that asks what a phrase or term in the paper means',
  'the answer repeats the paper sentence; the ask-qnfo-paper skill text says every line quotes the paper',
  'POST papers.qnfo.org/api/ask callers and agents that follow the ask-qnfo-paper skill');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-ask-api-closed-quotation', NULL, 'ASK-PLAIN-1', 'failure-mode detector: the gateway ask prompt does not ask for close quotation',
  '{"paths": ["qnfo-gateway/worker.js"], "absent": "quote or paraphrase it closely"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);
