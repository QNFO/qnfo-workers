-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: none needed (one append-only decision_log row; the worker change reverts through the canonical path)
-- spof-review: no new cron, binding, host, credential or critical-path dependency; one decision_log row.
-- ASK-PLAIN-7 (2026-10-26, charter pillar reach; qnfo-ai-search 2.11.2). METRIC-UNMEASURED-1 (agent_issues 1000473) holds the new metric ask_plain_share_7d as "no value": it needs 10 answers with a verdict
-- and only 4 real answers had been written since the verdict existed. The producer was right; the sample was small. The judge stores the text of every answer for 30 days, so the measure tick computes the
-- verdict for earlier rows from it, and the metric reads at once with the week before the fix as its baseline. Nothing is written by hand: the value is the producer's own, as the issue requires.

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('claude-code-ask-plain-20261026', 'a new quality metric should read from the data the fleet already holds instead of waiting days for fresh traffic, and its baseline is the behaviour before the fix',
   'ASK-PLAIN-7 (qnfo-ai-search 2.11.2): measure() computes ask_events.plain for rows that have a stored answer and no verdict (up to 300 a tick, last 7 days), then measures ask_plain_share_7d as before',
   'metric_registry ask_plain_share_7d UNMEASURED with trigger enabled; agent_issues 1000473 METRIC-UNMEASURED-1; ask_events: 24 real answers in 7 days, 4 with a verdict (2.10.0 deployed 2026-10-26)',
   'applies with the canonical deploy of qnfo-ai-search 2.11.2', 'ask_events.plain of rows already written; a verdict computed from text the judge stored', 'revert qnfo-ai-search to 2.11.1 through the canonical path; backfilled verdicts are proxy flags and may stay',
   'the fleet reads the plainness of last week''s Ask answers as a baseline',
   'ask_plain_share_7d holds a value at the first measure tick after the deploy and agent_issues 1000473 closes on its own probe', 'ask.qwav.tech quality loop', 'offline suite qnfo-ai-search/ask-plain.test.mjs (72 checks: backfill of explain, ordinary, too-short and answerless rows; measure note)');
