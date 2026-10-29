-- PLUS-1 slice 1 (2026-10-29, agent_issues 1000791, charter pillar autonomy; serves reach and personal products).
-- Owner directive 2026-10-29: plussing (always make it better by adding) is a fleet philosophy; products (routing and website product lines,
-- me.q08.org and the rest) improve automatically without the owner prompting each change. Programs set priority and budget; products are the
-- unit that gets plussed. Measured gap: qnfo-audit had programs, program_charters, program_focus and v_roadmap_originated but no product table,
-- so a built product (me.q08.org Today tab) had no owner loop, no outcome metric and no plus schedule.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_product_plus_debt; DROP TABLE IF EXISTS products;
-- metric-exemption: this slice registers no metric. Slice 2 (qnfo-fleet-control manager assessment) writes products_unplussed_over_7d together with
--   its trigger, because a metric ships with its trigger (CORE-PROMPT-1 rule 5) and the writer does not exist yet.
-- runtime-probe (D1): SELECT count(*) FROM products -- expected >= 6

CREATE TABLE IF NOT EXISTS products (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  program TEXT NOT NULL,
  url TEXT NOT NULL,
  worker TEXT,
  outcome_metric TEXT,
  plus_cadence_days INTEGER NOT NULL DEFAULT 7,
  last_plussed_at TEXT,
  last_plus_ref TEXT,
  state TEXT NOT NULL DEFAULT 'live',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO products (key, name, program, url, worker, outcome_metric) VALUES
  ('me-q08', 'me.q08.org personal dashboard (Today)', 'QNFO.PERSONAL', 'https://me.q08.org', 'personal-api', 'personal return visits per week (named in slice 2)'),
  ('fleet-dashboard', 'Fleet dashboard and command line', 'QNFO.OPS', 'https://fleet.qnfo.org', 'qnfo-fleet-dashboard', 'pageviews_30d'),
  ('qnfo-gateway', 'qnfo.org landing, subscribe and papers host', 'QNFO.REACH', 'https://qnfo.org', 'qnfo-gateway', 'subscribers_growth_monthly'),
  ('papers', 'papers.qnfo.org research library', 'QNFO.RSCH', 'https://papers.qnfo.org', 'qnfo-gateway', 'zenodo_downloads_total'),
  ('ideas-hub', 'ideas.qnfo.org idea intake', 'QNFO.REACH', 'https://ideas.qnfo.org', 'idea-hub', 'pageviews_30d'),
  ('ask-qwav', 'ask.qwav.org research explainer', 'QNFO.RSCH', 'https://ask.qwav.org', 'qnfo-ai-search', 'pageviews_30d'),
  ('router', 'ai.qnfo.org routing gateway', 'QNFO.INFRA', 'https://ai.qnfo.org', 'qnfo-router', 'unified_cost_usd_30d');

-- One row per live product: days since it was last plussed against its cadence. A product never plussed is maximally in debt.
CREATE VIEW IF NOT EXISTS v_product_plus_debt AS
SELECT key, name, program, url, plus_cadence_days, last_plussed_at,
  CASE WHEN last_plussed_at IS NULL THEN NULL ELSE CAST(julianday('now') - julianday(last_plussed_at) AS INTEGER) END AS days_since_plus,
  CASE WHEN last_plussed_at IS NULL OR julianday('now') - julianday(last_plussed_at) > plus_cadence_days THEN 1 ELSE 0 END AS in_debt
FROM products WHERE state = 'live'
ORDER BY (last_plussed_at IS NULL) DESC, last_plussed_at ASC;
