-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_sla_metrics_disjoint
-- Rollback: re-create v_sla_over_120m from the 'view' row of bak_20261019_sla_metrics_disjoint (its sql column is the text read live on
--           2026-10-19 09:35Z), DROP VIEW v_sla_overlap_120m, set the 'probe' row back as remediation_contracts.verify_probe of class
--           fm-view-alias-capture, delete failure_modes fm_key 'sla-metric-overlap' and the remediation_contracts row fm-sla-metric-overlap,
--           and restore metric_registry.formula of sla_breaches_over_120m from the 'metric' row. No table other than the backup is created.
--
-- SLA-METRICS-1 (charter pillar autonomy, cluster metrics-sla-queue/sla-breach-metrics-double-count)
--
-- Defect, read live on 2026-10-19 09:35Z: v_sla_over_120m.total_over_120m (metric sla_breaches_over_120m, trigger 5929) adds up
-- columns that count the same item twice.
--   * issues_without_doer_3h (71) counts open issues older than 120 minutes without a doer. Every one of them is already an open issue
--     older than 120 minutes, so it sits inside issues_open_over_120m (165). v_issue_age.age_min is whole minutes, so an issue between
--     120.0 and 121.0 minutes old is in the first set and not yet in the second: the total drops at most the issues filed in one minute.
--   * content_items_over_sla (408) counts every v_content_pipeline row past its stage SLA. Of those rows, 154 are research items that a
--     dedicated term counts as well: 151 are research_queued_180m (155), 3 are research_review_error (8). research_held_over_sla and
--     research_claims_over_120m can overlap the same way (0 today).
--   * triage_gap counts open issues with no triage row at any age, so an untriaged issue older than 120 minutes is in
--     issues_open_over_120m too (0 today). code_tasks_stalled counts non-terminal tasks idle for 120 minutes and
--     code_tasks_queued_over_120m queued tasks created 120 minutes ago, so a queued task idle that long is in both (0 today).
-- The total read 811 and the distinct-key count of the same populations 586 (probe in section 3): 225 rows, 28 percent, were counted twice.
-- Before this file the metric overstated the breach by that much, and the ratchet on trigger 5929 (565) was set from the inflated figure.
--
-- stuck_items_over_sla is NOT changed. Its seven terms (research_review_error, research_head_stalled, research_queued_180m,
-- intents_pending, outreach_waiting, code_tasks_stalled, issues_without_doer_3h) read seven different tables or statuses and are disjoint,
-- re-checked row by row on 2026-10-19. It overlaps sla_breaches_over_120m only because both are headlines; removing a term from it would
-- silence a detector, and the queue_sla_tick_10m trigger reads research_queued_180m and issues_without_doer_3h by name.
-- No column of v_sla_over_120m or v_stuck_summary is renamed, added to or removed, so the dashboard KPI classes, qnfo-fleet-control
-- (SELECT total_over_120m, issues_open_over_120m, oldest_open_issue_min) and every trigger keep working.
--
-- Change:
--   1. v_sla_overlap_120m (new, one row): the rows a dedicated term and another term both count. Kept out of v_sla_over_120m so the
--      dashboard, which lists every numeric column of that view as a class, does not show an overlap as a queue.
--   2. v_sla_over_120m re-created with the same columns in the same order. total_over_120m leaves out issues_without_doer_3h and subtracts the
--      overlaps. Every drill-down column keeps its value, so issue 2971 and 99950 can still read each class.
--   3. fm-view-alias-capture probe follows the new total. New failure mode sla-metric-overlap with fm-sla-metric-overlap, a detector that counts
--      the distinct items by key and compares them with the total, so a new term that repeats an item fails it.
--   4. metric_registry formula and decision_log say what changed, with the before and after counts, so the drop is not read as remediation
--      (INTEGRITY-GUARDS-1). metric_history is one series: the value steps down at the first tick after apply by the double-counted rows.
-- No threshold, trigger target or cap changes: trigger 5929 (565) and the others stay as they are. spof-review: views and one probe text.

-- 0. Backup of what this file replaces (BACKUP-CREATES-1).
CREATE TABLE IF NOT EXISTS bak_20261019_sla_metrics_disjoint AS
  SELECT 'view' AS kind, name AS k, sql AS v FROM sqlite_master WHERE name = 'v_sla_over_120m'
  UNION ALL SELECT 'probe', class, verify_probe FROM remediation_contracts WHERE class = 'fm-view-alias-capture'
  UNION ALL SELECT 'metric', metric, formula FROM metric_registry WHERE metric = 'sla_breaches_over_120m';

-- 1. The overlaps. Each predicate is the one the named v_stuck_summary column or v_sla_over_120m subquery uses, read live 2026-10-19.
DROP VIEW IF EXISTS v_sla_overlap_120m;
CREATE VIEW v_sla_overlap_120m AS
SELECT vso_r.research_in_content_over_sla, vso_t.triage_gap_in_open_120m, vso_c.code_tasks_stalled_and_queued_120m
FROM
  (SELECT COUNT(*) AS research_in_content_over_sla FROM v_content_pipeline vc JOIN research_queue q ON q.id = vc.item_id
     WHERE vc.over_sla = 1 AND vc.flow = 'research' AND (
       (q.status = 'queued' AND datetime(COALESCE((SELECT r.ready_at FROM research_ready r WHERE r.id = q.id), q.created_at)) < datetime('now', '-120 minutes'))
       OR (q.status = 'review' AND q.id IN (SELECT s.id FROM research_review_seen s WHERE s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')))
       OR (q.status = 'held' AND q.id IN (SELECT h.id FROM research_hold_seen h WHERE h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')))
       OR (q.status = 'researching' AND q.claimed_at IS NOT NULL AND q.claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')))) vso_r,
  (SELECT COUNT(*) AS triage_gap_in_open_120m FROM v_issue_age a
     WHERE a.age_min > 120 AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id)) vso_t,
  (SELECT COUNT(*) AS code_tasks_stalled_and_queued_120m FROM code_tasks
     WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-120 minutes') AND datetime(updated_at) < datetime('now', '-120 minutes')) vso_c;

-- 2. The master view: text read live 2026-10-19, same columns in the same order, new total.
DROP VIEW IF EXISTS v_sla_over_120m;
CREATE VIEW v_sla_over_120m AS
SELECT vsla_s.*, vsla_k.*, vsla_x.issues_open_over_120m, vsla_x.oldest_open_issue_min, vsla_c.content_items_over_sla,
  vsla_q.code_tasks_queued_over_120m, vsla_r.research_claims_over_120m, vsla_p.cadence_overdue_over_120m,
  vsla_x.issues_open_over_120m + vsla_s.research_review_error + vsla_s.research_head_stalled + vsla_s.research_queued_180m + vsla_s.intents_pending
    + vsla_s.outreach_waiting + vsla_s.code_tasks_stalled + vsla_s.zenodo_exit_pending_stalled + vsla_s.research_held_over_sla
    + vsla_s.triage_gap - vsla_o.triage_gap_in_open_120m + vsla_s.contracts_cadence_drift
    + vsla_q.code_tasks_queued_over_120m - vsla_o.code_tasks_stalled_and_queued_120m
    + vsla_k.predictions_unscored_over_sla + vsla_k.doctrine_proposals_waiting
    + vsla_c.content_items_over_sla - vsla_o.research_in_content_over_sla + vsla_r.research_claims_over_120m
    + vsla_p.cadence_overdue_over_120m AS total_over_120m
FROM v_stuck_summary vsla_s, v_stuck_summary_kernel vsla_k, v_sla_overlap_120m vsla_o,
  (SELECT COUNT(*) AS issues_open_over_120m, COALESCE(MAX(age_min), 0) AS oldest_open_issue_min FROM v_issue_age WHERE age_min > 120) vsla_x,
  (SELECT COALESCE(SUM(over_sla), 0) AS content_items_over_sla FROM v_content_pipeline) vsla_c,
  (SELECT COUNT(*) AS code_tasks_queued_over_120m FROM code_tasks WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-120 minutes')) vsla_q,
  (SELECT COUNT(*) AS research_claims_over_120m FROM research_queue WHERE status = 'researching' AND claimed_at IS NOT NULL
     AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) vsla_r,
  (SELECT COUNT(*) AS cadence_overdue_over_120m FROM v_cadence_overdue WHERE over_sla = 1) vsla_p;

-- 3. Detectors. The alias probe follows the total and also requires issues_without_doer_3h to stay inside issues_open_over_120m, which is why
--    the total may leave it out. fm-sla-metric-overlap counts distinct items by key over the five populations that can overlap (aged issues,
--    untriaged issues, content rows past their SLA, the dedicated research terms, stalled or queued code tasks) plus the terms that are not
--    items (head stalled flag, intents, outreach, zenodo, cadence drift, predictions, proposals, late producers) and compares the sum with the total.
UPDATE remediation_contracts SET ts = datetime('now'), verify_probe =
 'SELECT ''1'' AS expected, CASE WHEN total_over_120m = issues_open_over_120m + research_review_error + research_head_stalled + research_queued_180m + intents_pending + outreach_waiting + code_tasks_stalled + zenodo_exit_pending_stalled + research_held_over_sla + triage_gap + contracts_cadence_drift + code_tasks_queued_over_120m + predictions_unscored_over_sla + doctrine_proposals_waiting + content_items_over_sla + research_claims_over_120m + cadence_overdue_over_120m - (SELECT research_in_content_over_sla + triage_gap_in_open_120m + code_tasks_stalled_and_queued_120m FROM v_sla_overlap_120m) AND issues_open_over_120m = (SELECT COUNT(*) FROM v_issue_age WHERE age_min > 120) AND issues_without_doer_3h <= issues_open_over_120m THEN ''1'' ELSE ''0'' END AS observed FROM v_sla_over_120m'
WHERE class = 'fm-view-alias-capture';

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('sla-metric-overlap',
 'a headline SLA total adds columns that count the same item, so the breach reads larger than the number of distinct items past their SLA and ratchets get set above the true level',
 'v_sla_over_120m.total_over_120m summed every drill-down column of v_stuck_summary and the content pipeline: issues_without_doer_3h sits inside issues_open_over_120m, and queued or in-review research rows are counted by research_queued_180m or research_review_error and again by content_items_over_sla',
 'SLA-METRICS-1: v_sla_overlap_120m measures the rows two terms share and the total subtracts them (issues_without_doer_3h is left out as contained); fm-sla-metric-overlap compares the total with a distinct-key count of the populations',
 'total_over_120m equals the distinct-key count of the overlapping populations plus the terms that are not items; fm-view-alias-capture keeps the column sum equal to the total',
 'fm-sla-metric-overlap', '2026-10-19', 99950,
 'a column added to the total in v_sla_over_120m that counts rows another column already counts',
 'sla_breaches_over_120m read 811 on 2026-10-19 with 586 distinct items past their SLA',
 'sla_breaches_over_120m, its trigger 5929 and ratchet, the dashboard KPI total, the 10-minute SLA escalation in qnfo-fleet-control');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-sla-metric-overlap', NULL, 'SLA-METRICS-1', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST((SELECT total_over_120m FROM v_sla_over_120m) - ((SELECT COUNT(*) FROM (SELECT ''i'' || id AS k FROM v_issue_age WHERE age_min > 120 UNION SELECT ''i'' || i.id FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = ''open'' AND t.issue_id IS NULL UNION SELECT flow || '':'' || item_id FROM v_content_pipeline WHERE over_sla = 1 UNION SELECT ''research:'' || q.id FROM research_queue q WHERE (q.status = ''queued'' AND datetime(COALESCE((SELECT r.ready_at FROM research_ready r WHERE r.id = q.id), q.created_at)) < datetime(''now'', ''-120 minutes'')) OR (q.status = ''review'' AND q.id IN (SELECT s.id FROM research_review_seen s WHERE s.first_seen < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes''))) OR (q.status = ''held'' AND q.id IN (SELECT h.id FROM research_hold_seen h WHERE h.first_seen < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes''))) OR (q.status = ''researching'' AND q.claimed_at IS NOT NULL AND q.claimed_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) UNION SELECT ''c'' || id FROM code_tasks WHERE (status NOT IN (''merged'', ''closed'', ''publish_failed'', ''needs_human'', ''failed'', ''reverted'') AND datetime(updated_at) < datetime(''now'', ''-120 minutes'')) OR (status = ''queued'' AND datetime(created_at) < datetime(''now'', ''-120 minutes'')))) + (SELECT research_head_stalled + intents_pending + outreach_waiting + zenodo_exit_pending_stalled + contracts_cadence_drift + predictions_unscored_over_sla + doctrine_proposals_waiting + cadence_overdue_over_120m FROM v_sla_over_120m)) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);

-- 4. What the drop means, and that nothing was fixed by it.
UPDATE metric_registry SET formula = formula || '; each item once: issues_without_doer_3h is inside issues_open_over_120m and research, untriaged-issue and code-task rows that two terms count are subtracted (v_sla_overlap_120m, SLA-METRICS-1)'
WHERE metric = 'sla_breaches_over_120m' AND instr(formula, 'SLA-METRICS-1') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766', 'a headline SLA total must count each item once, or the ratchet set from it and the issues filed from it describe a population that does not exist',
  'SLA-METRICS-1: v_sla_overlap_120m added, v_sla_over_120m total_over_120m drops issues_without_doer_3h and subtracts the rows two terms share, fm-view-alias-capture probe follows, fm-sla-metric-overlap added; stuck_items_over_sla and every threshold unchanged',
  'read 2026-10-19 09:35Z: total_over_120m 811 with issues_open_over_120m 165, research_queued_180m 155, issues_without_doer_3h 71, content_items_over_sla 408, research_review_error 8; the no-doer issues are issues aged over 120 minutes; 154 research rows (151 queued, 3 in review) are counted by a research term and by the content term; 811 - 71 - 154 = 586, equal to the distinct-key count of the populations',
  'migration merged', 'two views replaced or added, one probe text, one metric formula text, one failure mode and one contract row', 'see the Rollback header',
  'sla_breaches_over_120m counts each item once and a new overlapping column fails fm-sla-metric-overlap within the hour',
  'the metric steps down by about 225 at the first 10-minute tick (811 to about 586): that is the same breach counted once, not remediation, and trigger 5929 (threshold 565) keeps hitting until the underlying queues drain',
  'the breach figure the 10-minute escalation and the dashboard act on is the number of distinct items past 120 minutes',
  'd1:qnfo-audit v_sla_over_120m, v_stuck_summary, v_content_pipeline, v_issue_age, research_queue, code_tasks, remediation_contracts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-METRICS-1:') = 1);
