-- OUTPUT-QUALITY-LEDGER-1 (2026-10-26, charter pillar reach). Owner directive 2026-10-26, verbatim: "HOW ARE WE MEASURING FLEET QUALITY? WITH SO MANY
-- METRICS AND SO MANY ISSUES/BREACHES OVERWHELMING AND DAUNTING TO FULLY RESOLVE, DO NOT LOSE SIGHT OF CONTINUED DRIVE TO BETTER QUALITY OUTPUTS OF ALL
-- KINDS (PAPERS/POSTS/PUBLICATIONS/PROMOTION/CODE/ETC). IS THE FLEET ACTUALLY GETTING "BETTER" AND HOW WOULD WE KNOW?"
-- WHAT WAS MEASURED (qnfo-audit, living-paper and q08-signal D1, 2026-10-26):
--  * Of 284 registered metrics, 3 have kind quality, all for the ask product. The one paper score, quality_scores.score = min(len/100,40) + min(3*refs,30) +
--    15*lit + 15*verif, rewards length, DOI/arXiv string count, a prior-work heading and a table. Its mean rose 64.2 -> 73.2 (2026-10-08 -> 10-25), but the
--    same 464 papers scored on both days fell 64.3 -> 61.4 (24 up, 275 down): the rise is 230 newer papers at 96-98 joining the pool, and 81% of papers new
--    in 14 days are at or above 95, so the score can no longer show improvement.
--  * 361 of 694 published papers (52%) carry an open high-severity erratum raised by PAPER-LEARN-1 or the reviser (676 open); 1122 were detected and 446
--    closed in 7 days. No metric tracked it.
--  * 131 of the 145 q08 essays in published_pieces carry a q08_retractions row (57/57, 17/17, 31/31, 20/20, 6/17, 0/3 by ISO week 37..42). No metric tracked it
--    (a q08 code task below adds one).
--  * research_golden_runs: false_positive_rate = 1 - catch_rate in 240 of 240 rows and model_version/prompt_version are blank, so it is one quantity reported
--    twice (qnfo-research-exec stageVerify computes both from adj.mismatches).
-- WHAT THIS ADDS: (1) output_quality_measures, a classification of the measures that say whether outputs got better: outcome (judged by something the
-- generator cannot satisfy: readers, people, a falsifying reviewer, a passing probe), proxy (a rule the generator can satisfy) or validity (is a measure
-- itself trustworthy); (2) v_output_quality_verdict, _by_surface and _headline, which compare each measure with metric_history seven days earlier and
-- count only outcomes toward "improving" (no history is `insufficient_history`, never a pass; a surface with no measured outcome is a gap, and a headline that
-- is better elsewhere says `improving_with_gaps`, never `improving`); (3) five new measures computed in qnfo-audit by one trigger on
-- fleet_tick_heavy (never on fleet_tick, FLEET-TICK-SPLIT-1: each statement runs only when its metric is 50 minutes old); (4) three triggers, one issue each, and
-- a named exemption for the rest (METRIC-CLOSED-LOOP-1): papers_with_open_high_errata_pct and output_quality_outcomes_worse and golden_run_complement_share_30d.
-- Exempt, with the reason: errata_high_net_inflow_7d (a component of the first; its lever is the same), paper_same_paper_score_delta_7d (a proxy: a breach
-- would reward adding references), paper_new_score_saturation_14d (validity information with no lever of its own), output_quality_outcomes_unmeasured (clears
-- once the new measures hold seven days of history); (5) an issue that adds the q08 retraction rate (the writer is q08-signal-engine, a different database).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS output_quality_heavy_tick; DROP VIEW IF EXISTS v_output_quality_headline; DROP VIEW IF EXISTS v_output_quality_by_surface; DROP VIEW IF EXISTS v_output_quality_verdict; DROP TABLE IF EXISTS output_quality_measures; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('papers_with_open_high_errata_pct', 'output_quality_outcomes_worse', 'golden_run_complement_share_30d'); DELETE FROM metric_registry WHERE metric IN ('papers_with_open_high_errata_pct', 'errata_high_net_inflow_7d', 'paper_same_paper_score_delta_7d', 'paper_new_score_saturation_14d', 'golden_run_complement_share_30d', 'output_quality_outcomes_worse', 'output_quality_outcomes_unmeasured');
-- Rollback note: the failure modes, belief, contracts, q08 issue, capability and decision rows are append-only evidence and stay.
-- spof-review: the new measures refresh from fleet_tick_heavy, which has one producer until FLEET-TICK-HEAVY-SECOND-PRODUCER-1 lands; a missed heavy tick delays them
-- and fm-quality-proxy-population-average reads their age (180 minutes), it does not stop fleet_tick.
-- runtime-probe (D1): SELECT last_value, last_refreshed FROM metric_registry WHERE metric = 'papers_with_open_high_errata_pct' -- expected a number and a refresh within 3 h

CREATE TABLE IF NOT EXISTS output_quality_measures (
  metric TEXT PRIMARY KEY,
  surface TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('outcome', 'proxy', 'validity')),
  polarity INTEGER NOT NULL CHECK (polarity IN (-1, 1)),
  tol_rel REAL NOT NULL DEFAULT 0.1,
  tol_abs REAL NOT NULL DEFAULT 0,
  judged_by TEXT NOT NULL,
  caveat TEXT
);

INSERT OR IGNORE INTO output_quality_measures (metric, surface, role, polarity, tol_rel, tol_abs, judged_by, caveat) VALUES
  ('papers_with_open_high_errata_pct', 'papers', 'outcome', -1, 0.05, 1.0, 'a reviewer that tries to falsify a published claim (qnfo-lifecycle PAPER-LEARN-1, qnfo-paper-reviser)', 'the reviewer is a model, so its errors correlate with the writers (ENSEMBLE-POLICY-1); a wider sweep raises the number without a worse paper, so read it with errata_high_net_inflow_7d'),
  ('errata_high_net_inflow_7d', 'papers', 'outcome', -1, 0.2, 25, 'the same reviewer: high-severity errata detected in 7 days minus those resolved, closed or rejected in 7 days', 'closed is status resolved, closed or rejected with updated_at in the window; a positive value means defects arrive faster than they are fixed'),
  ('q08_human_reads_7d', 'essays', 'outcome', 1, 0.15, 10, 'readers: page reads whose user agent is not a crawler', 'attention, not correctness: a retracted piece that is still read counts'),
  ('outreach_human_clicks_7d', 'promotion', 'outcome', 1, 0.15, 10, 'people: UTM clicks classed human', 'clicks, not the quality of a post; email counts'),
  ('outreach_clicks_per_post_7d', 'promotion', 'outcome', 1, 0.15, 0.25, 'people: human clicks per post', 'one channel with a link can dominate it'),
  ('social_engagement_rate_30d', 'promotion', 'outcome', 1, 0.15, 0.02, 'people: engagements per post', 'zero for weeks; zero to zero reads as flat'),
  ('engaged_human_sessions_28d', 'site', 'outcome', 1, 0.1, 200, 'Cloudflare Web Analytics page views with bots excluded', 'traffic, not satisfaction'),
  ('code_task_success_rate_30d', 'code', 'outcome', 1, 0.1, 0.03, 'merge and live verification of the code loop''s tasks', 'success of the loop, not review of the diff'),
  ('remediation_latest_pass_pct_7d', 'code', 'outcome', 1, 0.05, 2, 'an independent probe that passes after the fix', 'a probe the fixer wrote can be weak'),
  ('paper_same_paper_score_delta_7d', 'papers', 'proxy', 1, 0, 1.0, 'a rule: length, DOI or arXiv string count, a prior-work heading, a table or code block', 'adding references raises it; it is never a target and never counts toward the verdict'),
  ('ask_citation_validity_7d', 'ask', 'proxy', 1, 0.02, 0.01, 'a rule: a cited number is one of the answer''s numbered sources', 'does not test that the source supports the claim; 1.0 for weeks'),
  ('paper_new_score_saturation_14d', 'papers', 'validity', -1, 0.1, 0.05, 'share of papers first scored in the last 14 days at or above 95 of 100', 'high means the structural score cannot show improvement; it is why papers are judged by errata'),
  ('golden_run_complement_share_30d', 'papers', 'validity', -1, 0.1, 0.05, 'share of research_golden_runs rows where false_positive_rate = 1 - catch_rate', 'one quantity reported twice; the golden set is not an evaluation until this is near 0'),
  ('q08_panel_effective_votes_30d', 'essays', 'validity', 1, 0.1, 0.1, 'independent votes the two-judge panel is worth, 1 to 2', 'below 1.3 the panel is one voice (ENSEMBLE-POLICY-1)');

CREATE VIEW IF NOT EXISTS v_output_quality_verdict AS
SELECT m.metric, m.surface, m.role, m.polarity, m.judged_by, m.caveat,
       n.day AS now_day, n.value AS now_value, p.day AS prev_day, p.value AS prev_value,
       CASE
         WHEN n.value IS NULL OR p.value IS NULL THEN 'insufficient_history'
         WHEN n.day < date('now', '-2 days') THEN 'stale'
         WHEN ABS(n.value - p.value) <= MAX(m.tol_abs, m.tol_rel * ABS(p.value)) THEN 'flat'
         WHEN (n.value - p.value) * m.polarity > 0 THEN 'better'
         ELSE 'worse'
       END AS moved
FROM output_quality_measures m
LEFT JOIN metric_history n ON n.metric = m.metric AND n.day = (SELECT MAX(day) FROM metric_history WHERE metric = m.metric)
LEFT JOIN metric_history p ON p.metric = m.metric AND p.day = (SELECT MAX(day) FROM metric_history WHERE metric = m.metric AND day <= date(n.day, '-7 days'));

CREATE VIEW IF NOT EXISTS v_output_quality_by_surface AS
SELECT surface,
       SUM(role = 'outcome') AS outcomes,
       SUM(role = 'outcome' AND moved = 'better') AS better,
       SUM(role = 'outcome' AND moved = 'worse') AS worse,
       SUM(role = 'outcome' AND moved = 'flat') AS flat,
       SUM(role = 'outcome' AND moved IN ('insufficient_history', 'stale')) AS unmeasured,
       CASE
         WHEN SUM(role = 'outcome') = 0 THEN 'no_outcome_measure'
         WHEN SUM(role = 'outcome' AND moved IN ('better', 'worse', 'flat')) = 0 THEN 'unmeasured'
         WHEN SUM(role = 'outcome' AND moved = 'worse') > 0 AND SUM(role = 'outcome' AND moved = 'better') = 0 THEN 'regressing'
         WHEN SUM(role = 'outcome' AND moved = 'worse') > 0 THEN 'mixed'
         WHEN SUM(role = 'outcome' AND moved = 'better') > 0 THEN 'improving'
         ELSE 'flat'
       END AS verdict
FROM v_output_quality_verdict
GROUP BY surface;

CREATE VIEW IF NOT EXISTS v_output_quality_headline AS
SELECT better, worse, flat, unmeasured, gaps,
       CASE
         WHEN better + worse + flat < 3 THEN 'insufficient_history'
         WHEN worse > 0 AND better > 0 THEN 'mixed'
         WHEN worse > 0 THEN 'regressing'
         WHEN better > 0 AND gaps = '' THEN 'improving'
         WHEN better > 0 THEN 'improving_with_gaps'
         ELSE 'flat'
       END AS verdict
FROM (SELECT COALESCE(SUM(role = 'outcome' AND moved = 'better'), 0) AS better,
             COALESCE(SUM(role = 'outcome' AND moved = 'worse'), 0) AS worse,
             COALESCE(SUM(role = 'outcome' AND moved = 'flat'), 0) AS flat,
             COALESCE(SUM(role = 'outcome' AND moved IN ('insufficient_history', 'stale')), 0) AS unmeasured,
             COALESCE((SELECT group_concat(surface, ',') FROM v_output_quality_by_surface WHERE verdict IN ('unmeasured', 'no_outcome_measure')), '') AS gaps
      FROM v_output_quality_verdict);

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
  ('papers_with_open_high_errata_pct', 'surface', 'lagging',
   '100 * distinct paper slugs with at least one internal_errata row (target_kind paper, severity high, status open) / papers in the latest complete quality_scores snapshot',
   'qnfo-audit.internal_errata + quality_scores (output_quality_heavy_tick, hourly)', '52.0 (361 of 694 papers, 2026-10-26)', '<= 10', 'qnfo-lifecycle', 'analytics_metric_triggers -> agent_issues (owner qnfo-lifecycle)', 'hourly', '> 10', NULL, 'UNMEASURED', 'computed'),
  ('errata_high_net_inflow_7d', 'surface', 'leading',
   'high-severity paper errata detected in 7 days minus those resolved, closed or rejected (updated_at) in 7 days; positive means defects arrive faster than they are fixed',
   'qnfo-audit.internal_errata (output_quality_heavy_tick, hourly)', '+676 (1122 detected, 446 closed, 2026-10-19..26)', '<= 0', 'qnfo-lifecycle', 'exempt from its own trigger: papers_with_open_high_errata_pct carries the lever (OUTPUT-QUALITY-LEDGER-1)', 'hourly', '> 0', NULL, 'UNMEASURED', 'computed'),
  ('paper_same_paper_score_delta_7d', 'surface', 'leading',
   'mean change in quality_scores.score over the papers scored on both the latest complete day and the day seven days earlier (the same papers, not the pool); a rule-based proxy',
   'qnfo-audit.quality_scores (output_quality_heavy_tick, hourly)', '-2.87 over 17 days for 464 papers (2026-10-08..25); +1.54 over 7 days (10-18..25)', 'report only (proxy: adding references raises it)', 'qnfo-cloud-ops', 'exempt: a breach would reward adding references (OUTPUT-QUALITY-LEDGER-1)', 'hourly', NULL, NULL, 'UNMEASURED', 'computed'),
  ('paper_new_score_saturation_14d', 'surface', 'guard',
   'share of papers first scored in the 14 days before the latest complete snapshot whose structural score is at or above 95; high means the score cannot show improvement',
   'qnfo-audit.quality_scores (output_quality_heavy_tick, hourly)', '0.813 (2026-10-25)', 'report only (validity information)', 'qnfo-cloud-ops', 'exempt: no lever of its own; papers are judged by errata (OUTPUT-QUALITY-LEDGER-1)', 'hourly', NULL, NULL, 'UNMEASURED', 'computed'),
  ('golden_run_complement_share_30d', 'surface', 'guard',
   'share of research_golden_runs rows in 30 days where abs(catch_rate + false_positive_rate - 1) < 0.001, i.e. one quantity reported twice',
   'qnfo-audit.research_golden_runs (output_quality_heavy_tick, hourly)', '1.0 (240 of 240 rows, 2026-10-16..26)', '<= 0.1', 'qnfo-research-exec', 'analytics_metric_triggers -> agent_issues (code-task on qnfo-research-exec/worker.js)', 'hourly', '> 0.1', NULL, 'UNMEASURED', 'computed'),
  ('output_quality_outcomes_worse', 'system', 'guard',
   'count of outcome measures in v_output_quality_verdict whose value moved the wrong way over 7 days beyond its tolerance; unmeasured measures are not counted here (see output_quality_outcomes_unmeasured)',
   'qnfo-audit.v_output_quality_headline (output_quality_heavy_tick, hourly)', '0 (2026-10-26)', '0', 'qnfo-fleet-control', 'analytics_metric_triggers -> agent_issues', 'hourly', '> 0', NULL, 'UNMEASURED', 'computed'),
  ('output_quality_outcomes_unmeasured', 'system', 'guard',
   'count of outcome measures with no value seven days back or no value in the last two days; an unmeasured outcome is never a pass',
   'qnfo-audit.v_output_quality_headline (output_quality_heavy_tick, hourly)', '2 (2026-10-26: the two errata measures start their history today)', '0', 'qnfo-fleet-control', 'exempt: clears when the new measures hold seven days of history (OUTPUT-QUALITY-LEDGER-1)', 'hourly', NULL, NULL, 'UNMEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES
  ('papers_with_open_high_errata_pct', 'Published papers carry known defects: over a tenth have an open high-severity erratum', 'registry', 'gt', 10, 'high',
   'Pillar reach (OUTPUT-QUALITY-LEDGER-1, docs/OUTPUT-QUALITY-LEDGER.md). Over a tenth of published papers carry an open high-severity erratum raised by PAPER-LEARN-1 or the reviser (52% on 2026-10-26: 361 of 694 papers; 1122 detected and 446 closed in 7 days). Read SELECT target_ref, COUNT(*) FROM internal_errata WHERE target_kind = ''paper'' AND severity = ''high'' AND status = ''open'' GROUP BY target_ref ORDER BY 2 DESC. Levers in order: (1) the reviser''s throughput on the papers with the most open errata; (2) the producer: read the falsification texts for a repeated claim shape and fix the writer prompt or gate that lets it through; (3) revise or unpublish a paper whose errata the reviser cannot resolve. Never close an erratum as rejected without a falsification reason and never lower the count by narrowing the reviewer''s sweep. Definition of done: papers_with_open_high_errata_pct <= 10 and errata_high_net_inflow_7d <= 0 at two refreshes.',
   'qnfo-lifecycle', 'agent_issues', 24, 1, 'OUTPUT-QUALITY-LEDGER-1 2026-10-26'),
  ('output_quality_outcomes_worse', 'Output quality regressed: an outcome measure moved the wrong way over 7 days', 'registry', 'gt', 0, 'high',
   'Pillar reach (OUTPUT-QUALITY-LEDGER-1). At least one outcome measure moved the wrong way over 7 days beyond its tolerance. Read SELECT metric, surface, now_value, prev_value FROM v_output_quality_verdict WHERE role = ''outcome'' AND moved = ''worse''. For each, compare cohorts, not the pool mean: the same items a week apart, or items made after a change against items made before. Fix the producer of the worse measure (writer, gate, reviewer, post composer). Never raise a proxy (paper_same_paper_score_delta_7d, ask_citation_validity_7d) to offset a worse outcome and never add a measure to the outcome list to dilute one. Definition of done: output_quality_outcomes_worse = 0 at two refreshes.',
   'qnfo-fleet-control', 'agent_issues', 24, 1, 'OUTPUT-QUALITY-LEDGER-1 2026-10-26'),
  ('golden_run_complement_share_30d', 'Golden-run evaluation reports one quantity twice: false_positive_rate is 1 - catch_rate', 'registry', 'gt', 0.1, 'medium',
   'Pillar research (OUTPUT-QUALITY-LEDGER-1). stageVerify in qnfo-research-exec/worker.js sets catch_rate = (claims - mismatches) / claims and false_positive_rate = mismatches / claims, so the two sum to 1 in 240 of 240 rows (2026-10-16..26); model_version and prompt_version are blank (env.MODEL_VERSION and env.PROMPT_VERSION are not set); a row is written only when a paper fails its first verify. Edit: name the first quantity claim_match_rate; report false_positive_rate only when it is measured independently of it (a flagged mismatch that the independent recompute later cleared) and NULL otherwise; write a row on every verify pass, not only on failures; read the versions from the model and prompt in use. Do not change how papers are gated. Definition of done: golden_run_complement_share_30d <= 0.1 at two refreshes.' || char(10) ||
   'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
   'code-anchor: const falsePositiveRate = adj.rows.length ? (adj.rows.filter(function(r) { return r.decided && !r.match; }).length / adj.rows.length) : 0;',
   'qnfo-research-exec', 'agent_issues', 24, 1, 'OUTPUT-QUALITY-LEDGER-1 2026-10-26');

-- One trigger on the heavy heartbeat. Every statement is gated on its own metric being 50 minutes old, so a heartbeat every 10 minutes runs each once an hour.
-- A measure whose input is empty is not written: unknown is never a value.
CREATE TRIGGER IF NOT EXISTS output_quality_heavy_tick AFTER INSERT ON fleet_tick_heavy
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(100.0 * (SELECT COUNT(DISTINCT target_ref) FROM internal_errata WHERE target_kind = 'paper' AND severity = 'high' AND status = 'open')
        / MAX(1, (SELECT COUNT(*) FROM quality_scores WHERE ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')))), 1)) AS TEXT)
    WHERE metric = 'papers_with_open_high_errata_pct' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT (SELECT COUNT(*) FROM internal_errata WHERE target_kind = 'paper' AND severity = 'high' AND datetime(detected_at) >= datetime('now', '-7 days'))
           - (SELECT COUNT(*) FROM internal_errata WHERE target_kind = 'paper' AND severity = 'high' AND status IN ('resolved', 'closed', 'rejected') AND datetime(updated_at) >= datetime('now', '-7 days'))) AS TEXT)
    WHERE metric = 'errata_high_net_inflow_7d' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(AVG(b.score - a.score), 2) FROM quality_scores a JOIN quality_scores b ON b.slug = a.slug
        AND b.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now'))
        AND a.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts <= date((SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')), '-7 days'))) AS TEXT)
    WHERE metric = 'paper_same_paper_score_delta_7d' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'))
      AND EXISTS (SELECT 1 FROM quality_scores a JOIN quality_scores b ON b.slug = a.slug
        AND b.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now'))
        AND a.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts <= date((SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')), '-7 days')));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(q.score >= 95) / COUNT(*), 3) FROM quality_scores q
        WHERE q.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now'))
          AND q.slug NOT IN (SELECT slug FROM quality_scores WHERE ts < date((SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')), '-14 days'))) AS TEXT)
    WHERE metric = 'paper_new_score_saturation_14d' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'))
      AND EXISTS (SELECT 1 FROM quality_scores q
        WHERE q.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now'))
          AND q.slug NOT IN (SELECT slug FROM quality_scores WHERE ts < date((SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')), '-14 days')));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(ABS(catch_rate + false_positive_rate - 1) < 0.001) / COUNT(*), 3) FROM research_golden_runs WHERE created_at >= datetime('now', '-30 days')) AS TEXT)
    WHERE metric = 'golden_run_complement_share_30d' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'))
      AND EXISTS (SELECT 1 FROM research_golden_runs WHERE created_at >= datetime('now', '-30 days'));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((SELECT worse FROM v_output_quality_headline) AS TEXT)
    WHERE metric = 'output_quality_outcomes_worse' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((SELECT unmeasured FROM v_output_quality_headline) AS TEXT)
    WHERE metric = 'output_quality_outcomes_unmeasured' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
END;

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'Q08-RETRACTION-METRIC-1: measure the share of q08 essays retracted after the accuracy audit',
  'Charter pillar: reach. OUTPUT-QUALITY-LEDGER-1 (2026-10-26) found 131 of the 145 rows in q08-signal published_pieces have a q08_retractions row (57/57, 17/17, 31/31, 20/20, 6/17, 0/3 by ISO week 37..42; 124 of 131 retracted by the accuracy audit as claims the source does not support) and no registry metric shows it, so the best evidence of essay quality is invisible to the metric loop.' || char(10) ||
  'Doer: qnfo-code-orchestrator. In q08-signal-engine/worker.js add retraction_rate_30d to metrics7d: of the pieces with published_at in the last 30 days, the share with a q08_retractions row; null under 10 pieces (unknown is never a value). Add ["q08_retraction_rate_30d", "retraction_rate_30d"] to Q08_METRIC_KEYS, raise VERSION by a minor (a new data product) and keep deployed-current.worker.js identical. The writer only UPDATEs an existing registry row, so in the same PR add a migration that registers q08_retraction_rate_30d (layer surface, kind lagging, target <= 0.1, owner q08-signal-engine) with its analytics_metric_triggers row, and inserts output_quality_measures (surface essays, role outcome, polarity -1, tol_rel 0.2, tol_abs 0.05, judged_by the grounding audit, caveat that a window with few pieces is null).' || char(10) ||
  'Definition of done: metric_registry.q08_retraction_rate_30d holds a number refreshed within 2 h and v_output_quality_verdict lists it.' || char(10) ||
  'code-task: repo=qnfo-workers path=q08-signal-engine/worker.js' || char(10) ||
  'code-anchor: ["q08_confirmed_subscribers", "confirmed_subscribers"]' || char(10) ||
  'code-probe: {"paths": ["q08-signal-engine/worker.js"], "contains": "q08_retraction_rate_30d"}',
  'session', 'reach', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title = 'Q08-RETRACTION-METRIC-1: measure the share of q08 essays retracted after the accuracy audit'
    AND status = 'open'
);

INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'quality-proxy-population-average', 'a rule-based quality score is read as "quality improving" because its pool mean rose, while the same items did not improve and the newer items are tuned to the rule',
  'quality_scores.mean rose 64.2 -> 73.2 while 464 papers scored on both days fell 64.3 -> 61.4; the pool gained 230 papers at 96-98, 81% of new papers are at or above 95, and 361 of 694 papers carry an open high-severity erratum the score cannot see',
  'OUTPUT-QUALITY-LEDGER-1: outcomes (errata, retractions, readers, people, probes) decide the verdict; proxies are labelled and never counted; a claim of improvement compares the same items or cohorts',
  'fm-quality-proxy-population-average: the ledger''s own measures must stay fresh, and the by-surface verdict is the read-out', 'fm-quality-proxy-population-average', '2026-10-26', NULL,
  'a quality claim rests on a pool mean, a gate pass rate or a proxy score', 'the score rises while errata, retractions or reader signals do not', 'every decision that treats a gate pass as quality'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'quality-proxy-population-average');
INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'golden-run-one-quantity-twice', 'an evaluation reports one quantity under two names, so a "catch rate" and a "false-positive rate" cannot disagree and no change can be attributed',
  'qnfo-research-exec stageVerify computes catch_rate and false_positive_rate from adj.mismatches over adj.rows.length; MODEL_VERSION and PROMPT_VERSION are unset; a row is written only for papers that fail their first verify',
  'the golden_run_complement_share_30d trigger files a code task on qnfo-research-exec/worker.js',
  'fm-golden-run-one-quantity-twice (golden_run_complement_share_30d <= 0.1)', 'fm-golden-run-one-quantity-twice', '2026-10-26', NULL,
  'golden_run_complement_share_30d above 0.1', 'research_golden_runs rows where catch_rate + false_positive_rate = 1', 'the only paper evaluation the fleet logs'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'golden-run-one-quantity-twice');

INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-quality-proxy-population-average', NULL, 'SELECT ''0'' AS expected, CASE WHEN (SELECT last_refreshed FROM metric_registry WHERE metric = ''papers_with_open_high_errata_pct'') >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-180 minutes'') THEN ''0'' ELSE ''1'' END AS observed', 'd1-query', 3, 1, 'active', 'OUTPUT-QUALITY-LEDGER-1', 'failure-mode detector', 'qnfo-fleet-control'
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-quality-proxy-population-average');
INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-golden-run-one-quantity-twice', NULL, 'SELECT ''0'' AS expected, CASE WHEN COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = ''golden_run_complement_share_30d''), 1) > 0.1 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 1, 'active', 'OUTPUT-QUALITY-LEDGER-1', 'failure-mode detector', 'qnfo-research-exec'
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-golden-run-one-quantity-twice');

-- A belief the ledger acts on: an open PAPER-LEARN-1 erratum is a real defect. Four of four sampled open rows quote a paper claim and a falsification
-- (for example the GOE and GUE pair correlations called identical); 60 of 447 closed rows were rejected. Falsified if the fleet rejects over half of what it closes.
INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES ('paper-learn-errata-are-defects', 'An open high-severity internal erratum on a paper names a claim the paper makes and a reason it is false, so the count of papers with one is a defect count, not noise.', 0.7,
  'Read 2026-10-26: four of four newest open rows quote the paper and give a falsification; 60 of 447 closed rows were rejected (13%). The reviewer is a model, so false positives are possible.',
  'belief-paper-learn-errata-are-defects', 'OUTPUT-QUALITY-LEDGER-1');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES ('belief-paper-learn-errata-are-defects', NULL, 'OUTPUT-QUALITY-LEDGER-1 is applied', 'belief probe',
  'SELECT ''0'' AS expected, CASE WHEN (SELECT COUNT(*) FROM internal_errata WHERE target_kind = ''paper'' AND severity = ''high'' AND status = ''rejected'') * 2 > (SELECT COUNT(*) FROM internal_errata WHERE target_kind = ''paper'' AND severity = ''high'' AND status IN (''resolved'', ''closed'', ''rejected'')) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 1000, 'qnfo-fleet-control', 24, 'active', 'belief');

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'output-quality verdict by surface (improving, mixed, regressing, flat, unmeasured) from outcome measures only',
  'OUTPUT-QUALITY-LEDGER-1, migrations/2026-10-26-output-quality-ledger.sql',
  'metric_history (daily, 7 days back), output_quality_measures, fleet_tick_heavy producer',
  'migrations/output-quality-ledger.test.mjs covers the verdict states, the tolerance rule, proxies excluded, empty inputs not written and the gate on the heavy tick',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'SELECT * FROM v_output_quality_by_surface; SELECT * FROM v_output_quality_headline'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability LIKE 'output-quality verdict by surface%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01Xyj48EUqS7c6yyvNT5Bdi7', 'a quality claim needs a measure the generator cannot satisfy; the registry has 3 quality-kind metrics and one proxy score that only rises with new items',
  'added the output-quality ledger (OUTPUT-QUALITY-LEDGER-1): outcome/proxy/validity classification, a 7-day verdict by surface, five new qnfo-audit measures on fleet_tick_heavy, three triggers, and a q08 retraction code task',
  'paired cohort: 464 papers fell 64.3 -> 61.4 while the pool mean rose; 361 of 694 papers carry an open high-severity erratum; 131 of 145 q08 essays retracted; 240 of 240 golden runs report one quantity twice',
  'applied', 'qnfo-audit metric_registry rows, three views, one trigger on fleet_tick_heavy; no worker code',
  'the Rollback line of migrations/2026-10-26-output-quality-ledger.sql', 'the fleet can say per surface whether outputs got better, from outcomes only',
  'output_quality_outcomes_unmeasured <= 0 within 240 h', 'read-only SELECTs of every new expression on the live databases; offline suite on SQLite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'OUTPUT-QUALITY-LEDGER-1') > 0);
