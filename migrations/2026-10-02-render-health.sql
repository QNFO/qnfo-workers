-- RENDER-HEALTH-1 (2026-10-02, pillar reach). Applied live by the session that wrote it.
--
-- Why. On 2026-10-02 a session swept all 450 papers.qnfo.org pages by hand and found 446 with rendering defects (raw
-- Markdown, broken tables, mispaired maths). Nothing in the fleet measured this, so the defects had accumulated unseen.
-- After RENDER-FIX-3 (PR 514) and the source repairs (agent_issues 1806), the same tests find 0 to 3 pages.
--
-- The loop (no session needed):
--   measure  qnfo-gateway 3.9.2 cron 06:00 renders every public paper as its page does and writes papers.render_defects
--            (living-paper D1) with the count of raw ** opening a word, raw heading markers, raw table rules and an odd
--            number of unescaped $; GET https://papers.qnfo.org/api/render-health lists the pages (open, no token);
--   publish  qnfo-paper-indexer 3.0.11 cron 06:05 writes metric_registry.paper_render_defect_pages;
--   judge    v_metric_trigger_state; act: evaluateMetricTriggers files one agent_issues row with the code task below.
-- Guard metric (INTEGRITY-GUARDS-1): traffic work (docs/outreach/living-papers-launch-2026-10.md) must not raise it.

-- 1. living-paper D1 (70a58cb3-...): two columns on papers (no new table).
-- ALTER TABLE papers ADD COLUMN render_defects INTEGER;
-- ALTER TABLE papers ADD COLUMN render_checked_at TEXT;

-- 2. qnfo-audit D1: the metric and its trigger.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('paper_render_defect_pages', 'product', 'guard', 'count(living-paper.papers WHERE public AND render_defects <> 0 AND render_checked_at in the last 2 days): papers.qnfo.org pages whose rendered text still shows raw **, a raw # heading, a raw table rule or an odd number of $', 'living-paper.papers.render_defects via GET https://papers.qnfo.org/api/render-health', '446 (2026-10-02 manual sweep, before RENDER-FIX-3)', '0', 'qnfo-gateway', 'qnfo-paper-indexer', 'daily', '1-3', '> 3', 'n/a', 'daily');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES
 ('paper_render_defect_pages', 'Paper pages render raw Markdown (RENDER-HEALTH-1)', 'registry', 'gt', 3, 6,
  'Pillar reach (RENDER-HEALTH-1). GET https://papers.qnfo.org/api/render-health lists the pages and their defect counts. If several unrelated pages broke at once, the renderer regressed: diff renderMarkdown against the last good gateway version and run qnfo-gateway/render.test.mjs. If one or two pages broke, the source did: correct living-paper.papers.body_md for that slug after copying the row to a backup table. Definition of done: paper_render_defect_pages <= 3 on two consecutive daily sweeps, verified by the metric, not by a deploy.
code-task: repo=qnfo-workers path=qnfo-gateway/worker.js
code-anchor: function renderMarkdown(md) {',
  'qnfo-gateway', 'agent_issues', 168, 1, 'RENDER-HEALTH-1, migrations/2026-10-02-render-health.sql');
