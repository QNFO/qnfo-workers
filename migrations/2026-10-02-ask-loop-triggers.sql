-- ASK-LOOP-1 triggers (2026-10-02, pillars reach + autonomy). Idempotent; applied live by the session that wrote it.
--
-- qnfo-ai-search 2.0.0 registers eight ask_* metrics in metric_registry (hourly). METRIC-CLOSED-LOOP-1 asks every change
-- that registers a metric to add its trigger. These triggers fire at each metric's KILL band and go to the digest
-- (queue_target 'digest', not agent_issues) because the acting loop is ASK-LOOP-1 itself, which would otherwise file a
-- duplicate issue for the same breach:
--   * error rate, p95 latency and citation validity: ASK-FIX-1 files one agent_issue with a `code-task:` line and a
--     `code-anchor:` (the code loop, qnfo-code-orchestrator ISSUE-INTAKE-1, turns it into a PR; the merge runner merges on
--     green checks and verifies live), and closes it with close_evidence when the metric is measured back in band;
--   * grounded share, retrieval MRR, helpful rate and cost per answer: ASK-TUNE-1 tunes ask_config (offline golden-set
--     eval for retrieval, 20% online A/B for generation, automatic revert); six kill-band days in seven raise an owner card
--     whose default keeps the current champion.
-- The digest firing still lands in analytics_action_log, so remedy_efficacy_30d grades these remedies like any other.
-- ask_answers_7d is a reach report for a new surface (no trigger yet: a threshold needs a traffic history first).

WITH v(metric_key, title, operator, threshold, priority, action) AS (VALUES
  ('ask_error_rate_7d', 'ask.qwav.tech: more than 15% of answers fail', 'gt', 0.15, 7, 'Pillar reach. Acting loop: ASK-LOOP-1 (qnfo-ai-search) files ASK-FIX-1 with a code-task line for the code loop after two daily kill readings, and closes it with live evidence. Check GET https://qnfo-ai-search.q08.workers.dev/api/loop (fix_issues, runs).'),
  ('ask_p95_total_ms_7d', 'ask.qwav.tech: p95 answer time over 40 s', 'gt', 40000, 6, 'Pillar reach. Acting loop: ASK-LOOP-1 (qnfo-ai-search) files ASK-FIX-1 with a code-task line (anchor: the retrieve function) after two daily kill readings. Check /api/loop on qnfo-ai-search.'),
  ('ask_citation_validity_7d', 'ask.qwav.tech: answers cite sources that do not exist', 'lt', 0.9, 7, 'Pillar reach. Acting loop: ASK-LOOP-1 (qnfo-ai-search) files ASK-FIX-1 with a code-task line (anchor: the citation rule of the system prompt) after two daily kill readings. Check /api/loop on qnfo-ai-search.'),
  ('ask_grounded_share_7d', 'ask.qwav.tech: under 70% of judged claims are supported by the cited excerpts', 'lt', 0.7, 7, 'Pillar reach. Acting loop: ASK-TUNE-1 (qnfo-ai-search) A/B-tests generation settings and adopts only judged improvements; six kill days in seven raise an owner card. Check /api/loop (experiments).'),
  ('ask_retrieval_mrr', 'ask.qwav.tech: retrieval misses the expected paper (golden-set MRR under 0.3)', 'lt', 0.3, 6, 'Pillar reach. Acting loop: ASK-TUNE-1 (qnfo-ai-search) tunes retrieval parameters daily against the golden set. If MRR stays low, the corpus index (qnfo-corpus AI Search) is the next lever.'),
  ('ask_helpful_rate_30d', 'ask.qwav.tech: visitors rate under 40% of answers useful', 'lt', 0.4, 6, 'Pillar reach. Acting loop: ASK-TUNE-1 (qnfo-ai-search); read the low-rated questions in ask_events joined with ask_feedback for the pattern (coverage gap vs answer quality).'),
  ('ask_cost_per_answer_usd_7d', 'ask.qwav.tech: an answer costs more than $0.01', 'gt', 0.01, 6, 'Pillar cost. Acting loop: ASK-TUNE-1 (qnfo-ai-search) adopts a cheaper generation model when its judged quality holds; the global daily cap (400 answers) bounds spend meanwhile.')
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, 'registry', v.operator, v.threshold, v.priority,
       v.action || ' Definition of done: the metric is back inside its kill band in metric_registry; ASK-LOOP-1 records the before and after values.',
       'qnfo-ai-search', 'digest', 168, 1, 'ASK-LOOP-1 2026-10-02; acting loop is qnfo-ai-search (digest target avoids a duplicate issue)'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);
