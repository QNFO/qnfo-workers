-- JOBSEARCH-OUTCOME-1 (2026-10-27, charter pillar reach; OUTPUT-QUALITY-LEDGER-1): the outcome measure for qnfo-jobsearch. Whether the matching helps is read from what happens after
-- the owner applies: replies, interviews and offers per application, from an append-only event log. Three metrics (one with a trigger, two with named exemptions) and the
-- output_quality_measures row. The worker also creates jobsearch_events on first use, so deploy order does not matter.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS jobsearch_events; UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key = 'jobsearch_reply_rate_90d'; UPDATE metric_registry SET state = 'RETIRED' WHERE metric IN ('jobsearch_reply_rate_90d', 'jobsearch_interview_rate_90d', 'jobsearch_applied_30d');
CREATE TABLE IF NOT EXISTS jobsearch_events (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, event TEXT NOT NULL, ts TEXT NOT NULL, note TEXT);
CREATE INDEX IF NOT EXISTS idx_jobsearch_events_match ON jobsearch_events (match_id, ts);

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('jobsearch_reply_rate_90d', 'surface', 'lagging',
  'of the applications marked applied 21 to 90 days ago, the share that reached a reply, interview or offer; unknown (not written) under 10 such applications',
  'qnfo-audit.jobsearch_events, written by qnfo-jobsearch 1.2.0 on every hourly run',
  'new 2026-10-27; reference 0.06 (Business Insider test of LazyApply: 6 percent of 126 untailored applications; vendor figures for tailored applications are higher and self-reported)',
  '>= 0.06', 'qnfo-jobsearch', 'qnfo-jobsearch hourly cron (JOBSEARCH-OUTCOME-1); trigger jobsearch_reply_rate_90d', 'hourly', '< 0.06', '< 0.03', 'UNMEASURED', 'fast'),
 ('jobsearch_interview_rate_90d', 'surface', 'lagging',
  'of the applications marked applied 21 to 90 days ago, the share that reached an interview or offer; unknown (not written) under 10 such applications',
  'qnfo-audit.jobsearch_events, written by qnfo-jobsearch 1.2.0 on every hourly run',
  'new 2026-10-27; reference 0.03 to 0.04 (vendor-reported interview rate for per-role tailoring, self-reported)',
  '>= 0.02', 'qnfo-jobsearch', 'exempt: a lower stage of the same applications, carried by jobsearch_reply_rate_90d (JOBSEARCH-OUTCOME-1)', 'hourly', '< 0.02', NULL, 'UNMEASURED', 'fast'),
 ('jobsearch_applied_30d', 'reach', 'leading',
  'count of applications the owner marked applied in the last 30 days (qnfo-audit.jobsearch_events, event applied)',
  'qnfo-audit.jobsearch_events, written by qnfo-jobsearch 1.2.0 on every hourly run',
  'new 2026-10-27', '>= 4', 'qnfo-jobsearch', 'exempt: owner activity, informational; the number of applications the owner chose to make cannot be remedied by the fleet (JOBSEARCH-OUTCOME-1)', 'hourly', '< 4', NULL, 'UNMEASURED', 'fast');

INSERT OR IGNORE INTO output_quality_measures (metric, surface, role, polarity, tol_rel, tol_abs, judged_by, caveat) VALUES
 ('jobsearch_reply_rate_90d', 'job applications', 'outcome', 1, 0.3, 0.03,
  'a recruiter or hiring team answers an application the owner sent from a qnfo-jobsearch draft (jobsearch_events: replied, interview, offer), counted for applications 21 to 90 days old',
  'small numbers: under 10 mature applications it is unknown and nothing is written; replies depend on the market and on the owner, not only on the match; the claim verifier is a proxy for accuracy and is not counted here');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'jobsearch_reply_rate_90d', 'Job search: reply rate of mature applications under 3 percent', 'meta', 'lt', 0.03, 5,
 'Pillar reach. Read GET https://qnfo-jobsearch.q08.workers.dev/api/outcomes: reply_rate_by_tier and the funnel by tier show whether higher scores reply more. If tier A does not reply more than tier B, the score weights in evaluate() do not predict replies: compare the evidence clusters and title matches of replied matches with those of the rest (jobsearch_events joined to jobsearch_matches.why_json) and move weight toward what replied, keeping every gate and the claim verifier unchanged. Never loosen the verifier to raise the rate. Definition of done: the metric is back at 0.03 or above at the next hourly run, or the weights carry a note of what the replies showed. This trigger fires only with 10 or more applications aged 21 to 90 days.' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-jobsearch/worker.js' || char(10) ||
 'code-anchor: const eScore = Math.min(45, 9 * cl.size);',
 'qnfo-jobsearch', 'agent_issues', 24, 1, 'JOBSEARCH-OUTCOME-1 2026-10-27'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'jobsearch_reply_rate_90d' AND x.enabled = 1);
