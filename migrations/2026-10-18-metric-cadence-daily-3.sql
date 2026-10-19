-- METRIC-CADENCE-DAILY-3 (2026-10-18, pillar autonomy; five metrics whose producing job declares cadence_h 24)

-- WHAT WAS WRONG
-- Five metrics declared refresh_cadence '2h'. v_metric_staleness_verdict marks STALE when age_hours > cadence_hours * 2,
-- so they went stale at four hours while their producers run once a day. Measured 2026-10-18 15:25Z:
--   outreach_reply_rate_30d        age 9.9h   last 2026-10-18T05:20:36.765Z
--   warm_conversations_30d         age 9.9h   last 2026-10-18T05:20:36.765Z   (same statement, same run)
--   idea_topic_concentration_30d   age 10.9h  last 2026-10-18T04:20:42.922Z
--   dangling_bindings              age 12.3h  last 2026-10-18T03:00:38.773Z
--   paper_render_defect_pages      age 8.8h   last 2026-10-18T06:30:37.261Z

-- THE EVIDENCE (the producer's own job registry in qnfo-fleet-dashboard/deployed-current.worker.js)
-- That worker carries a job array where every entry states what it runs and how often (cadence_h). The entries covering
-- these five metrics all declare cadence_h: 24:
--   outreach-learner            "Cold-email learner: reply outcome per send, Beta posterior per segment, the
--                               under-1%-after-50-sends stop rule, outreach_reply_rate_30d and warm_conversations_30d
--                               daily ... (OUTREACH-LEARNER-1, qnfo-cloud-ops 05:15Z)"  cadence_h: 24
--   idea-topic-metric           (idea_topic_concentration_30d)                            cadence_h: 24
--   dangling-bindings-census    (dangling_bindings)                                        cadence_h: 24
--   paper-render-health         "Every papers.qnfo.org page rendered and checked ... published as
--                               paper_render_defect_pages (RENDER-HEALTH-1, qnfo-gateway 06:00Z,
--                               qnfo-paper-indexer 06:05Z)"                              cadence_h: 24
-- The observed refresh times agree with each description (05:20Z for a 05:15Z job, 06:30Z for a 06:05Z job).

-- WHAT THIS IS NOT
-- No value is touched. Each producer writes last_value and last_refreshed exactly as it did before; this corrects only the
-- promise, the same way METRIC-CADENCE-DAILY-1 (2447) and DAILY-2 (2455) corrected theirs.

-- NOT CHANGED, still open
-- watchmaker_index, public_hosts_broken, signal_source_families_7d, paper_math_browser_fail_pages,
-- social_engagement_rate_30d and process_path_gaps keep their declared cadences. None of them appears in any job entry
-- of the dashboard's registry, so their producers have to be read in qnfo-evolve, qnfo-paper-indexer, qnfo-social,
-- radar-hub or wherever public_hosts_broken is written, before any cadence is moved.

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET refresh_cadence = '2h' WHERE metric IN ('outreach_reply_rate_30d','warm_conversations_30d','idea_topic_concentration_30d','dangling_bindings','paper_render_defect_pages');

UPDATE metric_registry
   SET refresh_cadence = 'daily'
 WHERE metric IN (
         'outreach_reply_rate_30d',
         'warm_conversations_30d',
         'idea_topic_concentration_30d',
         'dangling_bindings',
         'paper_render_defect_pages'
       )
   AND lower(refresh_cadence) <> 'daily';
