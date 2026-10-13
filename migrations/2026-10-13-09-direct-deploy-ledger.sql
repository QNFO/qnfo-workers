-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE spof_alternate_probes SET enabled = 0, probe_sql = 'SELECT ''ok'' AS expected, ''no D1 evidence: the direct_content_deploy fallback writes no ledger row'' AS observed', window_note = 'disabled until DEPLOY-SECOND-PATH-LEDGER-1 lands: scripts/direct_content_deploy.py writes a deployment_history row (action deploy-direct) so the drill can read it' WHERE component = 'qnfo-ops /ops/deploy'
-- DEPLOY-SECOND-PATH-LEDGER-1 (2026-10-13, agent_issues 2451, pillar core; follows CHAOS-DRILL-1, migration 2026-10-12-39).
-- The alternate of qnfo-ops /ops/deploy is canonical-deploy.yml falling back to scripts/direct_content_deploy.py (drilled
-- 2026-10-09, run 37903533048, idea-hub 1.8.1). It left no row in qnfo-audit, so -39 seeded its chaos-drill probe disabled
-- (read live 2026-10-13: enabled 0, never run; deployment_history held 0 deploy-direct rows). The script now writes one
-- deployment_history row per deploy attempt (action deploy-direct, deployed_by canonical-deploy/direct_content_deploy, status
-- success or failed, version_id the worker's VERSION, notes with the run and the reason the fallback ran), so the probe reads
-- that evidence and is enabled here. Window 35 days: the path runs only when /ops/deploy is unreachable or on purpose
-- (workflow_dispatch of canonical-deploy.yml with fallback_drill=<worker>), so a monthly drill keeps it green. Until the first
-- direct run after this lands the probe reads pending and the 6-hourly drill files CHAOS-DRILL-FAILED-1: qnfo-ops /ops/deploy;
-- the next passing drill closes it.
UPDATE spof_alternate_probes SET
  probe_sql = 'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM deployment_history WHERE action = ''deploy-direct'' AND status = ''success'' AND deployed_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-35 days'')) THEN ''ok'' ELSE ''pending: no direct_content_deploy run recorded in 35 days'' END AS observed',
  window_note = '35 days: scripts/direct_content_deploy.py writes deployment_history action deploy-direct on every attempt; it runs when /ops/deploy is unreachable or on a canonical-deploy.yml fallback_drill dispatch',
  enabled = 1
WHERE component = 'qnfo-ops /ops/deploy';
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'the second deploy path counts as tested only while D1 holds a recent row it wrote itself',
   'DEPLOY-SECOND-PATH-LEDGER-1: scripts/direct_content_deploy.py writes a deployment_history row (action deploy-direct) per deploy attempt, fail-open; spof_alternate_probes qnfo-ops /ops/deploy enabled with a 35-day deploy-direct success probe',
   'spof_alternate_probes qnfo-ops /ops/deploy read 2026-10-13: enabled 0, last_run_at NULL; deployment_history deploy-direct rows: 0; the 2026-10-09 drill (run 37903533048) is recorded only in cloud_ops_events and spof_registry',
   'merged with the script change; the probe applies on the next 6-hourly chaos drill', 'one probe row; one D1 insert per direct deploy attempt, which never fails the deploy',
   'the Rollback line of migration 2026-10-13-09 and a revert of the PR',
   'the chaos drill can read the deploy fallback from D1 instead of trusting a date written once',
   'the first drill after merge reads pending and files CHAOS-DRILL-FAILED-1: qnfo-ops /ops/deploy; the first fallback run or fallback_drill dispatch writes a deploy-direct success row and the next drill passes and closes it',
   'none', 'd1:qnfo-audit deployment_history, spof_alternate_probes; code:scripts/direct_content_deploy.py');
