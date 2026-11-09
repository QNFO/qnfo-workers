-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status='open', close_channel=NULL WHERE id IN (1002654,1002658,1002659,1002660,1002663,1002664,1002666,1002667);
-- spof-review: no new cron, trigger, binding, host or credential; UPDATEs of existing rows.
-- CAUSE-MAPPED: no metric is registered here.
-- DOC-ITEMS / PORTFOLIO-GAP sweep (2026-11-09, charter pillar autonomy). Each row below was read against live D1 and the repo:
--  * 1002659/1002660/1002663/1002664: every code-bearing item names an issue that is closed in agent_issues (925,926,976,1040 closed/resolved; 1077,1079,1081,1110,1190 closed;
--    1508,1518 closed); the remaining items are session-local run notes (probe counts, truncated cf_worker_read output) with no code surface.
--  * 1002654/1002658: session-local follow-ups of 2026-07-16 and 2026-10-26 (restart a desktop client, share more slides, a 403 on one fetch): no repository surface.
--  * 1002666/1002667: worker_compat_state at 2026-11-09T09:32:11Z reads live_date 2026-11-04, days_behind 5 for qnfo-youtube-shorts and radar-hub (was 30 at 04:32Z).
-- Left open on purpose: 1002662 (1000035 RESEARCH-THROUGHPUT-1 still open, it is the doer), 1002651, 1002653, 1002671, 1002685 (owner-held or unverified items), 1002665 (qnfo-workers root compat_date advanced to 2026-11-04 in this PR; closes after deploy by the autopilot).
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'doc-items-sweep-2026-11-09', 'triaged', 'session:doc-items-sweep', datetime('now'),
  CASE
    WHEN a.id IN (1002666,1002667) THEN 'DOC-ITEMS-SWEEP-1: worker_compat_state checked_at 2026-11-09T09:32:11Z live_date=2026-11-04 days_behind=5 (<30); repo wrangler.toml compatibility_date=2026-11-04.'
    WHEN a.id IN (1002654,1002658) THEN 'DOC-ITEMS-SWEEP-1: items are session-local follow-ups of a historical handoff with no repository surface; recorded as no longer applying (read 2026-11-09).'
    ELSE 'DOC-ITEMS-SWEEP-1: code-bearing items name issues already closed in agent_issues (925,926,976,1040,1077,1079,1081,1110,1190,1508,1518 verified status closed/resolved 2026-11-09); remaining items are session-local run notes.'
  END
FROM agent_issues a WHERE a.id IN (1002654,1002658,1002659,1002660,1002663,1002664,1002666,1002667) AND a.status='open'
ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence;
UPDATE agent_issues SET status='closed', close_channel='session:doc-items-sweep', updated_at=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE id IN (1002654,1002658,1002659,1002660,1002663,1002664,1002666,1002667) AND status='open';
