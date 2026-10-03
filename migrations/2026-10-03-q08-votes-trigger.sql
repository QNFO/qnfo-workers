-- Q08-VOTES-TRIGGER-1 (2026-10-03, pillar: reach). Replaces the EXEMPTION on q08_verified_votes_7d (migrations/2026-10-02-q08-metrics.sql)
-- with a trigger. Applied live against qnfo-audit by the session that wrote it, statement by statement, 2026-10-03; idempotent
-- (each statement is guarded, so re-running it is a no-op). Previous registry values, kept here as the backup:
--   target 'report only', warning_band NULL, kill_band NULL, disposition_actor 'report only (EXEMPT in migrations/2026-10-02-q08-metrics.sql)'.
--
-- Why the exemption was wrong. It said the reader-verdict loop (feedbackScan) "already acts on" the votes. Read live on 2026-10-03:
--   * feedbackScan promotes or purges a piece only with 3 or more valid votes on that piece and 4 or more pool entries. Valid
--     votes count from 2026-10-03T00:00Z (the earlier 2,519 were crawler-era noise: 845 flat, 810 good, 864 no). Since the cutoff
--     there was 1 vote (flat) in 7.5 hours, so no piece can reach 3 and the loop cannot act. A loop that cannot fire raised no
--     breach, because the metric was report-only.
--   * q08_human_reads_7d = 106 (UA-filtered, so probably an overcount) against about 1 valid vote: the form converts at roughly
--     1% or less. The code shows a likely cause: the three vote buttons are plain form posts to POST /api/f, which answers with
--     raw JSON, so a visitor who votes lands on a JSON page with no confirmation and no way back. That is inferred from the code, not measured.
--
-- Threshold: lt 5 votes in 7 days, about 5% of the 106 human reads and of the 50-read review bar. It is a judgement, not a measurement:
-- change it with evidence after the first full week (votes count from 2026-10-03, so the 7d window is partial until 2026-10-10).
-- The lever is one edit in q08-signal-engine/worker.js; the anchor below occurs exactly once on main and is stable across PR 552
-- (the note field), which edits the lines after it.

UPDATE metric_registry
   SET target = '>= 5 (a vote on about 5% of human reads; judgement set 2026-10-03, revisit after 2026-10-10)',
       warning_band = '< 5',
       kill_band = '< 1',
       disposition_actor = 'analytics_metric_triggers q08_verified_votes_7d (Q08-VOTES-TRIGGER-1 replaced the exemption)'
 WHERE metric = 'q08_verified_votes_7d' AND target = 'report only';

WITH v(metric_key, title, operator, threshold, priority, action, cooldown) AS (VALUES
  ('q08_verified_votes_7d', 'q08 gets under 5 reader votes a week, so the verdict loop cannot act', 'lt', 5, 6,
   'Pillar reach. feedbackScan needs 3 valid votes on a piece to promote or purge it; with this few votes it never acts, and the metric was report-only until Q08-VOTES-TRIGGER-1. Evidence on 2026-10-03: 106 human reads in 7 days against about 1 valid vote. Likely cause: a vote is a plain form post to POST /api/f that answers with raw JSON, so the visitor lands on a JSON page with no confirmation and no way back. Edit in q08-signal-engine/worker.js: in the POST /api/f handler, when the request is a browser form post (Content-Type contains form and Accept contains text/html), answer 303 to /p/<slug>?voted=<good|flat|no>, and have the piece page show "Thanks, your verdict is recorded." in place of the vote buttons when that query value is present; keep the JSON answer for any other client, keep the one-vote-per-visitor rule, the crawler check and the rate limit unchanged, and never write a vote from a GET. Do not feed vote notes or text into any prompt. Before editing, re-read main and open PRs for q08-signal-engine/worker.js (PR 552 adds an optional note field to the same form and handler; build on it, do not duplicate it). If votes are still under 5 a week after the redirect has been live for 7 days, say so on the issue and try a different lever (for example moving the vote buttons above the references) instead of repeating this one. Definition of done: q08_verified_votes_7d is at or above 5 in metric_registry; record the before and after values in issue_triage.close_evidence.' || char(10) || 'code-task: repo=qnfo-workers path=q08-signal-engine/worker.js' || char(10) || 'code-anchor: if (path === "/api/f") {', 168)
)
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, 'registry', v.operator, v.threshold, v.priority, v.action, 'q08-signal-engine', 'agent_issues', v.cooldown, 1, 'Q08-VOTES-TRIGGER-1 2026-10-03'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);
