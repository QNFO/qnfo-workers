-- IDEAS-CAP-DETECTOR-MINUTES-1 (2026-10-19, pillar research; agent_issues 100233; follow-up to IDEAS-CAP-RATE-1 / agent_issues 100047, review minor of session_01QpQv19).
-- WHAT WAS WRONG: the failure-mode detector fm-ideas-cap-hold-no-expiry (and its failure_modes row) bounded a stranded hold at 72 hours. QUEUE-SLA-1 /
-- SLA-120M-1 (owner directive 2026-10-14): every SLA is measured at 10-minute resolution, none exceeds 120 minutes, and a new threshold states minutes. A dead
-- trickle would have gone unnoticed for three days. The issue-100047 probe (a held row older than 120 minutes) cannot serve as the detector: it reads non-zero
-- for about 64 hours while a healthy trickle drains the backlog (3 admitted an hour against about 1.75 held an hour).
-- WHAT THIS CHANGES (two UPDATEs and one decision row, no worker, cron or trigger): the detector reads rate liveness in minutes. It reads 0 when no cap-held
-- ACCEPT is older than 120 minutes, or when an idea-cap-trickle event (idea-hub 1.12.0 capRelease writes one each run that admits a row) exists in the last 120
-- minutes (the triage cron is hourly, so 120 minutes is two missed runs), and counts the stale held rows otherwise. No bound is raised: 72 hours becomes 120
-- minutes. ops_config ideas_cap_trickle_per_run = 0 (the revert switch) is not special-cased: it restores the hold with no expiry, so the detector fires.
-- MEASURED 2026-10-19 17:02Z (qnfo-audit, read-only): 86 cap-held ACCEPTs, oldest 2026-10-17T15:23:48Z; no idea-cap-trickle event yet (idea-hub 1.12.0 is live,
-- the first hourly run after the deploy is due on the :25 grid), so the new detector reads 86 until the first trickle run and 0 after it; the 72-hour
-- detector read 0 throughout (oldest about 50 h). Row counts: remediation_contracts 'fm-ideas-cap-hold-no-expiry' 1 updated, failure_modes 1 updated,
-- decision_log 1 inserted. The closing probe of issue 100233 reads ok once the contract holds minutes and no hours.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM idea_proposals WHERE decision = ''ACCEPT'' AND status = ''triaged_hold'' AND rationale LIKE ''[research admission cap %'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-72 hours'')) AS TEXT) AS observed' WHERE class = 'fm-ideas-cap-hold-no-expiry'; UPDATE failure_modes SET detector = 'no ACCEPT proposal held by the research admission cap is older than 72 hours (the trickle drains a backlog at a net 1.25 an hour; a row older than that means the rate is dead or the inflow outran it)', symptom = 'idea_proposals rows with decision ACCEPT, status triaged_hold and a rationale starting [research admission cap, the oldest more than a day old; the idea-triage-budget event reads 0 released' WHERE fm_key = 'ideas-cap-hold-no-expiry'
-- spof-review: no single point of failure added or removed; the detector is a read of two tables (idea_proposals, cloud_ops_events) the trickle already writes.

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST(CASE WHEN (SELECT COUNT(*) FROM idea_proposals WHERE decision = ''ACCEPT'' AND status = ''triaged_hold'' AND rationale LIKE ''[research admission cap %'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) = 0 THEN 0 WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''idea-cap-trickle'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) THEN 0 ELSE (SELECT COUNT(*) FROM idea_proposals WHERE decision = ''ACCEPT'' AND status = ''triaged_hold'' AND rationale LIKE ''[research admission cap %'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) END AS TEXT) AS observed',
  next_due_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE class = 'fm-ideas-cap-hold-no-expiry' AND instr(verify_probe, '72 hours') > 0;

UPDATE failure_modes SET
  detector = 'the admission rate is alive: either no ACCEPT proposal held by the research admission cap is older than 120 minutes, or an idea-cap-trickle event was logged in the last 120 minutes (the triage cron is hourly, so 120 minutes is two missed runs); a held row older than 120 minutes with no trickle event means the rate is dead',
  symptom = 'idea_proposals rows with decision ACCEPT, status triaged_hold and a rationale starting [research admission cap, older than 120 minutes, while no idea-cap-trickle cloud_ops_events row exists in the last 120 minutes; the idea-triage-budget event reads 0 released'
WHERE fm_key = 'ideas-cap-hold-no-expiry' AND instr(detector, '72 hours') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a detector for a hold with no expiry measures whether the release rate is alive, in minutes; a bound in days lets a dead rate run unseen, and the backlog-age probe of the closing issue cannot be the detector because it is non-zero while a healthy trickle drains',
  'IDEAS-CAP-DETECTOR-MINUTES-1: fm-ideas-cap-hold-no-expiry restated from a 72-hour age bound to rate liveness (0 when no cap-held ACCEPT is older than 120 minutes or an idea-cap-trickle event exists in the last 120 minutes, else the count of stale held rows); failure_modes row text updated to match; no bound raised',
  'D1 2026-10-19 17:02Z: 86 cap-held ACCEPTs, oldest 2026-10-17T15:23:48Z (about 50 h), no idea-cap-trickle event yet after the 1.12.0 deploy; the 72-hour probe read 0; review minor of session_01QpQv19 on the IDEAS-CAP-RATE-1 landing (agent_issues 100233); QUEUE-SLA-1 / SLA-120M-1 states thresholds in minutes, none above 120',
  'migration merged and applied by CI', 'the failure-mode detector and its failure_modes text only; no worker, no cron, no spend',
  'the Rollback line of migrations/2026-10-19-ideas-cap-detector-minutes.sql restores the 72-hour probe and text',
  'a dead cap trickle is seen within 120 minutes of its second missed hourly run instead of 72 hours',
  'issue 100233 closes within 2 h of the merge (its probe reads ok once the contract states minutes) and the detector reads 0 after the first idea-cap-trickle run of idea-hub 1.12.0 within 3 h',
  'none',
  'd1:qnfo-audit idea_proposals, cloud_ops_events (SELECT only); offline suite migrations/ideas-cap-detector-minutes.test.mjs (replays the IDEAS-CAP-RATE-1 migration, then this one, and checks the five liveness cases, the closing probe, idempotence and the Rollback line)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'IDEAS-CAP-DETECTOR-MINUTES-1:') = 1);
