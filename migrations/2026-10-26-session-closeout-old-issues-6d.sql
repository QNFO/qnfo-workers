-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-observing-probe-at-birth', verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = 1000478) AS observed' WHERE class = 'issue-1000478'; DELETE FROM session_records WHERE session_id = 'session-old-issues-6d-2038';
-- SESSION-CLOSEOUT-20261026-OLD-ISSUES-6D (pillar autonomy; SESSION-RECORD-1, OWNER-NO-LOOSE-ENDS-1, CLOSE-PROBE-CIRCULAR-1).
-- 1. The one session_records row for the work on the issues older than 6 days (user request "RESOLVE, DEPLOY, AND CLOSE ALL ISSUES OLDER THAN 6 DAYS", then the TP-*, METRIC-FIX-RELAPSED,
--    FLEET-JOURNEY-FAILED and PAPER-LEARN-1 clusters), with honest counts: 21 issues taken, 11 closed with evidence.
-- 2. The closing probe of agent_issues 1000478 (ASK-METRIC-STALE-1, fix merged and live in qnfo-ai-search 2.11.3, PR 4819). Its contract was superseded by CLOSE-PROBE-CIRCULAR-1 because the template probe
--    observed the issue's own status; this replaces it with a probe that measures the defect (the metric holds NULL or a value in 0..1, not the 33.3 percent left by another writer) and re-activates it.
--    The probe fails now (33.3 at 2026-10-25T08:45Z) and passes once the next hourly measure() clears the stale value, so it cannot pass by absence.

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM metric_registry WHERE metric = ''ask_helpful_rate_30d'') THEN ''metric row ask_helpful_rate_30d is missing'' WHEN (SELECT last_value FROM metric_registry WHERE metric = ''ask_helpful_rate_30d'') IS NULL THEN ''ok'' WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = ''ask_helpful_rate_30d'') AS REAL) BETWEEN 0 AND 1 THEN ''ok'' ELSE ''ask_helpful_rate_30d holds '' || (SELECT last_value FROM metric_registry WHERE metric = ''ask_helpful_rate_30d'') || '' (a percent from another writer; measure() writes 0..1 or clears it)'' END AS observed',
    verify_transport = 'd1-query',
    status = 'active',
    last_verdict = NULL
WHERE class = 'issue-1000478' AND status = 'superseded';

INSERT INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
)
SELECT
  'session-old-issues-6d-2038',
  'core/issue-hygiene',
  'Claude Code',
  'Worked the open agent_issues older than 6 days (about 110 at the start, 92 at the end) through 15 pull requests, 14 merged and live when this was written: stale-search code-task supersede (4674), spare-domain route restore (4680), cron-grid tick declared plus its parse hotfix (4685, 4692), PAPER-LEARN-1 triage of 21 learnings (4710), evolve parse-pass metric (4715), journey runner heartbeat attestation (4717) and its refresh (4847, open), persona close clean streak (4753), idea-hub feed cache and public-gate batch (4758, 4794), revise-noop and cron-monitor definitions of done (4761, 4802), ask metric stale (4819), CONTROL-PROBE-AT-BIRTH-1 (4839). 21 issues taken: 11 closed with evidence (2380, 100103, 100307, 100311, 100319, 100325, 100338, 100353, 1000269, 1000456, 1000465); the rest have a merged or open fix and wait on a probe window, a code-loop task or a date.',
  'Decide-and-proceed on reversible fixes; every change through a pull request on the canonical path from its own worktree (the shared checkout carries other sessions edits); every migration replayed offline on the live table shapes and every new check proven to fail against the old code; a lane merge skips deploy-gate, so a worker.js is parsed with node --check before the pull request (the 0.55.2 deploy was refused by Cloudflare 10021 because */5 inside a VERSION comment ended the comment). Closed only through the contract trigger or issue_triage.close_evidence. A first note on 100281 claimed a cron was fine without a read and was corrected after /health and subscribe_funnel. Left to their owners: 100454 (owner mailbox), 100168 (GitHub ruleset), voice-stt register or retire, 2805 (prompt-store scripts live in the owner private repository), outcome metrics, and the issues other sessions hold under live work claims (rem-a2 alone holds 50 claims).',
  'scripts/code-task-publish.py, scripts/cf_ops_actions.py, scripts/fleet_journeys.py, scripts/apply_migrations.py (+ tests), qnfo-fleet-control 0.55.3 (cron grid), idea-hub 1.14.6, qnfo-ai-search 2.11.3, migrations paper-learn-session-triage, evolve-parse-pass-metric, persona-close-clean-streak, revise-noop-dod-replace, cron-monitor-dod-replace, control-probe-at-birth, census-heartbeat-refresh, this file',
  '#4674 #4680 #4685 #4692 #4710 #4715 #4717 #4753 #4758 #4761 #4794 #4802 #4819 #4839 #4847',
  'Deployed on merge through the canonical path: qnfo-fleet-control 0.55.3, idea-hub 1.14.6, qnfo-ai-search 2.11.3. Migrations applied by CI. No secret written; no Cloudflare resource created; work claims taken per issue and file, those whose tokens were lost lapse by their 2-hour TTL.',
  'Open with an owner and a closing probe: 100166 (the heartbeat refresh in 4847, then binding-census must pass across the 20:18Z expiry); 1000478 (probe replaced here, clears at the next measure tick); 1000483 (code-probe CONTROL-PROBE-AT-BIRTH-1 on main); 1000459 (re-measure TRIGGER-FLAP-1 pairs on 2026-11-02); 1000029 (probe passes about 2026-10-28T02:10Z); 100279 (clears about 2026-11-01); 100317 (waits for the code loop to land the evModelJson re-ask); 1000470 (code task ct_im1000470, take over if it fails before 2026-10-27T18:00Z); 2722 (learner: 91 rows pending credit, the daily 07:31Z credit run clears 60 a day, then 3 arms reach n=3). Issue 1000473 is the ASK-PLAIN session metric ask_plain_share_7d (UNMEASURED), not this session. The control-alternate drill (last run 13:01Z, every 6 h) is rem-a3-drills.',
  0.52,
  21, 11,
  '2026-10-26T16:25:00Z',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE NOT EXISTS (SELECT 1 FROM session_records WHERE session_id = 'session-old-issues-6d-2038');
