-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-ask-plain-explains-from-memory'; DELETE FROM failure_modes WHERE fm_key = 'ask-plain-explains-from-memory'
-- spof-review: no new cron, binding, host, credential or critical-path dependency; one failure_modes row, one detector contract and one decision.
-- ASK-PLAIN-2 (2026-10-26, charter pillar reach; qnfo-ai-search 2.10.1). Follow-up to migrations/2026-10-26-ask-plain-1.sql after the first live replay of 2.10.0 on the failing question:
-- no longer circular, but the writer explained from memory ("Particles are like tiny things [1]", "Condenses means comes together [1]", a "not defined" note for a term the paper does define). The
-- instruction "everyday words" and "say what a thing is or does before you use its specialist name" invited background that no excerpt contains, and no check looked for it.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('ask-plain-explains-from-memory', 'asked for plain words, an Ask answer replaces the paper''s terms with analogies and general definitions that no excerpt contains, and cites them',
  'ASK-PLAIN-1 told the writer to use everyday words and to say what a thing is before naming it; a model with the excerpt text in front of it fills the gap from memory, and the deterministic grounding check looks for identifiers, links and figures, not for background',
  'ASK-PLAIN-2 (qnfo-ai-search 2.10.1): plain means short sentences with the excerpts'' own terms glossed from the excerpts; the prompt, the explain instruction and the rewrite request forbid analogy, general definitions and background; sentenceProblems removes a sentence with an analogy marker that no excerpt uses; answer cache revision r4. The grounding judge (ask_grounded_share_7d) samples the rest',
  'code: the analogy check is in sentenceProblems and the prompt no longer asks for everyday words', 'fm-ask-plain-explains-from-memory', '2026-10-26', NULL,
  'a request to explain a term in plain words, on a paper that gives the term only a one-line description',
  'ask_events.answer carries "is like", "means ..." glosses or "think of" that the context column does not hold; the judge counts them unsupported',
  'every explain question on ask.qwav.tech and in the paper-page rail');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-ask-plain-explains-from-memory', NULL, 'ASK-PLAIN-2', 'failure-mode detector: the analogy check is in the ask grounding pass',
  '{"paths": ["qnfo-ai-search/worker.js"], "contains": "analogy: "}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('claude-code-ask-plain-20261026', 'plain language means shorter sentences and the source''s own terms glossed from the source, not new explanations from the model''s memory',
   'ASK-PLAIN-2 (qnfo-ai-search 2.10.1): plain-language rule rewritten around the excerpts'' own terms, explain instruction and rewrite request forbid analogy, general definitions and background, analogy markers no excerpt uses are removed, answer cache revision r4',
   'live replay after 2.10.0 deployed (llama-3.3-70b champion): "It means particles come together. Particles are like tiny things [1]." and "Condenses means comes together [1]." for Explain "a subset of anyons in a parent phase condenses"; neither statement is in the paper, whose excerpt gives the child-category and confinement sentences',
   'applies with the canonical deploy of qnfo-ai-search 2.10.1', 'qnfo-ai-search answers on ask.qwav.tech and the paper-page rail', 'revert qnfo-ai-search to 2.10.0 through the canonical path; DELETE rows named in the Rollback line of migrations/2026-10-26-ask-plain-2.sql',
   'ask.qwav.tech explains in short sentences using the paper''s own terms and passages',
   'a replay of the same question after the deploy does not state an analogy or a general definition that the paper lacks, and ask_grounded_share_7d stays at or above 0.85', 'ask.qwav.tech and papers.qnfo.org readers who ask what a term means', 'offline suites (ask-plain.test.mjs 55 checks, ask-ground, ask-loop); live replay after the deploy');
