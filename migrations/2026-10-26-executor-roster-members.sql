-- EXECUTOR-ROSTER-MEMBERS-1 (2026-10-26, charter pillar core; metric roster_members_degraded = 2, doctrine revision 5 section 4; docs/breach-doctor/FAMILY-METRIC.md MD-12 A2).
-- v_executor_roster judged every live service_registry row as a deployed script and read worker_live_audit by the row's own name. Two rows are not scripts the audit can
-- find, and both read healthy = 0 for ever, so roster_members_degraded could never reach 0:
--   * qnfo-backlog-exec is kind 'member': a route of qnfo-lifecycle (base_url https://qnfo-lifecycle.q08.workers.dev/backlog, BACKLOG-FOLD-1 2026-10-06). The audit probes a
--     script of that name and answers http 404 NOT_DEPLOYED by design, so its three capabilities (backlog-inventory, issue-drain, stranded-job-recovery) read degraded
--     while the worker that serves them, qnfo-lifecycle, answers http 200 (read 2026-10-26T16:16Z). A member now takes the probe of its host worker.
--   * qnfo-workers is the retired Workers Builds repository-root stub (HTTP 410 by design, fleet_deploys TOMBSTONE-STUB 2026-10-26T15:40Z). It has no worker_live_audit row,
--     which the view read as healthy 0 ('http none at never'). A row the audit has never probed is unmeasured (healthy NULL): it is not degraded and it is not a healthy
--     executor either (metric roster_capabilities_single_executor counts SUM(healthy = 1)); probe_coverage_pct is the metric that grades unprobed rows.
-- A probed worker that is down or stale still reads 0. Measured effect on the next hourly refresh: roster_members_degraded 2 -> 0. The three backlog capabilities now
-- count as a single healthy executor, so roster_capabilities_single_executor reads 3 higher (175 -> 178) because the measurement is more correct, not because a path was
-- lost; that metric stays in breach and its fix is a second executor per capability, not a threshold change.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_v_executor_roster
-- Rollback: DROP VIEW IF EXISTS v_executor_roster; then re-run the CREATE VIEW text saved in bak_20261026_v_executor_roster.sql (the previous definition, taken before this file ran)

CREATE TABLE IF NOT EXISTS bak_20261026_v_executor_roster AS
SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'view' AND name = 'v_executor_roster';

DROP VIEW IF EXISTS v_executor_roster;

CREATE VIEW v_executor_roster AS
WITH reg AS (
  SELECT s.service AS service, s.capabilities AS capabilities,
         CASE WHEN s.kind = 'member' AND s.base_url LIKE 'https://%.%' THEN substr(s.base_url, 9, instr(substr(s.base_url, 9), '.') - 1) ELSE s.service END AS probe_worker
    FROM service_registry s
   WHERE s.state = 'live'
)
SELECT j.value AS capability, r.service AS executor, 'worker' AS kind,
       CASE WHEN w.worker IS NULL THEN NULL WHEN w.http = 200 AND datetime(w.probed_at) > datetime('now', '-24 hours') THEN 1 ELSE 0 END AS healthy,
       'worker_live_audit ' || r.probe_worker || ' http ' || COALESCE(w.http, 'none') || ' at ' || COALESCE(w.probed_at, 'never') AS evidence
  FROM reg r
  JOIN json_each(CASE WHEN json_valid(COALESCE(r.capabilities, '')) AND substr(trim(r.capabilities), 1, 1) = '[' THEN r.capabilities ELSE '[]' END) j
  LEFT JOIN worker_live_audit w ON w.worker = r.probe_worker
UNION ALL
SELECT 'worker:' || r.service, r.service, 'worker',
       CASE WHEN w.worker IS NULL THEN NULL WHEN w.http = 200 AND datetime(w.probed_at) > datetime('now', '-24 hours') THEN 1 ELSE 0 END,
       'no capability list in service_registry; worker_live_audit ' || r.probe_worker || ' http ' || COALESCE(w.http, 'none') || ' at ' || COALESCE(w.probed_at, 'never')
  FROM reg r LEFT JOIN worker_live_audit w ON w.worker = r.probe_worker
 WHERE json_array_length(CASE WHEN json_valid(COALESCE(r.capabilities, '')) AND substr(trim(r.capabilities), 1, 1) = '[' THEN r.capabilities ELSE '[]' END) = 0
UNION ALL
SELECT 'ai-model-inference', r.target, 'model',
       CASE WHEN 1.0 * SUM(r.status = 'pass') / COUNT(*) >= 0.8 THEN 1 ELSE 0 END,
       'ai_calibration_results probe model: ' || SUM(r.status = 'pass') || ' pass of ' || COUNT(*) || ' in 24 h'
  FROM ai_calibration_results r
 WHERE r.probe = 'model' AND r.ts > (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
 GROUP BY r.target
UNION ALL
SELECT c.capability, c.provenance, 'mechanism', NULL,
       'capability_ledger: ' || COALESCE(c.reliability, '?') || '; last exercised ' || COALESCE(c.last_exercised_at, 'not recorded')
  FROM capability_ledger c;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-infra-breach-remediation',
  'a registry member (a route inside another worker) is judged by the probe of its host, and a row the audit never probed is unmeasured, not degraded',
  'EXECUTOR-ROSTER-MEMBERS-1: v_executor_roster reads kind member rows through the host worker named in base_url, and reads a missing worker_live_audit row as healthy NULL',
  'read 2026-10-26T16:16Z: worker_live_audit qnfo-backlog-exec http 404 NOT_DEPLOYED (kind member of qnfo-lifecycle, which answers 200), qnfo-workers has no audit row (retired repository-root stub, HTTP 410); roster_members_degraded 2, roster_capabilities_single_executor 175',
  'applied by migration', 'one view; consumers are the metric ticks roster_members_degraded and roster_capabilities_single_executor and the offline suite doctrine-ledgers-20261012', 'the Rollback line (the previous view text is in bak_20261026_v_executor_roster)',
  'the roster tells a degraded executor from a member route and from an unprobed stub', 'roster_members_degraded 0 at the next hourly refresh and at the one after; roster_capabilities_single_executor reads 3 higher because the backlog capabilities become measured', NULL, 'node migrations/executor-roster-members.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'EXECUTOR-ROSTER-MEMBERS-1:%');
