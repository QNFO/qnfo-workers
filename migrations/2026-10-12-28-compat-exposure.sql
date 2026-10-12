-- COMPAT-EXPOSURE-1 (2026-10-12, pillar core), the D1 half of COMPAT-DATE-DECLARED-APPLY-1 (qnfo-ops 2.42.0).
-- Measured 2026-10-12 (GET /settings of all 28 live workers): 21 at compatibility date 2026-08-01, qnfo-ai-search at
-- 2026-07-09, qnfo-lifecycle and qnfo-memory-mcp at 2026-08-10, idea-hub and qnfo-pdf at 2026-09-01, qnfo-fleet-control at
-- 2026-09-08. The canonical deploy re-sent the live date on every upload and never read wrangler.toml, so no date could
-- advance; nothing measured how far behind the fleet was.
-- This file adds: the table qnfo-ops writes its exposure snapshot to (one row per live worker per snapshot, every 6 h),
-- the metric workers_compat_date_behind (workers in the newest snapshot whose live date is older than at least one
-- default change in qnfo-ops COMPAT_FLIPS) with its hourly refresh and its trigger, the failure mode and its detector,
-- and the control_registry row for the review gate.
-- Idempotent: CREATE ... IF NOT EXISTS, INSERT OR IGNORE, INSERT ... WHERE NOT EXISTS, UPDATE. No DELETE or DROP outside the rollback.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS workers_compat_behind_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'workers_compat_date_behind'; DELETE FROM metric_registry WHERE metric = 'workers_compat_date_behind'; DELETE FROM remediation_contracts WHERE class = 'fm-compat-date-inert'; DELETE FROM failure_modes WHERE fm_key = 'compat-date-inert'; DELETE FROM control_registry WHERE control = 'compat-advance-review-gate'; (worker_compat_state is kept: it holds measurements)

CREATE TABLE IF NOT EXISTS worker_compat_state (
  worker TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  live_date TEXT NOT NULL,
  toml_date TEXT,
  toml_reviewed TEXT,
  live_flags TEXT NOT NULL DEFAULT '',
  toml_flags TEXT NOT NULL DEFAULT '',
  nodejs_compat_live INTEGER NOT NULL DEFAULT 0,
  nodejs_compat_toml INTEGER NOT NULL DEFAULT 0,
  nodejs_compat_default_on INTEGER NOT NULL DEFAULT 0,
  flips_between TEXT NOT NULL DEFAULT '[]',
  flips_count INTEGER NOT NULL DEFAULT 0,
  days_behind INTEGER,
  advance TEXT,
  PRIMARY KEY (worker, checked_at)
);
CREATE INDEX IF NOT EXISTS idx_worker_compat_state_checked ON worker_compat_state (checked_at);

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('workers_compat_date_behind', 'operational', 'target', 'COUNT(*) of live workers in the newest worker_compat_state snapshot with flips_count > 0: the live compatibility date is older than at least one Cloudflare default change listed in qnfo-ops COMPAT_FLIPS (COMPAT-EXPOSURE-1)', 'qnfo-audit.worker_compat_state (qnfo-ops compatSnapshot, every 6 h; GET https://ops.qnfo.org/compat)', '28 of 28 on 2026-10-12 (every live date is before the 2026-10-01 default)', '0', 'qnfo-ops', 'qnfo-ops', '1h', NULL, NULL, NULL, NULL, 'UNMEASURED', 'computed');

-- NULL while no snapshot exists (the table is written by qnfo-ops 2.42.0 after its deploy); NULL is no hit.
CREATE TRIGGER IF NOT EXISTS workers_compat_behind_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' AND EXISTS (SELECT 1 FROM worker_compat_state)
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM worker_compat_state WHERE checked_at = (SELECT MAX(checked_at) FROM worker_compat_state) AND flips_count > 0) AS TEXT)
  WHERE metric = 'workers_compat_date_behind';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'workers_compat_date_behind', 'Live workers run at a compatibility date older than a Cloudflare default change', 'registry', 'gt', 0, 6,
  'Pillar core (COMPAT-EXPOSURE-1). At least one live worker has a compatibility date older than a default change in qnfo-ops COMPAT_FLIPS. Read GET https://ops.qnfo.org/compat (live date, wrangler.toml date, nodejs_compat state, the changes between) and SELECT worker, live_date, flips_between, advance FROM worker_compat_state WHERE checked_at = (SELECT MAX(checked_at) FROM worker_compat_state) AND flips_count > 0 ORDER BY live_date. Lever, one cohort of at most two workers at a time, a control-plane worker only after two cohorts kept their date: run node scripts/compat-risk-scan.mjs <worker>; read the changes between its live date and today on the compatibility flags page; in <worker>/wrangler.toml set compatibility_date to a date not after today, add compatibility_flags no_nodejs_compat and no_nodejs_compat_v2 only where the scan reports a risk, and add the line # compat-advance: reviewed <today>. The canonical deploy applies the date on the worker''s next deploy when qnfo-ops can read its /health (a service binding or a custom domain), keeps it only when /health answers with the deployed VERSION, and otherwise uploads the previous date again (deployment_history action compat-restore). A worker whose advance column says its /health cannot be read needs a service binding from qnfo-ops first. Done: workers_compat_date_behind = 0 at two refreshes.',
  'qnfo-ops', 'agent_issues', 168, 1, 'COMPAT-EXPOSURE-1 (migrations/2026-10-12-28-compat-exposure.sql); NULL until the first snapshot, and NULL is no hit'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'workers_compat_date_behind');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('compat-date-inert', 'a compatibility date written in wrangler.toml never reached Cloudflare',
  'cfWorkerDeploy read compatibility_date from the live GET /settings and sent it back on every upload; the date in wrangler.toml was never parsed (the same inert-config class as the crons of 1337, the flags of COMPAT-FLAGS-DECLARED-APPLY-1 and the observability blocks of OBSERVABILITY-DECLARED-APPLY-1)',
  'COMPAT-DATE-DECLARED-APPLY-1 (qnfo-ops 2.42.0): /ops/deploy applies a later declared date that carries a compat-advance review line, verifies /health against the deployed VERSION and restores the previous date when it does not answer; the exposure table and workers_compat_date_behind measure the gap',
  'no worker whose wrangler.toml carries a reviewed later date stays unadvanced across snapshots 7 days apart', 'fm-compat-date-inert', '2026-10-12', NULL,
  'a wrangler.toml declares a later compatibility_date than the live worker has', 'the fleet stays at the date each worker was created or last hand-deployed with, 21 of 28 at 2026-08-01', 'every live worker: runtime fixes and defaults behind a date never arrive');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-compat-date-inert', NULL, 'COMPAT-DATE-DECLARED-APPLY-1', 'failure-mode detector',
  'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM worker_compat_state n JOIN worker_compat_state o ON o.worker = n.worker AND o.checked_at <= strftime(''%Y-%m-%dT%H:%M:%SZ'', n.checked_at, ''-7 days'') WHERE n.checked_at = (SELECT MAX(checked_at) FROM worker_compat_state) AND n.advance LIKE ''next deploy advances%'' AND o.advance LIKE ''next deploy advances%'' AND o.toml_date = n.toml_date) THEN ''0'' ELSE ''1'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('compat-advance-review-gate', 'qnfo-ops/worker.js decideCompatAdvance + compatAdvanceGate (COMPAT-DATE-DECLARED-APPLY-1)', 'gate',
  'a compatibility date nobody read the changes for going live on the next deploy (60 wrangler.toml files carried unreviewed dates on 2026-10-12, 6 of them later than the live date), and an advance whose effect on /health qnfo-ops cannot see',
  0, 'keep', 'applied',
  'the gate withholds only the date change, never the deploy: the upload goes out with the live date. A worker qnfo-ops cannot probe gains a path by a service binding from qnfo-ops or a custom domain; wrangler deploy (the container worker path) sets a date directly',
  NULL,
  'qnfo-ops/compat-date-apply.test.mjs runs cfWorkerDeploy for each branch: no review line, earlier date, future date, date after its review, unread live settings, refusing or throwing gate, Cloudflare refusal; each uploads the live date and the deploy succeeds. Live 2026-10-12: GET https://qnfo-ops.q08.workers.dev/fleet read 18 of 28 workers as cf-1042 (health not readable from qnfo-ops).',
  NULL);
