-- READER-REPORT-1 (2026-10-19, charter pillar research; owner request 2026-10-19, verbatim: "there does need to be an easy, discreet,
-- point-of-impact way to report paper typos and suspected errors while reading them, whether factual or even awkward wording, etc.").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM queue_sla WHERE stuck_type = 'reader-report-pending'; DELETE FROM remediation_contracts WHERE class = 'fm-reader-report-pending'; DELETE FROM failure_modes WHERE fm_key = 'reader-report-pending'; DELETE FROM capability_ledger WHERE capability = 'readers report typos and errors at the passage on papers.qnfo.org' (reader_reports, its indexes, internal_errata rows and the decision_log row are evidence and stay)
-- spof-review: none added. The report path has one writer (qnfo-gateway POST /api/paper-report) and two checks: the request-time
-- model check and the hourly sweep that retries it; a gateway outage loses only new reports, which the reader sees as an error.
--
-- WHAT THIS FILE DOES
--   reader_reports       one row per anonymous reader report from a paper page (qnfo-gateway 3.29.0, which also creates the table
--                        IF NOT EXISTS): paper slug and version, kind (typo, wording, factual, citation, other), the selected passage,
--                        the reader's note, seen (repeats of the same passage within 7 days), status pending -> confirmed |
--                        not-confirmed | no-paper | error, the checker's model and reason. No name, email or network address.
--                        A confirmed report is written to internal_errata with the same id (rr-...), status open, owner
--                        qnfo-research-exec, so errata-hub confirms it once more and the revision loop folds it into the paper's
--                        next version (REVISION-ERRATA-1). An unconfirmed report never reaches internal_errata.
--   queue_sla            reader-report-pending: a report still pending 120 minutes after it arrived (SLA-120M-1); the gateway's
--                        hourly tick retries the check up to 3 times and then marks it error.
--   failure mode         reader-report-pending with detector fm-reader-report-pending (hourly d1-query, expected 0).
CREATE TABLE IF NOT EXISTS reader_reports (id TEXT PRIMARY KEY, slug TEXT NOT NULL, version TEXT, kind TEXT NOT NULL, passage TEXT, note TEXT, passage_key TEXT, seen INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, verdict_model TEXT, verdict_why TEXT, correction TEXT, erratum_id TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE INDEX IF NOT EXISTS reader_reports_dedupe ON reader_reports (slug, kind, passage_key, created_at);
CREATE INDEX IF NOT EXISTS reader_reports_status ON reader_reports (status, created_at);

INSERT OR IGNORE INTO queue_sla (stuck_type, queue, definition, cycle_min, sla_min, auto_fix, owner, summary_column, producer_cycle_min)
VALUES ('reader-report-pending', 'reader_reports',
  'a reader report still pending (not checked against its paper) 120 minutes after it arrived',
  60, 120,
  'qnfo-gateway hourly tick (READER-REPORT-1 rrSweep) re-runs the check for pending rows older than 5 minutes, at most 3 attempts, then sets status error with the reason (revert: UPDATE reader_reports SET status = ''pending'', attempts = 0 WHERE id = <row>)',
  'qnfo-gateway', 'none: measured by contract fm-reader-report-pending', NULL);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('reader-report-pending',
  'a reader''s report of a typo or an error on a paper page is stored but never checked, so it never reaches the revision loop',
  'the request-time check (waitUntil) failed or was cut off and the hourly sweep in qnfo-gateway scheduled() did not run or failed',
  'READER-REPORT-1 (qnfo-gateway 3.29.0, migrations/2026-10-19-reader-report.sql): the hourly tick retries pending checks; the detector reads the age of the oldest pending row',
  'no reader_reports row is pending more than 120 minutes after it arrived',
  'fm-reader-report-pending', '2026-10-19', NULL,
  'reader_reports rows with status pending and created_at older than 120 minutes',
  'readers'' reports wait unread; a confirmed typo or error is not corrected in the next version',
  'reader_reports and the revision briefs of the papers they name');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-reader-report-pending', NULL, 'READER-REPORT-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM reader_reports WHERE status = ''pending'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-gateway', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('readers report typos and errors at the passage on papers.qnfo.org', 'READER-REPORT-1 (qnfo-gateway 3.29.0, migrations/2026-10-19-reader-report.sql)',
  'qnfo-gateway AUDIT and LIVING_PAPER bindings, Workers AI gpt-oss-120b, errata-hub internal confirm (kimi-k2.6), qnfo-research-exec revision loop',
  'new; a report reaches a revision only after one model confirms it from the paper text and errata-hub confirms it again', '2026-10-19', NULL,
  'reader_reports; internal_errata rows with id rr-...; GET papers.qnfo.org/health lists reader-reports');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session READER-REPORT-1',
  'Readers who notice a typo or an error are the cheapest independent check the papers can get; their reports are leads, so a model checks each against the paper before it reaches a revision, and the existing errata path does the rest',
  'READER-REPORT-1: a Report button on the text selection and a line at the end of each paper on papers.qnfo.org, POST /api/paper-report into reader_reports, a model check, confirmed reports into internal_errata for the revision loop',
  'qnfo-gateway paper pages already had a selection toolbar (Ask about this, Copy quote); internal_errata status open is what REVISION-ERRATA-1 reads (qnfo-research-exec 0.27.0); errata-hub sweeps open internal_errata into errata_queue and confirms with a second family',
  'migration merged', 'one public POST route (hidden field, minimum time on page, 6 per address per hour, 200 a day), one table, at most one model call per report and 5 retries an hour',
  'qnfo-gateway revert to 3.28.x removes the route and the button; reader_reports rows stay as evidence',
  'readers can flag a problem at the passage it is in, and confirmed reports correct the paper in its next version',
  'reader_reports holds no row pending over 120 minutes (fm-reader-report-pending = 0) within 120 minutes of the first report',
  'qnfo-gateway paper page rendered offline in Chromium (selection toolbar and dialog), node suite qnfo-gateway/reader-report.test.mjs, qnfo-audit schema read (SELECT only); papers.qnfo.org itself is refused by the session proxy'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'session READER-REPORT-1');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'READER-REPORT-WATCHMAKER-1: count the hourly reader-report check in the watchmaker index',
  'Charter pillar: autonomy. qnfo-gateway 3.29.0 READER-REPORT-1 adds a recurring step to the gateway''s hourly tick: rrSweep re-checks reader_reports rows still pending. CLAUDE.md WATCHMAKER-INDEX-1: a PR that adds a recurring operation adds it to WATCHMAKER_OPS. Add as the first entry of WATCHMAKER_OPS in qnfo-fleet-dashboard/worker.js: { key: "reader-report", what: "Reader reports of typos and errors on paper pages checked against the paper (READER-REPORT-1, qnfo-gateway, hourly)", runner: "cron:qnfo-gateway", cadence_h: 1, first_due: "2026-10-20T00:00:00Z", sql: "SELECT MAX(updated_at) AS last FROM reader_reports WHERE status <> ''pending''" }, and bump VERSION (patch).
code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js
code-anchor: var WATCHMAKER_OPS = [
code-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "key: \"reader-report\""}',
  'session READER-REPORT-1', 'optimization', 'medium', 'open',
  CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'READER-REPORT-WATCHMAKER-1:%');
