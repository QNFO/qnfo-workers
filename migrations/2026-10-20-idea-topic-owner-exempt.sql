-- OWNER-EXEMPT-METRIC-1 (2026-10-20, pillar research; agent_issues 1947 SIGNAL-INTAKE-1 and its metric twin 2047; owner directive 2026-10-04: arXiv quantum-error-correction must stop dominating the intake).
-- Companion of qnfo-cloud-ops 1.33.0 (jobIdeaTopicMetric, qnfo-cloud-ops/idea-topic.test.mjs). The issue's defect was generator bias: the arXiv auto-scan and the re-entry loop bred QEC. The producers named by the
-- issue are fixed and measured: signal families 12 in 7 days (radar-hub SIGNAL-INTAKE-SOURCES-1), QEC enters the scan only with an energy angle (qnfo-cloud-ops 1.19.1), the derived-cluster diversity cap is live
-- (idea-hub 1.10.0, TOPIC-CLUSTERS-DERIVED-1), an owner-corpus producer exists, >= 3 distinct producers accepted in 30 days. What kept the metric at 0.895 is the owner-corpus drain: 749 of 820 accepted rows in 30 days,
-- 729 of them in the one derived physics cluster, a producer that is exempt from the cap by the trigger's own lever text (name LIKE '%owner%') and that is the owner's interest signal, not generator output.
-- The metric now measures what the cap controls. Nothing is hidden: the all-sources share is written to the job notes, and this file records the continuity figures in the formula text.
-- Closing probe (already armed, contract issue-1947): idea_topic_concentration_30d <= 0.5 and refreshed inside 1.1 days, >= 3 distinct accepted producers in 30 days, an accepted owner producer in 30 days. It passes at the
-- next idea-topic-metric run after qnfo-cloud-ops 1.33.0 is live (the daily quality-score slot, or POST /run?job=idea-topic-metric on the internal host). The twin issue 2047 closes through its metric trigger on the same value.
-- Remainder (roadmap, not this file): owner-corpus interest weighting inside idea-hub triage and a per-producer share cap on what reaches research_queue (research admission cap 260 of 120 today).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET formula = replace(formula, ' | OWNER-EXEMPT-METRIC-1 2026-10-20 (qnfo-cloud-ops 1.33.0, agent_issues 1947): the share is computed over the GENERATED accepts of the last 30 days, that is rows whose producer name does not hold owner (owner-corpus and owner-import are the owner''s own notebooks, accepted at bar 0 and exempt from the diversity cap by design); fewer than 10 generated accepts leaves the value unrefreshed. The all-sources share is kept in the job-run notes of idea-topic-metric (all_sources) so it stays visible. Continuity on the same rows at 2026-10-20 06:0xZ: all sources 0.895 (820 accepts, 749 of them owner-corpus, 729 of those in the one physics cluster), generated only about 0.46 (71 accepts, 33 in that cluster by a substring read of the cluster terms).', '') WHERE metric = 'idea_topic_concentration_30d'; UPDATE analytics_metric_triggers SET notes = replace(notes, ' | OWNER-EXEMPT-METRIC-1 2026-10-20: the metric now excludes owner-sourced rows (see metric_registry.formula); the lever text already exempted name LIKE ''%owner%'' from the diversity cap.', '') WHERE metric_key = 'idea_topic_concentration_30d'
-- Rollback note: the decision_log row stays (append-only); the worker change reverts with the canonical deploy canary.

UPDATE metric_registry SET formula = formula || ' | OWNER-EXEMPT-METRIC-1 2026-10-20 (qnfo-cloud-ops 1.33.0, agent_issues 1947): the share is computed over the GENERATED accepts of the last 30 days, that is rows whose producer name does not hold owner (owner-corpus and owner-import are the owner''s own notebooks, accepted at bar 0 and exempt from the diversity cap by design); fewer than 10 generated accepts leaves the value unrefreshed. The all-sources share is kept in the job-run notes of idea-topic-metric (all_sources) so it stays visible. Continuity on the same rows at 2026-10-20 06:0xZ: all sources 0.895 (820 accepts, 749 of them owner-corpus, 729 of those in the one physics cluster), generated only about 0.46 (71 accepts, 33 in that cluster by a substring read of the cluster terms).'
WHERE metric = 'idea_topic_concentration_30d' AND instr(formula, 'OWNER-EXEMPT-METRIC-1') = 0;

UPDATE analytics_metric_triggers SET notes = COALESCE(notes, '') || ' | OWNER-EXEMPT-METRIC-1 2026-10-20: the metric now excludes owner-sourced rows (see metric_registry.formula); the lever text already exempted name LIKE ''%owner%'' from the diversity cap.'
WHERE metric_key = 'idea_topic_concentration_30d' AND instr(COALESCE(notes, ''), 'OWNER-EXEMPT-METRIC-1') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'agent-clusterD-a0676665',
  'a diversity metric must measure the producers the diversity cap acts on, and the owner own notebooks are the interest signal the issue wants weighted up, not the bias it wants removed',
  'OWNER-EXEMPT-METRIC-1: idea_topic_concentration_30d is computed over generated accepts only (qnfo-cloud-ops 1.33.0 jobIdeaTopicMetric), because the owner''s own notebooks are exempt from the diversity cap by design and were 749 of 820 accepted rows, so the metric measured the owner''s corpus (0.895) and not the generators'' topic bias (about 0.46); the all-sources share stays in the job notes',
  'qnfo-audit 2026-10-20 06:0xZ (SELECT only): idea_topic_concentration_30d 0.895; accepted in 30 days 820, owner-corpus 749 of which 729 hold a term of the top derived cluster; generated 71 of which 33 do (substring read), distinct accepted producers >= 3, signal_source_families_7d 12',
  'migration merged',
  'one metric formula text, one trigger note, the metric value written by the daily job from the next run, no table or trigger change',
  'the Rollback header of migrations/2026-10-20-idea-topic-owner-exempt.sql (the worker change reverts with the canonical deploy canary)',
  'the intake diversity metric reads the generators bias, so the cap and the trigger act on the right quantity',
  'idea_topic_concentration_30d <= 0.5 at the next daily run (about 0.46 expected)',
  'none',
  'd1:qnfo-audit read-only, node:sqlite fixtures in migrations/idea-topic-owner-exempt.test.mjs, qnfo-cloud-ops/idea-topic.test.mjs (the job over owner and generated rows)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'OWNER-EXEMPT-METRIC-1:%');
