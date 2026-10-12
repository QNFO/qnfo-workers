-- WORKERS-BP-AUDIT-D1-1 (2026-10-12; agent_issues 2348 "the audit script does not report to D1, so no d1-query probe exists", 2340, 2341,
-- 2342, 2347, 2399; charter pillars security and autonomy; doctrine section 24 measure-to-act, METRIC-CLOSED-LOOP-1).
-- WHAT  The whole-tree Workers best-practices audit (scripts/fleet_best_practices_audit.py --d1, run by scripts/loop_breaker_runner.py in
--       the remediation-consumer step) now writes to qnfo-audit:
--         workers_bp_findings   one row per finding of the latest run (replaced each run): worker, check, severity fail|advisory, file:line,
--                               the offending line text (the code loop's anchor) and why;
--         workers_bp_runs       one row per run: sha, workers, fail and advisory counts, the fleet's cron-trigger count;
--         v_workers_bp_debt     per-worker totals;
--         metric_registry       workers_bp_findings_open (target 0) and fleet_cron_triggers (limit 250 per account), refresh_class runner;
--         agent_issues          WORKERS-BP-DEBT-1: <worker>, one per worker with fail-class debt, with code-task / code-anchor lines and a
--                               d1-query probe on this table (filed by the runner, not here).
--       CI's diff-only guard (scripts/workers_standards_guard.py, rev 3 in the same pull request) refuses the same patterns in any new change,
--       so the standing debt measured here can only fall. The issues that described this debt in prose get probes on the table below.
-- WHY   The guard protects the future; nothing measured the present. 2348 and 2347 record that the audit had no D1 half, so their contracts sat at
--       needs-machine-probe and the issues could neither close on evidence nor refile on recurrence. A probe that reads an empty table before the
--       first run would pass falsely, so every probe here also requires a run in the last 26 hours ('no-run' otherwise).
-- spof-review: the runner rides the existing remediation-consumer step (dispatched by qnfo-cloud-ops when idle, PROBE-CADENCE-1) and the CI guard is the second path for the same defects; fm-workers-standards-debt-unmeasured detects a stalled runner from the hourly remediation tick.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_workers_bp_debt; DROP TABLE IF EXISTS workers_bp_findings; DROP TABLE IF EXISTS workers_bp_runs; DELETE FROM metric_registry WHERE metric IN ('workers_bp_findings_open', 'fleet_cron_triggers'); DELETE FROM analytics_metric_triggers WHERE metric_key IN ('workers_bp_findings_open', 'fleet_cron_triggers'); DELETE FROM control_registry WHERE control = 'workers-bp-audit-d1'; DELETE FROM failure_modes WHERE fm_key = 'workers-standards-debt-unmeasured'; DELETE FROM remediation_contracts WHERE class = 'fm-workers-standards-debt-unmeasured'; DELETE FROM capability_ledger WHERE capability = 'workers-standards-debt-measured'

CREATE TABLE IF NOT EXISTS workers_bp_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker TEXT NOT NULL,
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  file TEXT,
  line INTEGER,
  line_text TEXT,
  why TEXT,
  run_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workers_bp_findings_worker_sev ON workers_bp_findings (worker, severity);

CREATE TABLE IF NOT EXISTS workers_bp_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  sha TEXT,
  workers INTEGER,
  fail_count INTEGER,
  advisory_count INTEGER,
  cron_triggers INTEGER
);

CREATE VIEW IF NOT EXISTS v_workers_bp_debt AS
SELECT worker,
       SUM(CASE WHEN severity = 'fail' THEN 1 ELSE 0 END) AS fail_count,
       SUM(CASE WHEN severity <> 'fail' THEN 1 ELSE 0 END) AS advisory_count,
       GROUP_CONCAT(DISTINCT CASE WHEN severity = 'fail' THEN check_name END) AS fail_checks,
       MAX(run_at) AS run_at
FROM workers_bp_findings
GROUP BY worker;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('workers_bp_findings_open', 'system', 'guard',
  'COUNT of workers_bp_findings rows with severity fail in the latest audit run: Workers anti-patterns on main that the CI guard refuses in new changes (Math.random ids, string-compared secrets, interpolated SQL, passThroughOnException, destructured ctx, observability or traces not declared, a queue consumer without a dead-letter queue, node imports without the flag).',
  'qnfo-audit.workers_bp_findings, written by scripts/fleet_best_practices_audit.py --d1 from the remediation-consumer runner (loop_breaker_runner.py)',
  '28 fail-class findings in 9 workers (2026-10-12, before the per-worker issues)', '0', 'qnfo-code-orchestrator',
  'one WORKERS-BP-DEBT-1: <worker> issue per worker, filed by the runner with code-task / code-anchor lines; its d1-query probe closes it when the worker is clean',
  'hourly', '> 0', '> 40', 'MEASURED', 'runner'),
 ('fleet_cron_triggers', 'system', 'guard',
  'count of cron expressions across the live wrangler.toml files, against the Workers limit of 250 cron triggers per account (Paid). Written by the same audit run.',
  'qnfo-audit.workers_bp_runs.cron_triggers (scripts/fleet_best_practices_audit.py --d1)', '32 of 250 (2026-10-12)', '<= 200', 'qnfo-ops',
  'trigger gt 200 files a METRIC-TRIGGER issue: fold or retire crons (CRON-RATE-CEILING-1, LIFECYCLE members) before the account limit refuses a deploy',
  'hourly', '> 200', '> 240', 'MEASURED', 'runner');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes, created_at)
SELECT 'workers_bp_findings_open', 'Workers standards debt: anti-patterns the CI guard refuses are still on main', 'metric_registry', 'gt', 0, 'medium',
       'Pillar security/autonomy. Read SELECT * FROM v_workers_bp_debt ORDER BY fail_count DESC. Every worker with fail_count > 0 has (or gets on the next runner pass) an open WORKERS-BP-DEBT-1: <worker> issue whose description lists each finding with file:line and carries code-task and code-anchor lines for the code loop; advance those issues (the code loop takes them in queue order; a session takes a worker whose file is unclaimed). A false positive is marked on its line with standards-ok: <reason> or in scripts/workers-standards-allowlist.txt, which the next audit run honours. Definition of done: workers_bp_findings_open = 0 for 7 days; the guard keeps it there.',
       'qnfo-code-orchestrator', 'agent_issues', 168, 1, 'WORKERS-BP-AUDIT-D1-1 (migrations/2026-10-12-29-workers-bp-findings.sql). The per-worker issues are the doers; this umbrella fires only while debt remains.', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'workers_bp_findings_open');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes, created_at)
SELECT 'fleet_cron_triggers', 'Cron budget: the fleet is within 50 cron triggers of the 250-per-account limit', 'metric_registry', 'gt', 200, 'medium',
       'Pillar cost/core. Read the latest workers_bp_runs row and the crons of every live wrangler.toml. Fold crons that fire the same handler (branch on controller.cron), move members under qnfo-lifecycle, retire idle schedules (CRON-RATE-CEILING-1 keeps each at or under 144 fires a day). Definition of done: fleet_cron_triggers <= 200.',
       'qnfo-ops', 'agent_issues', 168, 1, 'WORKERS-BP-AUDIT-D1-1. Workers limits page (2026-10-08): 250 cron triggers per account on Paid; the per-Worker cap was removed 2023-10-18.', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'fleet_cron_triggers');

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
 ('workers-bp-audit-d1', 'scripts/fleet_best_practices_audit.py --d1 (scripts/loop_breaker_runner.py, remediation-consumer step)', 'audit',
  'Workers anti-patterns standing on main unmeasured, so the issues about them can neither close on evidence nor refile on recurrence', 0, 'keep', 'applied',
  'scripts/workers_standards_guard.py in deploy-gate refuses the same patterns in every new change; fm-workers-standards-debt-unmeasured (hourly remediation tick) detects a runner that stopped', '2026-10-12T12:00:00Z',
  'offline suite --selftest: findings replaced per run, one issue per worker deduped on the open title, code-task and unique code-anchor lines, probe reads the debt and passes when the worker is clean, metrics written. First tree read 2026-10-12: 28 live workers, 28 fail-class and 545 advisory findings, 32 cron triggers.', 2348, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

UPDATE control_registry
SET evidence = COALESCE(evidence, '') || ' Rev 3 (2026-10-12, WORKERS-STANDARDS-GUARD-3): adds interpolated-sql, swallowed-catch, ai-response-string-assumption, a new unrestricted [[send_email]] binding, new_classes (legacy Durable Object storage) and a compatibility-date move past 2026-08-04 under no_nodejs_compat while importing node:*; the whole-tree audit shares its allowlist.',
    reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'workers-standards-guard';

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('workers-standards-debt-unmeasured', 'Workers anti-patterns stand on main with no measurement, so their issues cannot close on evidence or refile on recurrence',
  'the standards work of 2026-10-12 shipped a diff-only CI guard and a read-only report; the report never wrote to D1 (agent_issues 2348, 2347)',
  'WORKERS-BP-AUDIT-D1-1: the report writes workers_bp_findings and workers_bp_runs from the consumer runner and files per-worker WORKERS-BP-DEBT-1 issues with probes',
  'a workers_bp_runs row younger than 26 hours', 'fm-workers-standards-debt-unmeasured', '2026-10-12', 2348,
  'the remediation-consumer step stops running or the runner raises before publish', 'workers_bp_findings_open stops moving and every WORKERS-BP-DEBT-1 probe answers no-run', 'every Workers standards issue');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-workers-standards-debt-unmeasured', NULL, 'WORKERS-BP-AUDIT-D1-1', 'failure-mode detector',
  'SELECT ''1'' AS expected, CASE WHEN (SELECT MAX(run_at) FROM workers_bp_runs) > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'workers-standards-debt-measured', 'WORKERS-BP-AUDIT-D1-1 (migrations/2026-10-12-29-workers-bp-findings.sql, scripts/fleet_best_practices_audit.py --d1)',
       'remediation-consumer runner with CLOUDFLARE_API_TOKEN; scripts/loop_breaker_runner.py step', 'offline suite passes; first live run after merge writes workers_bp_runs',
       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL, 'the fleet measures its own Workers anti-pattern debt hourly, files one issue per worker with a code-task line and closes each on a probe'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability = 'workers-standards-debt-measured');

-- Probes for the issues that described this debt in prose. Each requires a run in the last 26 hours (else observed = 'no-run'), so an empty
-- table before the first run never passes them.
UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''0'' AS expected, CASE WHEN (SELECT MAX(run_at) FROM workers_bp_runs) > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') THEN CAST((SELECT COUNT(*) FROM workers_bp_findings WHERE check_name = ''secret-compare'') AS TEXT) ELSE ''no-run'' END AS observed'
WHERE class IN ('issue-2340', 'issue-2347');

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''0'' AS expected, CASE WHEN (SELECT MAX(run_at) FROM workers_bp_runs) > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') THEN CAST((SELECT COUNT(*) FROM workers_bp_findings WHERE check_name = ''math-random-token'') AS TEXT) ELSE ''no-run'' END AS observed'
WHERE class = 'issue-2341';

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''0'' AS expected, CASE WHEN (SELECT MAX(run_at) FROM workers_bp_runs) > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') THEN CAST((SELECT COUNT(*) FROM workers_bp_findings WHERE check_name = ''swallowed-catch'') AS TEXT) ELSE ''no-run'' END AS observed'
WHERE class = 'issue-2342';

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''0'' AS expected, CASE WHEN (SELECT MAX(run_at) FROM workers_bp_runs) > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') THEN CAST((SELECT COUNT(*) FROM workers_bp_findings WHERE check_name IN (''traces-not-declared'', ''sampling-not-explicit'', ''observability-missing'')) AS TEXT) ELSE ''no-run'' END AS observed'
WHERE class = 'issue-2348';

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''0'' AS expected, CASE WHEN (SELECT MAX(run_at) FROM workers_bp_runs) > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') THEN CAST((SELECT COUNT(*) FROM workers_bp_findings WHERE check_name = ''ai-run-no-token-budget'' AND worker = ''qnfo-research-exec'') AS TEXT) ELSE ''no-run'' END AS observed'
WHERE class = 'issue-2399';
