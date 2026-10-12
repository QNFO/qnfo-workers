-- SCHOLAR-PDF-ALL-1 (2026-10-12, agent_issues 2410, charter pillar reach; research report 5 §9.2: Google Scholar processes a PDF only
-- when the abstract page links it with citation_pdf_url). qnfo-pdf 1.2.0 renders, on a */10 cron, the PDF of every published,
-- distributed or external_preprint paper that has none (472 of 567 on 2026-10-12) and re-renders a paper whose body changed after its
-- stored PDF; papers.qnfo.org (qnfo-gateway SCHOLAR-PDF-URL-1) then emits the tag. This file registers the loop's measurement:
--   metric scholar_pdf_backlog (worker-written each tick; target 0) with its trigger (gt 50 after the loop has had a day to drain),
--   failure mode pdf-backlog-stalled with its fm- detector (the metric was last refreshed more than 2 hours ago), control_registry row,
--   capability_ledger row. No queue_sla row: the loop holds no items of its own (the backlog is derived from living-paper.papers), and its
--   stall is the fm detector, which measures age, not count (QUEUE-SLA-1).
-- spof-review: the cron's second path for the same outcome is the on-demand GET /pdf/<slug> render that already serves callers, and fm-pdf-backlog-stalled runs from the hourly remediation tick, not from the worker it watches.
-- Re-touched 2026-10-12 12:10Z (migration_runs 119/120 error): control_registry.kind took 'audit' / 'loop', which its CHECK constraint refuses
-- (hold, filter, pause, kill-switch, gate, cap, guard, lease); now 'guard'. Statements before the register row had applied; every statement is
-- idempotent, so the re-run completes the file. CHECK-ENUM-LINT-1 in scripts/apply_migrations.py --check now refuses such a literal offline.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'scholar_pdf_backlog'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'scholar_pdf_backlog'; DELETE FROM control_registry WHERE control = 'scholar-pdf-backlog-loop'; DELETE FROM failure_modes WHERE fm_key = 'pdf-backlog-stalled'; DELETE FROM remediation_contracts WHERE class = 'fm-pdf-backlog-stalled'; DELETE FROM capability_ledger WHERE capability = 'scholar-pdf-every-paper'

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('scholar_pdf_backlog', 'reach', 'target',
  'COUNT of living-paper.papers with status in (published, distributed, external_preprint), a body over 200 chars and no pdf_path, after the latest qnfo-pdf backlog tick (SCHOLAR-PDF-ALL-1). Each such paper page lacks citation_pdf_url, so Google Scholar does not index its full text.',
  'living-paper.papers.pdf_path; written by qnfo-pdf scheduled() every 10 minutes', '472 of 567 public papers without a PDF (2026-10-12, before the loop)', '0', 'qnfo-pdf',
  'the qnfo-pdf cron renders PDF_BACKLOG_BATCH papers per tick; trigger gt 50 files the issue when the loop falls behind',
  '10m', '> 50', '> 400', 'NEW', 'worker-written');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes, created_at)
SELECT 'scholar_pdf_backlog', 'Scholar coverage: more than 50 public papers still have no PDF (no citation_pdf_url)', 'metric_registry', 'gt', 50, 'medium',
       'Pillar reach. Read the latest cloud_ops_events rows with job = qnfo-pdf (kind pdf-backlog: rendered, failed, backlog; kind pdf-render-fail: the slugs and errors). If renders fail (Browser Rendering 502/429, empty PDF), fix the renderer or raise the retry window; if the loop is slow, raise PDF_BACKLOG_BATCH (vars, at most 20) or add a second cron inside CRON-RATE-CEILING-1; if the metric is stale, see fm-pdf-backlog-stalled. Definition of done: scholar_pdf_backlog <= 50 and falling to 0.',
       'qnfo-pdf', 'agent_issues', 24, 1, 'SCHOLAR-PDF-ALL-1 (migrations/2026-10-12-30-scholar-pdf-backlog.sql). The loop needs about 14 hours from first deploy to clear the 2026-10-12 backlog at 6 per 10 minutes; the 24 h cooldown gives it that day.', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'scholar_pdf_backlog');

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
 ('scholar-pdf-backlog-loop', 'qnfo-pdf/worker.js scheduled() (cron */10, SCHOLAR-PDF-ALL-1)', 'guard',
  'a published paper page without citation_pdf_url, so Google Scholar indexes no full text for it', 0, 'keep', 'applied',
  'GET /pdf/<slug> on qnfo-pdf renders on demand (the pre-existing path); fm-pdf-backlog-stalled from the hourly remediation tick detects a stopped loop; a paper that failed 3 times in 24 h is skipped for the day so one bad body cannot hold the tick', '2026-10-12T12:30:00Z',
  'qnfo-pdf/pdf-backlog.test.mjs: newest-first selection, pdf_path writes, metric and run event, failure isolation, poison skip, stale refresh, oversize flag. Measured 2026-10-12: 472 published, 2 distributed and 3 external_preprint papers without a PDF.', 2410, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('pdf-backlog-stalled', 'the PDF backlog loop stops and papers keep publishing without a PDF',
  'before 1.2.0 a PDF existed only when something called GET /pdf/<slug>; 472 of 567 public papers never got one',
  'SCHOLAR-PDF-ALL-1 cron in qnfo-pdf; this detector files the failure when the metric goes stale',
  'metric_registry.scholar_pdf_backlog last_refreshed within 2 hours', 'fm-pdf-backlog-stalled', '2026-10-12', 2410,
  'no qnfo-pdf tick wrote the metric for 2 hours (cron inert after a deploy that dropped schedules, Browser Rendering down, AUDIT binding missing)',
  'scholar_pdf_backlog stops moving while papers.qnfo.org pages lack citation_pdf_url', 'Scholar coverage of every new paper');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-pdf-backlog-stalled', NULL, 'SCHOLAR-PDF-ALL-1 live (qnfo-pdf >= 1.2.0)', 'failure-mode detector',
  'SELECT ''1'' AS expected, CASE WHEN (SELECT last_refreshed FROM metric_registry WHERE metric = ''scholar_pdf_backlog'') > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 hours'') THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'scholar-pdf-every-paper', 'SCHOLAR-PDF-ALL-1 (qnfo-pdf 1.2.0, migrations/2026-10-12-30-scholar-pdf-backlog.sql)',
       'Browser Rendering binding, living-paper and qnfo-audit D1, qnfo-releases R2; the canonical deploy applies the cron', 'offline suite passes; first live tick after the deploy writes the metric',
       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL, 'every public paper gets a PDF within a day of publication and its page emits citation_pdf_url for Google Scholar'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability = 'scholar-pdf-every-paper');
