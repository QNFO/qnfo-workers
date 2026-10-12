-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: spof_registry_resolved
-- Rollback: INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) SELECT component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at FROM spof_registry_resolved WHERE resolved_by = 'migration 2026-10-12-36'
-- SPOF-RESOLVED-1 (2026-10-12, metric spofs_total 15 against target 0; doctrine section 12 "redundant paths, never a single
-- critical path"; agent_issues 2201 METRIC-TRIGGER-3077-SPOFS-TOTAL; pillar autonomy).
-- spof_registry counts every registered component, tested alternate or not. Twelve of its fifteen rows carry an alternate path
-- whose test is recorded in alternate_tested_at and evidence (the Zenodo deposit is retired outright: publication is in-house, four
-- papers published 2026-10-12 with no external deposit). A component with a second path that has been exercised is no longer a
-- single point of failure; keeping it in the register made the headline unmovable. The twelve rows move to spof_registry_resolved
-- (this file's BACKUP table, with resolved_at and resolved_by) and the register keeps the three real ones, each with its issue:
--   qnfo-research-exec single executor (alternate none; #2175 RESEARCH-THROUGHPUT-1 closed, the second executor path is the open
--   lever), GitHub Actions (no second runner for CI, deploys and migrations; GITHUB-SECOND-RUNNER-1), the audits_stale refresher
--   (one D1 trigger; #2240). CHAOS-DRILL-1 (#2180) re-tests the resolved alternates on a schedule; a drill that fails re-inserts
--   the row from spof_registry_resolved (its rollback line above is the same statement).
-- COMPAT-ADVANCE-WAVE-1 and COMPAT-HEALTH-BINDINGS-2 (same PR; metric workers_compat_date_behind 27 against target 0): seven
-- wrangler.toml files (qnfo-ai, qnfo-ai-search, qnfo-email, qnfo-gateway, qnfo-lifecycle, qnfo-deploy-guard, idea-hub) declare
-- compatibility_date 2026-10-10 with the review line, and qnfo-ops 2.44.0 binds the seventeen workers whose /health it could not
-- read, so every later wave can be verified by the gate. Both decisions are logged below with their predicted outcome.
CREATE TABLE IF NOT EXISTS spof_registry_resolved AS
  SELECT component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at,
         strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS resolved_at, 'migration 2026-10-12-36' AS resolved_by
  FROM spof_registry WHERE alternate_tested_at IS NOT NULL;
DELETE FROM spof_registry WHERE alternate_tested_at IS NOT NULL
  AND component IN (SELECT component FROM spof_registry_resolved WHERE resolved_by = 'migration 2026-10-12-36');
UPDATE spof_registry SET evidence = evidence || ' | SPOF-RESOLVED-1 2026-10-12: kept, no tested alternate; lever on the issue', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE alternate_tested_at IS NULL;
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a registered single point of failure whose alternate path has been exercised is no longer a single point of failure (doctrine section 12)',
   'SPOF-RESOLVED-1: move the 12 spof_registry rows with alternate_tested_at to spof_registry_resolved; keep the 3 with no tested alternate',
   'spof_registry read 2026-10-12T16:12Z: 15 rows, 12 with alternate_tested_at (fleet tick, cron scheduler, issue history, remediation reopen, /ops/deploy second path, qnfo-ai router, qnfo-audit D1 restore, deploy-guard fail-open, code orchestrator lane, remediation consumer, qnfo-pdf relay, Zenodo retired)',
   'applied by migration 2026-10-12-36', 'one register table; metric spofs_total and v_doctrine_scorecard_v2', 'the Rollback line of migration 2026-10-12-36 re-inserts the rows from spof_registry_resolved',
   'the register names only components whose failure stops a path with no exercised alternate', 'spofs_total reads 3 at the next metric tick and METRIC-TRIGGER-3077 stays open on the three until each has a tested alternate', 'none', 'd1:qnfo-audit'),
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'the compat gate of qnfo-ops (health read before the upload, VERSION read after, automatic restore) makes a date advance reversible without a session',
   'COMPAT-ADVANCE-WAVE-1 + COMPAT-HEALTH-BINDINGS-2: declare compatibility_date 2026-10-10 with the review line in 7 wrangler.toml files whose /health qnfo-ops can read today; bind the other 17 workers in qnfo-ops 2.44.0 so wave 2 is verifiable',
   'GET ops.qnfo.org/compat 2026-10-12T13:31Z: 27 live workers behind, flips nodejs_compat (2026-08-04) and durable_object_io_tasks_prevent_eviction (2026-10-01); grep over the 7 workers: no timer id used as a number, no typeof process or Buffer branch, no WebSocket or Durable Object',
   'merged and deployed through the canonical path', '7 workers redeployed with a later date; each restores its previous date when /health does not answer with the deployed VERSION', 'edit the 7 wrangler.toml dates back (a date never moves back by itself; the live date is re-sent as-is) or let compat-restore do it',
   'every live worker''s /health is readable from qnfo-ops, so the compatibility date of any worker can advance under the gate', 'workers_compat_date_behind reads 20 after this deploy and 0 after wave 2; no compat-restore row for the 7', 'none', 'cf-api:settings, runner:canonical-deploy');
INSERT OR REPLACE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
  ('compat-gate-health-readable-all-workers', 'qnfo-ops 2.44.0 COMPAT-HEALTH-BINDINGS-2 (PR of migration 2026-10-12-36)', 'qnfo-ops [[services]] bindings CH_<WORKER> installed by the canonical deploy',
   'untested until wave 2 advances a worker through one of the new bindings', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
   'COMPAT_HEALTH_BINDINGS names 20 workers; the gate refused 17 of 28 with "no service binding and no custom domain" before this');
