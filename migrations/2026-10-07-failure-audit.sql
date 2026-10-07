-- FAILURE-AUDIT-1 (2026-10-07, pillar autonomy, session_013sMN4). Owner request 2026-10-07: "Audit and remediate all failure
-- modes and root causes". A census of the last 7 days (job runs, code-task failures, remediation contracts, deploys,
-- migrations, workflow runs on main) found three root causes that live in qnfo-audit itself; this file removes them.
--
-- 1. PROBE-EDIT-RERUN-1. A contract keeps the verdict of its old probe text until its next_due_at, up to a week later.
--    Measured 2026-10-07T09:05Z: issue-1779 and issue-1901 read last_verdict probe-not-machine-executable from their
--    2026-10-06 11:10Z text, while their current probes pass both executors' guards (fleet-control __RT_WRITE_KW,
--    remediation_consumer.py is_literal_select); next_due_at 2026-10-13 (weekly cadence of orphan-issue-guard-1). Any
--    change to verify_probe or verify_transport now makes the contract due at once (both executors select
--    next_due_at IS NULL OR <= now), and the two stale contracts are made due now.
-- 2. VACUOUS-TO-PENDING-1. Four active contracts return NULL while they wait, which both executors record as
--    vacuous-probe-result with no observation (EVID-1718-SHAREDCAP at 98 attempts). Each NULL branch now returns the
--    'pending: <why>' deferral (REMEDIATION-PENDING-PREFIX-1), so the wait is visible in remediation_verifications and
--    never counts toward max_attempts. The pass and fail branches are unchanged; each rewrite is guarded by instr(), so the
--    file is idempotent.
-- 3. GOAL-REVIEW-GUARD-1. qnfo-fleet-control 0.9.0/0.9.1 (GOAL-REVIEW-1, GOAL-REVIEW-HARM-1) refuses a code-loop pull
--    request when a model from another family finds that the diff does not implement its goal or carries an error. Its
--    named failure mode is a reviewer that refuses correct work, which would cost a 6h retry per task and lower
--    code_task_success_rate_30d with nothing measuring why. goal_review_refusal_share_7d (guard) is refused / reviewed
--    over the code-merge.goal-review rows with a verdict in the last 7 days, NULL below 5 reviews; two D1 triggers
--    refresh it on every review row (insert and the cache upsert), so it needs no worker code and no cron. Trigger gt 0.6.
--    The meta read is guarded by json_valid, so a malformed row can never make the review write fail.
-- Tracked by agent_issues 2110 (FAILURE-AUDIT-1), whose contract issue-2110 closes it once the trigger exists, no active
-- contract stays vacuous or not machine-executable for 3h, and the guard metric is registered.
-- Idempotent: CREATE ... IF NOT EXISTS, INSERT OR IGNORE, guarded INSERT and guarded UPDATEs.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS remediation_probe_edit_rerun; DROP TRIGGER IF EXISTS metric_goal_review_refusal_ai; DROP TRIGGER IF EXISTS metric_goal_review_refusal_au; DELETE FROM metric_registry WHERE metric = 'goal_review_refusal_share_7d'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'goal_review_refusal_share_7d'; (the four probe rewrites keep their pass and fail branches; the old NULL branches are quoted in this header)

-- 1. PROBE-EDIT-RERUN-1
CREATE TRIGGER IF NOT EXISTS remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END;

UPDATE remediation_contracts SET next_due_at = datetime('now')
WHERE status IN ('active', 'holding') AND last_verdict = 'probe-not-machine-executable';

-- 2. VACUOUS-TO-PENDING-1 (old NULL branches: "WHEN date('now') < '2026-10-08' THEN NULL", "ELSE NULL END" twice,
--    "THEN NULL WHEN EXISTS")
UPDATE remediation_contracts
SET verify_probe = replace(verify_probe, 'CASE WHEN date(''now'') < ''2026-10-08'' THEN NULL WHEN', 'CASE WHEN date(''now'') < ''2026-10-08'' THEN ''pending: the shared-cap window is read from 2026-10-08'' WHEN')
WHERE class = 'EVID-1718-SHAREDCAP' AND instr(verify_probe, 'THEN NULL WHEN') > 0;

UPDATE remediation_contracts
SET verify_probe = replace(verify_probe, 'THEN ''assert-failed'' ELSE NULL END', 'THEN ''assert-failed'' ELSE ''pending: no publish-v2-metadata event since 2026-10-01 15:17'' END')
WHERE class = 'EVID-GATE-A2-PUBLISHV2' AND instr(verify_probe, 'ELSE NULL END') > 0;

UPDATE remediation_contracts
SET verify_probe = replace(verify_probe, 'THEN ''connected'' ELSE NULL END', 'THEN ''connected'' ELSE ''pending: no access token in personal-life oauth_tokens yet'' END')
WHERE class = 'TWIN-MCP-OAUTH-1' AND instr(verify_probe, 'ELSE NULL END') > 0;

UPDATE remediation_contracts
SET verify_probe = replace(verify_probe, 'WHERE created_at > ''2026-10-02 14:40:00'') THEN NULL WHEN', 'WHERE created_at > ''2026-10-02 14:40:00'') THEN ''pending: no subscriber since 2026-10-02 14:40'' WHEN')
WHERE class = 'issue-1854' AND instr(verify_probe, 'THEN NULL WHEN') > 0;

-- 3. GOAL-REVIEW-GUARD-1
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('goal_review_refusal_share_7d', 'operational', 'guard',
  'refused / reviewed over cloud_ops_events kind code-merge.goal-review rows with a verdict (meta.verdict) and ts in the last 7 days; NULL below 5 reviews. refused = status refused (verdict no, or harm true).',
  'qnfo-audit.cloud_ops_events kind code-merge.goal-review (qnfo-fleet-control GOAL-REVIEW-1, one cached row per code task head), refreshed by the D1 triggers metric_goal_review_refusal_ai and metric_goal_review_refusal_au (migrations/2026-10-07-failure-audit.sql)',
  'first live review 2026-10-07T08:40Z: 1 review, 0 refused',
  '<= 0.6 with at least 5 reviews in 7 days',
  'qnfo-fleet-control',
  'trigger gt 0.6 -> one METRIC-TRIGGER issue: sample the refusals against their diffs (migrations/2026-10-07-failure-audit.sql)',
  'weekly', '> 0.5', '> 0.8',
  NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS metric_goal_review_refusal_ai AFTER INSERT ON cloud_ops_events
WHEN NEW.kind = 'code-merge.goal-review'
BEGIN
  UPDATE metric_registry
  SET last_value = (SELECT CASE WHEN COUNT(*) >= 5 THEN CAST(ROUND(1.0 * SUM(CASE WHEN e.status = 'refused' THEN 1 ELSE 0 END) / COUNT(*), 3) AS TEXT) END
                    FROM cloud_ops_events e
                    WHERE e.kind = 'code-merge.goal-review' AND e.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
                      AND (CASE WHEN json_valid(e.meta) THEN json_extract(e.meta, '$.verdict') END) IS NOT NULL),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'goal_review_refusal_share_7d';
END;

CREATE TRIGGER IF NOT EXISTS metric_goal_review_refusal_au AFTER UPDATE ON cloud_ops_events
WHEN NEW.kind = 'code-merge.goal-review'
BEGIN
  UPDATE metric_registry
  SET last_value = (SELECT CASE WHEN COUNT(*) >= 5 THEN CAST(ROUND(1.0 * SUM(CASE WHEN e.status = 'refused' THEN 1 ELSE 0 END) / COUNT(*), 3) AS TEXT) END
                    FROM cloud_ops_events e
                    WHERE e.kind = 'code-merge.goal-review' AND e.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
                      AND (CASE WHEN json_valid(e.meta) THEN json_extract(e.meta, '$.verdict') END) IS NOT NULL),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'goal_review_refusal_share_7d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'goal_review_refusal_share_7d', 'Code-loop guard: the goal reviewer refuses most code-loop diffs', 'registry', 'gt', 0.6, 3,
  'Pillar autonomy (GOAL-REVIEW-GUARD-1). Over 60% of the code-loop diffs reviewed in 7 days were refused by the goal reviewer (qnfo-fleet-control cmGoalReview). Read SELECT id, ts, text, meta FROM cloud_ops_events WHERE kind = ''code-merge.goal-review'' AND status = ''refused'' ORDER BY ts DESC LIMIT 10, and for each refusal compare the defects it names with the diff (the code task branch, or code_tasks.ctx patch). If most named defects are not in the diff, the reviewer is too strict: set ops_config code_goal_review_models to put another family first, or narrow the harm rule in cmReviewPrompt (qnfo-fleet-control/worker.js). If the defects are real, the reviewer is right and the lever is the proposer (the code_task_success_rate_30d lever: ladder, prompt, window). Never set code_goal_review_enabled off to lower this metric. Definition of done: goal_review_refusal_share_7d <= 0.6 with at least 5 reviews, and the sampled refusals and their judgement written on the issue.',
  'qnfo-fleet-control', 'agent_issues', 72, 1, 'GOAL-REVIEW-GUARD-1 (migrations/2026-10-07-failure-audit.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'goal_review_refusal_share_7d');
