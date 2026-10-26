-- BP26-PRODUCERS-1 (2026-10-26, charter pillars core and autonomy; owner directive 2026-10-26 "Implement general best practices systemwide across the fleet"; breach bp26_metrics_unmeasured, trigger 14541, agent_issues 1000363).
-- WHAT WAS WRONG: bp26_metrics_unmeasured read 53 (migrations/2026-10-27-bp26-sql-producers.sql measured the three whose input is a qnfo-audit table). The other 53 take their input from a
-- repository scan, a public page, DNS, the Cloudflare API, another database or a GitHub API read, and a D1 trigger on fleet_tick_heavy cannot reach any of those. The metric trigger's own text says
-- "a worker cron step for other databases and live probes"; the existing runner-side producers (scripts/fleet_best_practices_audit.py --d1, scripts/cf_obs_issue_bridge.py) already write metrics from
-- the remediation-consumer job (refresh_class = 'runner') and had no framework to share.
-- WHAT THIS DOES: adds the evidence table of scripts/bp26_producers.py, the framework that runs every scripts/bp26_<area>.py module's collectors from loop_breaker_runner.py (the depth-0 step of the hourly
-- remediation-consumer job) and writes a metric only when the collector measured it (None writes nothing: unknown is never a value). bp26_probe_results keeps the numerator and denominator behind each
-- value (one row per host, file, surface or record, ok 1, 0 or NULL) so a reader can see WHICH host fails a header check, and the history a 28-day availability figure is computed from; the framework
-- trims it to 40 days. No metric is touched here: each collector's own migration states its metrics' real source_of_truth.
-- Revert: drop the table and index (Rollback line); the framework then records an evidence-write error per run and still writes metrics.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_bp26_probe_subject; DROP INDEX IF EXISTS idx_bp26_probe_metric_time; DROP TABLE IF EXISTS bp26_probe_results;
-- spof-review: the framework runs in the remediation-consumer job, which qnfo-cloud-ops dispatches when idle for 60 minutes and pushes and workflow_run also start; a missed run delays the runner metrics only, and metric_staleness_breach_rec records the gap.

CREATE TABLE IF NOT EXISTS bp26_probe_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  metric TEXT NOT NULL,
  subject TEXT NOT NULL,
  ok INTEGER,
  detail TEXT,
  producer TEXT
);

CREATE INDEX IF NOT EXISTS idx_bp26_probe_metric_time ON bp26_probe_results (metric, run_at);

CREATE INDEX IF NOT EXISTS idx_bp26_probe_subject ON bp26_probe_results (subject, run_at);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8',
  'the 53 unmeasured BP26 metrics need a runner-side framework, not a hand-written value; unknown must stay unknown, so a collector that cannot measure writes nothing and its evidence rows are kept',
  'BP26-PRODUCERS-1: scripts/bp26_producers.py (collector framework, metric writes limited to the [BP26] tag), the bp26_probe_results evidence table, and the hook in scripts/loop_breaker_runner.py',
  'metric_registry 2026-10-26T17:18Z: 53 of 56 [BP26] metrics UNMEASURED; scripts/loop_breaker_runner.py already runs scripts/fleet_best_practices_audit.py --d1 from the consumer job and writes metric workers_bp_findings_open (refresh_class runner)',
  'applied by migration; the framework runs on the next remediation-consumer run after merge', 'one new table and two indexes in qnfo-audit; one new import in a runner script that never raises',
  'the Rollback line', 'every BP26 metric has a place for its producer and its evidence',
  'bp26_metrics_unmeasured falls as collectors land; no metric changes in this file', 'none directly; it is the substrate the BP26 reach and compliance collectors write through',
  'offline: scripts/bp26_producers.py --selftest and migrations/bp26-runner-producers.test.mjs; live: the next remediation-consumer run'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-PRODUCERS-1:%');
