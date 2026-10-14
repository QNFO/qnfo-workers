-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: restore the verify_probe of class fm-view-alias-capture from migrations/2026-10-14-sla-120m-view-alias.sql
--
-- SLA-120M-FM-PROBE-1 (charter pillar autonomy). migrations/2026-10-14-sla-120m-2.sql and -4 redefined v_sla_over_120m: the total
-- now adds code_tasks_queued_over_120m (in place of the CASE on code_tasks_queued_oldest_min), content_items_over_sla and
-- research_claims_over_120m. The fm-view-alias-capture detector still summed the old column list, so it would read 0 on a correct
-- view (read 2026-10-14 04:26Z: total 457 = column sum 457; 338 content items over SLA and 105 issues over 120 minutes, each
-- matching a direct count). The probe now sums the new columns and also compares issues_open_over_120m with a direct count of
-- v_issue_age, which a captured alias in the view would break even where the total and its columns agree.
-- spof-review: one probe text changes; no trigger, cron, view or credential

UPDATE remediation_contracts SET verify_probe =
 'SELECT ''1'' AS expected, CASE WHEN total_over_120m = issues_open_over_120m + research_review_error + research_head_stalled + research_queued_180m + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h + zenodo_exit_pending_stalled + research_held_over_sla + triage_gap + contracts_cadence_drift + code_tasks_queued_over_120m + predictions_unscored_over_sla + doctrine_proposals_waiting + content_items_over_sla + research_claims_over_120m AND issues_open_over_120m = (SELECT COUNT(*) FROM v_issue_age WHERE age_min > 120) THEN ''1'' ELSE ''0'' END AS observed FROM v_sla_over_120m',
 ts = datetime('now')
WHERE class = 'fm-view-alias-capture';
