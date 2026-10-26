-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-ask-explain-weak-writer'; DELETE FROM failure_modes WHERE fm_key = 'ask-explain-weak-writer'
-- spof-review: no new cron, binding, host, credential or critical-path dependency (kimi-k2.6 is already a Workers AI model used by qnfo-gateway); one failure_modes row, one detector contract and one decision.
-- ASK-PLAIN-5 (2026-10-26, charter pillar reach; qnfo-ai-search 2.11.0). Live replays of 2.10.3 on the llama-3.3-70b champion, same question and same excerpt: one run restated the paper's defining sentences
-- (survive / confined), the next runs gave filler bullets ("Condenses means forms a connected algebra") or a gloss the paper does not give ("meaning they can still exist and move around freely"). The
-- excerpt and the instruction were not the variable; the writer was. An explain question is now written by kimi-k2.6 with reasoning off, outside the champion/challenger arms.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('ask-explain-weak-writer', 'an explain answer is sometimes extractive and right and sometimes filler or an invented gloss, for the same question and the same excerpt',
  'the champion writer (llama-3.3-70b, chosen by the A/B loop on the grounded share of ordinary questions) does not reliably paraphrase a definition without adding to it; explain questions are a small share of traffic, so the loop never selected a writer for them',
  'ASK-PLAIN-5 (qnfo-ai-search 2.11.0): EXPLAIN_MODEL (kimi-k2.6, reasoning off) writes explain questions, outside the champion and challenger arms (ask_events.arm explain); a lean answer under a breached spend cap keeps the cheapest model (BUDGET-SOFT-ROUTE-1); the grounding judge (ask_grounded_share_7d) and the plain share (ask_plain_share_7d) measure the result',
  'code: explain questions are routed to EXPLAIN_MODEL', 'fm-ask-explain-weak-writer', '2026-10-26', NULL,
  'an explain, define or what-is question on a paper whose passages need paraphrase, not extraction',
  'ask_events.answer for the same query differs between runs: one restates the passages, another gives bullets with a gloss that context does not hold',
  'every explain question while the champion is a weaker model');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-ask-explain-weak-writer', NULL, 'ASK-PLAIN-5', 'failure-mode detector: explain questions are routed to the explain model',
  '{"paths": ["qnfo-ai-search/worker.js"], "contains": "xt ? EXPLAIN_MODEL"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('claude-code-ask-plain-20261026', 'a writer that cannot paraphrase a definition without adding to it is the wrong writer for an explain question, and the cost of a stronger one on a small share of traffic is small',
   'ASK-PLAIN-5 (qnfo-ai-search 2.11.0): explain questions written by kimi-k2.6 (reasoning off, the paper-page API''s model), outside the champion/challenger arms; priced in RATES; answer cache revision r7',
   'six live replays after 2.10.3 deployed (llama-3.3-70b, same paper, same question family): one extractive and correct ("Anyons that braid trivially with the condensate survive ... others are confined"), five with filler bullets or an invented gloss; 15 to 20 s each, 60 s when rewritten',
   'applies with the canonical deploy of qnfo-ai-search 2.11.0', 'explain questions on ask.qwav.tech and the paper-page rail (about one in five questions); other questions unchanged', 'revert qnfo-ai-search to 2.10.3 through the canonical path; DELETE rows named in the Rollback line of migrations/2026-10-26-ask-plain-5.sql',
   'ask.qwav.tech explain answers are written by a model that paraphrases without adding',
   'replays of the same question after the deploy restate which anyons survive and which are confined in plain sentences in at least three of four runs, ask_grounded_share_7d stays at or above 0.85, ask_plain_share_7d at or above 0.7', 'ask.qwav.tech and papers.qnfo.org readers who ask what a term means', 'offline suites (ask-plain.test.mjs 66 checks: routing, reasoning switch, arm, pricing); live replays after the deploy');
