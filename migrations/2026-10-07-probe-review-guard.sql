-- PROBE-REVIEW-GUARD-1 (2026-10-07, pillar autonomy, agent_issues 2112, session_013sMN4). qnfo-cloud-ops 1.24.0 PROBE-REVIEW-1
-- judges every changed closing probe against its issue's definition of done and takes a self-confirming probe out of the
-- closing path (contract status probe-review-refused). Its failure mode is a reviewer that calls sound probes
-- self-confirming, which would leave issues with no next action (v_issues_no_next_action) and slow every close.
-- probe_review_refused_share_7d (guard) is refused / judged over the probe-review rows with a verdict in the last 7 days,
-- NULL below 5; two D1 triggers refresh it on every review row (insert and the cache upsert), json_valid-guarded so a
-- malformed row can never fail the review write. Trigger gt 0.5 with a sampling lever.
-- Idempotent: CREATE ... IF NOT EXISTS, INSERT OR IGNORE, guarded INSERT.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS metric_probe_review_refused_ai; DROP TRIGGER IF EXISTS metric_probe_review_refused_au; DELETE FROM metric_registry WHERE metric = 'probe_review_refused_share_7d'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'probe_review_refused_share_7d';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('probe_review_refused_share_7d', 'operational', 'guard',
  'refused / judged over cloud_ops_events kind probe-review rows with a verdict (meta.verdict) and ts in the last 7 days; NULL below 5. refused = verdict self-confirming.',
  'qnfo-audit.cloud_ops_events kind probe-review (qnfo-cloud-ops PROBE-REVIEW-1, one row per probe text), refreshed by the D1 triggers metric_probe_review_refused_ai and metric_probe_review_refused_au (migrations/2026-10-07-probe-review-guard.sql)',
  'none before qnfo-cloud-ops 1.24.0',
  '<= 0.5 with at least 5 judged probes in 7 days',
  'qnfo-cloud-ops',
  'trigger gt 0.5 -> one METRIC-TRIGGER issue: sample the refusals against their issues (migrations/2026-10-07-probe-review-guard.sql)',
  'weekly', '> 0.4', '> 0.7',
  NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS metric_probe_review_refused_ai AFTER INSERT ON cloud_ops_events
WHEN NEW.kind = 'probe-review'
BEGIN
  UPDATE metric_registry
  SET last_value = (SELECT CASE WHEN COUNT(*) >= 5 THEN CAST(ROUND(1.0 * SUM(CASE WHEN e.status = 'refused' THEN 1 ELSE 0 END) / COUNT(*), 3) AS TEXT) END
                    FROM cloud_ops_events e
                    WHERE e.kind = 'probe-review' AND e.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
                      AND (CASE WHEN json_valid(e.meta) THEN json_extract(e.meta, '$.verdict') END) IS NOT NULL),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'probe_review_refused_share_7d';
END;

CREATE TRIGGER IF NOT EXISTS metric_probe_review_refused_au AFTER UPDATE ON cloud_ops_events
WHEN NEW.kind = 'probe-review'
BEGIN
  UPDATE metric_registry
  SET last_value = (SELECT CASE WHEN COUNT(*) >= 5 THEN CAST(ROUND(1.0 * SUM(CASE WHEN e.status = 'refused' THEN 1 ELSE 0 END) / COUNT(*), 3) AS TEXT) END
                    FROM cloud_ops_events e
                    WHERE e.kind = 'probe-review' AND e.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
                      AND (CASE WHEN json_valid(e.meta) THEN json_extract(e.meta, '$.verdict') END) IS NOT NULL),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'probe_review_refused_share_7d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'probe_review_refused_share_7d', 'Verification guard: the probe reviewer calls most closing probes self-confirming', 'registry', 'gt', 0.5, 3,
  'Pillar autonomy (PROBE-REVIEW-GUARD-1). Over half of the closing probes judged in 7 days were called self-confirming by qnfo-cloud-ops PROBE-REVIEW-1 and taken out of the closing path. Read SELECT id, ts, text, meta FROM cloud_ops_events WHERE kind = ''probe-review'' AND status = ''refused'' ORDER BY ts DESC LIMIT 10 and, for each, read the issue (agent_issues.description) and the contract probe. If the reason does not hold (the probe does measure the definition of done), the reviewer is too strict: set ops_config probe_review_enforce to record while you narrow the self-confirming rule in probeReviewPrompt (qnfo-cloud-ops/worker.js), then put the wrongly refused contracts back to active. If the reasons hold, rewrite those probes to measure the outcome each issue names (the rewrite is re-judged and restored on its own). Never set probe_review_enabled off to lower this metric. Definition of done: probe_review_refused_share_7d <= 0.5 with at least 5 judged probes, and the sampled refusals and their judgement written on the issue.',
  'qnfo-cloud-ops', 'agent_issues', 72, 1, 'PROBE-REVIEW-GUARD-1 (migrations/2026-10-07-probe-review-guard.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'probe_review_refused_share_7d');
