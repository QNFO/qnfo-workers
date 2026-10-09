-- ZENODO-EXIT-RUNNER-1 (2026-10-09, pillar research; agent_issues 2186). zenodo.org answers 410 for the owner's records
-- (12 of 12 sampled, 2026-10-08), so the mirror #2186 first asked for is impossible; what can be kept is kept from the
-- surfaces that still answer. scripts/zenodo_exit_runner.py (a step of remediation-consumer.yml, from the GitHub runner)
-- writes one zenodo_exit_ledger row per DataCite DOI under the owner's ORCID (927 on 2026-10-09) and moves it from pending
-- to inhouse (living-paper body over 2,000 chars), ia-recovered (Internet Archive snapshot and its archived files in R2
-- qnfo-canonical zenodo-exit/<recid>/) or metadata-only (no snapshot; the DataCite record with its abstract is kept in R2
-- for every DOI, 859 of 927 carry an abstract over 200 chars). Surfaces tested 2026-10-09: zenodo.org API = 410 Gone;
-- DataCite REST = 200 (927 records); archive.org availability API from the session = 200; web.archive.org from the session
-- = connection reset or 429 (hence the runner); R2 PUT with the repository token = used by the D1 backups.
-- The ledger is a queue, so v_stuck_summary gains zenodo_exit_pending_stalled (pending rows while the runner has logged
-- nothing for 180 minutes) and queue_sla a row; issue 2186's probe closes on every DOI being out of pending.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261009_queue_sla_sql
-- Rollback: DELETE FROM queue_sla WHERE stuck_type = 'zenodo-exit-pending'; DELETE FROM remediation_contracts WHERE class = 'fm-zenodo-exit-stalled'; recreate v_stuck_summary from migrations/2026-10-09-03-publish-rearm.sql (zenodo_exit_ledger is evidence and stays)

CREATE TABLE IF NOT EXISTS zenodo_exit_ledger (
  doi TEXT PRIMARY KEY,
  recid TEXT NOT NULL DEFAULT '',
  title TEXT,
  rtype TEXT,
  abstract_chars INTEGER NOT NULL DEFAULT 0,
  inhouse_slug TEXT,
  inhouse_chars INTEGER,
  meta_key TEXT,
  ia_checked_at TEXT,
  ia_snapshot TEXT,
  files INTEGER,
  bytes INTEGER,
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_zenodo_exit_ledger_status ON zenodo_exit_ledger (status);

DROP VIEW IF EXISTS v_stuck_summary;

CREATE VIEW v_stuck_summary AS
SELECT
  (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id
     WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error,
  (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0
     AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok'
       AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled,
  (SELECT COUNT(*) FROM research_queue WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-180 minutes')) AS research_queued_180m,
  (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending,
  (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact')
     AND datetime(created_at) < datetime('now', '-180 minutes')) AS outreach_waiting,
  (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted')
     AND datetime(updated_at) < datetime('now', '-180 minutes')) AS code_tasks_stalled,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 10800) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status = 'active' AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
       AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h,
  (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes'))
     THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled;

INSERT OR IGNORE INTO queue_sla (stuck_type, queue, definition, cycle_min, sla_min, auto_fix, owner, summary_column) VALUES
 ('zenodo-exit-pending', 'zenodo_exit_ledger', 'a DOI still pending while the runner has logged no zenodo-exit event for 180 minutes', 60, 180,
  'qnfo-cloud-ops dispatches remediation-consumer after 60 idle minutes (PROBE-CADENCE-1); the fm-zenodo-exit-stalled detector files the issue', 'remediation-consumer', 'zenodo_exit_pending_stalled');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('zenodo-exit-stalled', 'the Zenodo-exit recovery stops while DOIs are still pending', 'the runner step fails or the consumer workflow stops being dispatched', 'scripts/zenodo_exit_runner.py hourly in remediation-consumer.yml; PROBE-CADENCE-1 dispatch', 'a zenodo-exit event within 3h, or no pending row', 'fm-zenodo-exit-stalled', '2026-10-09', 2186, 'runner error, token refusal, archive.org refusal', 'zenodo_exit_ledger rows stay pending', 'recovery of the owner''s 927 deposited records');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-zenodo-exit-stalled', NULL, 'ZENODO-EXIT-RUNNER-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = ''pending'') = 0 OR EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''zenodo-exit'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'')) THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'holding', 'failure-mode', 45000, 5, 0);

UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM zenodo_exit_ledger) >= 927 AND (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = ''pending'' OR meta_key IS NULL) = 0 THEN ''1'' ELSE ''0'' END AS observed', status = 'active', last_verdict = NULL
WHERE class = 'issue-2186';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'the Zenodo records can only be recovered by a Worker mirror of zenodo.org', 'built the recovery on the surfaces that still answer: DataCite metadata for every DOI, the in-house body, Internet Archive snapshots from the GitHub runner', 'zenodo.org 410 on 12/12; DataCite 200 with 927 records, 859 abstracts; archive.org availability 200 (record 18133065 snapshot 2026-04-22)', 'every DOI gets a ledger row and at least its DataCite record in R2', 'R2 qnfo-canonical zenodo-exit/ and one ledger table', 'the Rollback line; R2 objects are additive', 'recovery of the owner''s deposited records after the Zenodo exit'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'built the recovery on the surfaces%');
