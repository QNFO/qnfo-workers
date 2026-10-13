-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status = ''queued'') <= COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''research_ready_cap''), 3) + 1 OR COALESCE((SELECT value FROM ops_config WHERE key = ''research_backpressure''), ''on'') = ''off'' THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'fm-unbounded-ready-queue'
-- DETECTOR-NEVER-PARKS-2 and READY-QUEUE-DETECTOR-2 (2026-10-13, pillar autonomy).
-- (1) fm-detector-parked failed at 06:31 UTC: fm-notice-reply-encoded-subject and fm-zaraz-autoinject-worker-html, two
--     runner-https detectors from migration -01, passed and were parked in 'holding' at a 24 h cadence by
--     scripts/remediation_consumer.py, whose runner-https path held every passing contract (REMEDIATION-HOLD-1 parity) and
--     had no exemption for standing detectors, unlike fleet-control's d1-query path. The consumer now keeps a passing fm- or
--     belief- contract active (same pull request). fm-outward-prose-no-lede was created in 'holding' with no next_due_at, so
--     the consumer, which reads holding contracts of runner-https only, never ran it. All three are set active and due now.
-- (2) fm-unbounded-ready-queue read the instantaneous count of queued rows. Intake adds accepted proposals between the
--     20-minute RESEARCH-BACKPRESSURE-1 ticks (06:25-06:28 UTC: three owner-notebook proposals), so the count passes the cap
--     until the next tick defers them; the detector failed on a burst the remedy handles by design. It now counts queued rows
--     outside research_ready that are older than one tick plus a margin (25 minutes): rows the tick should have deferred.
UPDATE remediation_contracts SET status = 'active', attempts = 0, next_due_at = datetime('now')
WHERE class IN ('fm-notice-reply-encoded-subject', 'fm-zaraz-autoinject-worker-html', 'fm-outward-prose-no-lede') AND status = 'holding';
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = ''research_backpressure''), ''on'') = ''off'' THEN ''0'' ELSE CAST((SELECT COUNT(*) FROM research_queue q WHERE q.status = ''queued'' AND NOT EXISTS (SELECT 1 FROM research_ready r WHERE r.id = q.id) AND q.created_at < strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-25 minutes'')) AS TEXT) END AS observed',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'fm-unbounded-ready-queue';
UPDATE failure_modes SET
  root_cause = root_cause || ' | 2026-10-13 DETECTOR-NEVER-PARKS-2: scripts/remediation_consumer.py parked passing runner-https detectors (fm-notice-reply-encoded-subject, fm-zaraz-autoinject-worker-html), and a migration created fm-outward-prose-no-lede in holding',
  remediation = remediation || ' | DETECTOR-NEVER-PARKS-2: the consumer keeps passing fm- and belief- contracts active; the three were reactivated'
WHERE fm_key = 'detector-parked';
UPDATE failure_modes SET
  detector = 'fm-unbounded-ready-queue: no queued row outside research_ready older than 25 minutes (one RESEARCH-BACKPRESSURE-1 tick plus a margin)'
WHERE fm_key = 'unbounded-ready-queue';
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a standing detector runs at its own cadence whatever its last verdict, on every transport; a detector judges what its remedy controls',
   'DETECTOR-NEVER-PARKS-2: the remediation consumer keeps passing fm- and belief- runner-https contracts active; three parked detectors reactivated. READY-QUEUE-DETECTOR-2: fm-unbounded-ready-queue counts queued rows the backpressure tick should already have deferred',
   'fm-detector-parked observed 0 at 06:31 UTC (two runner-https detectors holding, one created holding with no due time); research_queue 06:40 UTC: 6 queued, 3 in research_ready, the other 3 accepted at 06:25-06:28 after the 06:20 tick',
   'merged through the canonical path', 'fm-detector-parked and fm-unbounded-ready-queue pass; fm-outward-prose-no-lede returns its first verdict', 'the Rollback line of this file and a revert of the consumer change',
   'detectors cannot silently stop on the runner-https transport', 'failure_modes_recurring falls by at least 2 within 2 hours of the merge', 'none', 'd1:remediation_contracts, research_queue, research_ready; code:scripts/remediation_consumer.py https_after_verdict');
