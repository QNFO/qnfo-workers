-- SLA-DRAIN-3 (2026-10-14, pillars research and autonomy): closeout of the SLA-120M-5 / SLA-DRAIN-1 / SLA-DRAIN-2 session. Owner, verbatim:
-- "closeout this thread: merge/deploy all and handoff all items to system server-side resolution/implementation/deployment".
-- Everything the session built is merged and live (PRs 1254 and 1265; qnfo-research-exec 0.18.1, idea-hub 1.10.2,
-- qnfo-fleet-dashboard 1.37.5; migration_runs ok). What remains moves to the fleet's own loops:
--   (1) The session's three decisions get scored predictions in decision_predictions, so calibration_scorer_tick grades them
--       server-side (prediction_miss_rate_7d) instead of a session checking them.
--   (2) The research_deferred_pool trigger (5394, gt 120, read 178 at 07:30Z) records that its lever 2 is applied
--       (RESEARCH_PARALLEL_MAX 8, research_parallel 6) and names the next lever, so the issue it files when the pool stays high
--       carries it: limit COMPLETENESS-SWEEP-1 remediation rows to half of research_parallel. On 2026-10-14 they took all four
--       slots and cycled review-unresolved / revise-noop, while proposals had published 47 in 72 h at about 1.3 h each.
-- Open items keep their own doers and probes: 2554 (runtime probe on /api/watchmaker), 2532 (workers_bp run), 2403 and 2067
-- (code loop; the 1.1 MB research-exec file is the dead-on-arrival case 2067 tracks), and the metric triggers on
-- sla_breaches_over_120m (5929), issues_open_over_120m (5937) and research_deferred_pool (5394).
-- spof-review: data only (prediction rows, one trigger action text); no trigger, cron or credential.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM decision_predictions WHERE origin = 'seeded' AND decision_id IN (SELECT id FROM decision_log WHERE instr(action, 'SLA-120M-5:') = 1 OR instr(action, 'SLA-DRAIN-1:') = 1 OR instr(action, 'SLA-DRAIN-2:') = 1); UPDATE analytics_metric_triggers SET action = substr(action, 1, instr(action, ' SLA-DRAIN-3') - 1) WHERE id = 5394 AND instr(action, ' SLA-DRAIN-3') > 0;

INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
SELECT d.id, 'metric', p.subject, p.op, p.value, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', p.due), 'seeded'
FROM decision_log d JOIN (
  SELECT 'SLA-120M-5:' AS tag, 'sla_definitions_over_120m' AS subject, '=' AS op, 0 AS value, '+2 hours' AS due
  UNION ALL SELECT 'SLA-DRAIN-1:', 'sla_breaches_over_120m', '<=', 300, '+24 hours'
  UNION ALL SELECT 'SLA-DRAIN-1:', 'research_deferred_pool', '<=', 150, '+24 hours'
  UNION ALL SELECT 'SLA-DRAIN-2:', 'issues_open_over_120m', '<=', 100, '+24 hours'
) p ON instr(d.action, p.tag) = 1;

UPDATE analytics_metric_triggers
SET action = action || ' SLA-DRAIN-3 (2026-10-14): lever 2 is applied (qnfo-research-exec 0.18.1 RESEARCH_PARALLEL_MAX 8; ops_config research_parallel 6, raise to 8 while AI spend is inside target). Next lever when the pool is still above 120 after 24 h at width 6: limit source = ''remediation'' rows (COMPLETENESS-SWEEP-1 rewrites) to half of research_parallel in the executor claim order, so proposals keep slots while rewrites cycle review-unresolved or revise-noop. That is a change to the claim in qnfo-research-exec/worker.js (INFLIGHT_SQL and the claim query; 1.1 MB, so a session PR, not the code loop) or to RB_ORDER_SQL in qnfo-fleet-control RESEARCH-BACKPRESSURE-1.'
WHERE id = 5394 AND instr(action, 'SLA-DRAIN-3') = 0;
