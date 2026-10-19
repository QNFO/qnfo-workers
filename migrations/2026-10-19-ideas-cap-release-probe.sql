-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM idea_proposals WHERE decision = ''ACCEPT'' AND status = ''triaged_hold'' AND rationale LIKE ''[research admission cap %'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) AS TEXT) AS observed', action = 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.' WHERE class = 'issue-100047' AND instr(action, 'IDEAS-CAP-PROBE-1') > 0;
-- IDEAS-CAP-PROBE-1 (2026-10-19, charter pillar: research; agent_issues 100047 IDEAS-CAP-GENERATED-RELEASE-1, code task ct_agpn0vekiunr2f parked on a noop verdict).
-- The release path the issue asked for is live and merged: idea-hub 1.11.1 (ct_im100047) re-queues held cap rows under RESEARCH_ADMISSION_CAP and 1.12.0 (IDEAS-CAP-RATE-1) admits
-- CAP_TRICKLE_PER_RUN rows an hour when the queue is at or over the cap; /health reads 1.13.0, cloud_ops_events kind idea-cap-trickle has one row per hour (22:26Z read: 74 still held, 3 admitted).
-- What stayed open is the contract: it was born VACUOUS-PROBE-V3-1 and its probe counts held rows older than 120 minutes without the issue's own condition (research_queue under 120 rows).
-- research_queue holds 510 rows (active and deferred), so rows are held by design while the trickle drains them and the probe reads 74 for a defect that no longer exists.
-- The probe now states the definition of done as written: with room in the queue (under 120) no held row may be older than 120 minutes; at a full queue the release must be alive, that is a held
-- row exists only with an idea-cap-trickle event inside 125 minutes (one hourly run missed). ops_config ideas_cap_trickle_per_run = 0 (the old hold) stops the events and fails the probe.
-- LIKE literal is 25 bytes (D1 limit 50). The probe never reads the status of the issue itself.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST(CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN (''queued'',''researching'',''review'',''deferred'')) < 120 THEN (SELECT COUNT(*) FROM idea_proposals WHERE decision = ''ACCEPT'' AND status = ''triaged_hold'' AND rationale LIKE ''[research admission cap %'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) WHEN EXISTS (SELECT 1 FROM idea_proposals WHERE decision = ''ACCEPT'' AND status = ''triaged_hold'' AND rationale LIKE ''[research admission cap %'') AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''idea-cap-trickle'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-125 minutes'')) THEN 1 ELSE 0 END AS TEXT) AS observed',
  verify_transport = 'd1-query',
  action = 'IDEAS-CAP-PROBE-1: the release path is idea-hub capRelease (1.11.1 room release, 1.12.0 IDEAS-CAP-RATE-1 trickle); the probe reads 0 while held cap rows are older than 120 minutes only with room in the queue, or, at a full queue, while a trickle run is logged within 125 minutes',
  status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100047' AND instr(action, 'IDEAS-CAP-PROBE-1') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'drain-dash',
  'a closing probe states the definition of done the issue wrote; one without its condition fails for as long as the queue is full, though the release path works',
  'IDEAS-CAP-PROBE-1: the closing probe of issue 100047 reads the release path (room case: held rows over 120 minutes; full queue: a trickle run within 125 minutes)',
  'qnfo-audit read-only 2026-10-19 22:5xZ: research_queue 510 active+deferred, 76 cap-held accepts, idea-cap-trickle events hourly 17:26Z to 22:26Z (3 admitted each), idea-hub /health 1.13.0',
  'migration merged',
  'one remediation_contracts row',
  'the Rollback header of migrations/2026-10-19-ideas-cap-release-probe.sql',
  'a closing probe that measures the defect and can reach its expected value',
  'issue 100047 closes at the next hourly remediation tick',
  'none',
  'd1:qnfo-audit read-only probe run live, node:sqlite fixtures in migrations/ideas-cap-release-probe.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'IDEAS-CAP-PROBE-1:%');
