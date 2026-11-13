-- Q08-FAMILY-PM-1 (Rowan 2026-11-13, charter pillar reach; autonomy): the q08 family is a program of "signals to value" products and each product has its own
-- growth product manager. Rowan: "there better be a product manager that's advocating for improvement and pushing things through ... all of those are some kind of
-- signals to value ... it needs that feedback loop."
-- Before: q08-home rolled up to "brand", the reading list (mind.q08.org) and the signal reports had no manager, markets had only its in-worker PM.
-- Now: q08-signals (q08.org signal reports, the AI-content testbed), q08-markets and q08-mind are registry products with their own 7-day growth metrics read
-- from product_growth_counters (written hourly by q08-signal-engine writeGrowthCounters; companion-today and jobs already have theirs). GROWTH-PM-1 then
-- picks each product's weakest metric, files GROWTH-1 code tasks, predicts, measures and keeps or rolls back. v_q08_family is the roll-up the q08.org page reads.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM product_family WHERE family = 'q08'; DELETE FROM product_growth_metrics WHERE product IN ('q08-signals','q08-markets','q08-mind'); DELETE FROM product_registry WHERE product IN ('q08-signals','q08-markets','q08-mind'); INSERT OR REPLACE INTO product_growth_parent (product, parent) VALUES ('q08-home', 'brand'); DROP VIEW IF EXISTS v_q08_family; DROP TABLE IF EXISTS product_family

CREATE TABLE IF NOT EXISTS product_family (family TEXT NOT NULL, product TEXT NOT NULL, role TEXT NOT NULL, signal_in TEXT NOT NULL, value_out TEXT NOT NULL, PRIMARY KEY (family, product));

INSERT OR IGNORE INTO product_registry (product, host, worker, program_code, what_for, plus_cadence_h, state) VALUES ('q08-signals', 'q08.org', 'q08-signal-engine', 'QNFO.REACH', 'Signal reports: public signals turned into checked, sourced reports, and the testbed for AI-generated content', 24, 'active');
INSERT OR IGNORE INTO product_registry (product, host, worker, program_code, what_for, plus_cadence_h, state) VALUES ('q08-markets', 'markets.q08.org', 'q08-prediction-markets', 'QNFO.REACH', 'Forecasts on real prediction-market questions, scored against the market price', 24, 'active');
INSERT OR IGNORE INTO product_registry (product, host, worker, program_code, what_for, plus_cadence_h, state) VALUES ('q08-mind', 'mind.q08.org', 'q08-mind', 'QNFO.PERSONAL', 'Reading list: primary sources, one question each, and a probe', 24, 'active');

INSERT OR REPLACE INTO product_growth_parent (product, parent) VALUES ('q08-home', 'q08-signals');

INSERT OR REPLACE INTO product_growth_metrics (product, metric, label, lens, unit, target_7d, source) VALUES ('q08-signals', 'q08_pieces_published_7d', 'signal reports published in 7 days', 'activation', 'count', 7, 'counter');
INSERT OR REPLACE INTO product_growth_metrics (product, metric, label, lens, unit, target_7d, source) VALUES ('q08-signals', 'q08_signals_read_7d', 'public signals read in 7 days', 'reach', 'count', 500, 'counter');
INSERT OR REPLACE INTO product_growth_metrics (product, metric, label, lens, unit, target_7d, source) VALUES ('q08-markets', 'q08m_forecasts_7d', 'forecasts pre-registered in 7 days', 'activation', 'count', 40, 'counter');
INSERT OR REPLACE INTO product_growth_metrics (product, metric, label, lens, unit, target_7d, source) VALUES ('q08-markets', 'q08m_pageviews_7d', 'markets.q08.org page views in 7 days', 'reach', 'count', 200, 'counter');
INSERT OR REPLACE INTO product_growth_metrics (product, metric, label, lens, unit, target_7d, source) VALUES ('q08-markets', 'q08m_calls_with_edge', 'open forecasts that leave the market by 2 points or more', 'conversion', 'count', 3, 'counter');
INSERT OR REPLACE INTO product_growth_metrics (product, metric, label, lens, unit, target_7d, source) VALUES ('q08-mind', 'mind_entries_read_7d', 'reading-list entry opens in 7 days', 'reach', 'count', 20, 'counter');
INSERT OR REPLACE INTO product_growth_metrics (product, metric, label, lens, unit, target_7d, source) VALUES ('q08-mind', 'mind_entries_total', 'reading-list entries', 'activation', 'count', 40, 'counter');

INSERT OR REPLACE INTO product_family (family, product, role, signal_in, value_out) VALUES ('q08', 'q08-signals', 'marquee', 'news, filings, research and search', 'checked reports a reader can use');
INSERT OR REPLACE INTO product_family (family, product, role, signal_in, value_out) VALUES ('q08', 'q08-markets', 'proving ground', 'the signal stream and market prices', 'probabilities scored against the market');
INSERT OR REPLACE INTO product_family (family, product, role, signal_in, value_out) VALUES ('q08', 'q08-mind', 'reading list', 'primary sources', 'one question and a probe per source');
INSERT OR REPLACE INTO product_family (family, product, role, signal_in, value_out) VALUES ('q08', 'companion-today', 'personal companion', 'what happens in a day', 'outcomes and next steps');
INSERT OR REPLACE INTO product_family (family, product, role, signal_in, value_out) VALUES ('q08', 'jobs', 'job engine', 'postings and the owner record', 'applications and replies');

CREATE VIEW IF NOT EXISTS v_q08_family AS SELECT f.product, f.role, f.signal_in, f.value_out, r.host, m.metric, m.label, m.target_7d AS target, g.value, g.prev, g.fresh FROM product_family f LEFT JOIN product_registry r ON r.product = f.product LEFT JOIN product_growth_metrics m ON m.product = f.product AND m.active = 1 LEFT JOIN v_product_growth_now g ON g.product = m.product AND g.metric = m.metric WHERE f.family = 'q08';
