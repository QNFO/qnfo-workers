-- ISSUE-DISPOSITION-RELAPSE-1 (2026-10-18, pillar autonomy; owner doctrine: all issues resolve root causes so they cannot
-- recur)
--
-- WHY
-- A disposition is written once and never re-checked. Measured 2026-10-18 13:50Z: of ten open issues whose triage said
-- resolved/closed, NINE had a live counter-example - and reopened_count was 0 on every one of them, so the relapse path
-- had never fired:
--     2853 deploy_freshness_h             "no longer gt 2"      -> 580.94h against a >24h threshold (hit=1)
--     2459 tick_sequence_completion_24h   "no longer lt 0.9"    -> 0.792 against <0.9 (hit=1)
--     2089 worker_count                   28 vs cap 30          -> 31
--     2192 metric registry staleness      0 stale               -> 35 STALE + 2 NEVER_REFRESHED
--     2754 deploy non-canonical           none left             -> 10 workers, two of them that day
--     2721 research-exec reconcile        fixed, 0 recurrences  -> 20 errors/24h
--     2680 q08_hours_since_last_piece     inside target         -> 25.1h against <8h
--     2853/2459 were reopened by hand; the mechanism that should have done it did not exist.
--
-- WHAT THIS ADDS
-- One hourly workflow, `issue-disposition-relapse`: it re-reads each disposition's OWN condition - the metric trigger that
-- governs the issue, via v_metric_trigger_state - and when that condition is breaching again it reopens the disposition
-- (triage_state='triaged', reopened_count+1) with a dated note appended to the historical close_evidence. It never
-- deletes or overwrites evidence, and it never closes anything.
--
-- DELIBERATELY ONE-DIRECTIONAL
-- Close-on-recovery is already owned by TRIGGER-RECOVERY-1. Adding a second automatic CLOSER here would create exactly
-- the oscillation the fleet already files issues about (VERIFICATION-OSCILLATION-1, #2953: two evaluators owning one
-- issue so it reopens and re-closes). So this pass only ever moves a disposition from "resolved" back to "triaged", which
-- removes a false claim and can never manufacture one.
--
-- ANTI-OSCILLATION RATE LIMIT
-- A metric that flaps would otherwise reopen the same issue every tick. The pass skips any disposed row whose triaged_at
-- is younger than 30 minutes and stamps triaged_at on the rows it reopens, so each issue can be reopened at most once per
-- half hour no matter how often the metric crosses its threshold.
--
-- SCOPE
-- Issues whose title names a metric trigger or a metric key:
--   METRIC-TRIGGER-<id>-...  -> analytics_metric_triggers.id
--   METRIC-...: <metric_key>  -> metric_key after ": "
-- Titles that name no metric (LOOP-BREAKER-1, DEPLOY-NON-CANONICAL-DEPLOY, METRIC-REGISTRY-STALENESS-1 prose) have no
-- machine-checkable condition here and are left alone; a metric-free relapse guard would be a guess, not a check.
--
-- MEASURED BEFORE WRITING
--   open issues whose triage said resolved/closed: 10 at 13:50Z. Nine breaching (listed above). One (2676,
--   social_posts_7d = 35 against lt 25, hit=0) genuinely held and was closed by hand through the canonical path.
--   The one row still carrying a stale disposition after that work (2919, drift_total = 2 against gt 0, hit=1) is
--   exactly what this pass is built to catch: the first run should reopen it.
--
-- SAFETY
--   Idempotent by construction: after a reopen the row is no longer in ('resolved','closed'), so it cannot be reopened
--   twice. Capped at 20 rows per run. No row is deleted, no evidence is overwritten, no issue is closed.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM fleet_crons WHERE name='issue-disposition-relapse-hourly';
--   DELETE FROM fleet_tasks WHERE id='issue-disposition-relapse';
--   the reopen rows it wrote are ordinary triage records and are left in place (they are true).
--
-- Verify after apply (within ~1 minute for the first run, then hourly):
--   SELECT status, started_at FROM fleet_runs WHERE task_id='issue-disposition-relapse' ORDER BY id DESC LIMIT 3;
--   SELECT COUNT(*) FROM agent_issues i JOIN issue_triage t ON t.issue_id=i.id
--    WHERE i.status='open' AND t.triage_state IN ('resolved','closed');   -- 0

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('issue-disposition-relapse',
        'ISSUE-DISPOSITION-RELAPSE-1: reopen a resolved/closed disposition whose own metric is breaching again (reopen only; never closes)',
        'workflow',
        '{"steps":[{"type":"sql","db":"AUDIT","name":"reopen-relapsed","sql":"UPDATE issue_triage SET triage_state = ''triaged'', reopened_count = COALESCE(reopened_count, 0) + 1, triaged_at = datetime(''now''), close_evidence = COALESCE(close_evidence, '''') || char(10) || ''REOPENED '' || datetime(''now'') || '' (ISSUE-DISPOSITION-RELAPSE-1): the disposition said resolved/closed but the metric that governs this issue is breaching again (v_metric_trigger_state hit=1). Reopened automatically, not by hand. Close-on-recovery belongs to TRIGGER-RECOVERY-1; this pass only removes a false claim.'' WHERE triage_state IN (''resolved'', ''closed'') AND (triaged_at IS NULL OR julianday(''now'') - julianday(triaged_at) > 0.0208) AND issue_id IN (SELECT a.id FROM agent_issues a JOIN v_metric_trigger_state s ON ((a.title LIKE ''METRIC-TRIGGER-%'' AND s.id = CAST(substr(a.title, 16, instr(substr(a.title, 16), ''-'') - 1) AS INTEGER)) OR (s.metric_key = trim(substr(a.title, instr(a.title, '': '') + 2)))) WHERE a.status = ''open'' AND s.hit = 1 ORDER BY a.id LIMIT 20)"},{"type":"sql","db":"AUDIT","name":"ledger","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''issue-disposition-relapse-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''issue-disposition-relapse'', ''ISSUE-DISPOSITION-RELAPSE-1: '' || (SELECT COUNT(*) FROM issue_triage WHERE triage_state IN (''resolved'', ''closed'') AND close_evidence LIKE ''%ISSUE-DISPOSITION-RELAPSE-1%'' AND triaged_at >= datetime(''now'', ''-10 minutes'')) || '' disposition(s) reopened this tick | '' || (SELECT COUNT(*) FROM agent_issues i JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = ''open'' AND t.triage_state IN (''resolved'', ''closed'')) || '' stale disposition(s) remaining'', NULL, ''issue-disposition-relapse'', ''ok''"}]}',
        30000, 1, 1, 1, datetime('now'));

-- next_fire NULL = due on the very next tick (fleet-exec: next_fire IS NULL OR next_fire <= now), so the first pass runs
-- within a minute of the merge.
INSERT INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('issue-disposition-relapse-hourly', '20 * * * *', 'issue-disposition-relapse', 1, 'UTC', datetime('now'))
ON CONFLICT(name) DO UPDATE SET cron_expr=excluded.cron_expr, task_id=excluded.task_id, enabled=excluded.enabled, updated_at=excluded.updated_at;
