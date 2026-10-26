BREACH DOCTOR, ARCHITECTURE FAMILY: MAP OF EXISTING SELF-DIAGNOSING / SELF-REMEDIATING LOOPS
Measured 2026-10-26 05:45-05:58Z against qnfo-audit (35e2e573) and main @ 6031c00e. Line numbers are of the file named.

0. HOW AN ISSUE REACHES A DOER TODAY (the pipeline the doctor must slot into)
   filer (metric trigger / loop / owner / session) -> agent_issues row (open)
   -> three ways to get a "doer" in v_issue_age_ladder (migrations/2026-10-20-deploy-all-merges.sql):
        a) description contains "code-task:"            (ACT-BRIDGE-1 lines; intake + RED-DRAIN-1 step 3 turn it into code_tasks ct_im<id>)
        b) code_tasks.goal LIKE '[issue #id]%' not terminal (planner output, or a)
        c) work_claims row live for issue:<id>           (a session)
      nothing else is a doer: not a remediation contract, not the probe author, not a loop that files and closes (LOOP-OWNED-CONTRACT-MONITORING-1).
   -> the planner (qnfo-code-orchestrator planIssues, 3124-3237) is the ONLY automatic route from a bare issue to (b):
        untrusted source/title  -> record "untrusted", no model call, ignored for PLAN_RECHECK_DAYS (7)   [3181-3185]
        trusted, no worker found -> "not-code: the issue names no worker the code loop may change"          [3205]
        trusted, model says no   -> "not-code: <model reason>"                                             [3225]  (PLAN_SYS 3122: data/config/D1 change, owner decision, multi-file => code_fixable=false)
        trusted, model says yes  -> enqueue one code task on <worker>/worker.js                             [3231]
      Caps: ops_config code_plan_daily_cap 48 model calls/day, code_plan_wip 40, 1 model call per tick (the function returns after the first), 10 cheap decisions per tick, window 40 trusted + 10 untrusted.
   Live 24h: 96 planner decisions (78 not-code, 71 with a model call; 16 untrusted; 2 refused), 0 queued.

1. qnfo-fleet-control (13,541 lines, 1.11 MB, control plane, canary + auto revert; cron "*/10 * * * *" and "0 * * * *"; scheduledOnce 10999)
   The */10 branch (11014-11053) runs, as independent ctx.waitUntil jobs sharing one isolate:
     codeMergeTick 5011 (merge runner), branchHygieneTick 5493 (stale-PR lane), deployDriftCf 6250, workflowFailureIntake 6179,
     slaTick10m 12038 (-> slaEscalate 12020 + evaluateMetricTriggers 12969), remediationContractsTick 11361 (budget 25 s),
     and on the 20-minute grid: researchBackpressureTick, metricRefresher2, journeyTick, pdfBacklogRelay, reassertObservability.
   The hourly branch (11064-11089): pollObservability, refreshOwnedMetrics, loopWatch 7684, chaosDrill 13240, improvementLoopTick 8613,
     objectiveConstraintsTick 8205, transformationTick, performanceLoopTick, portfolioSync, publicationPreflight, workerCensus, ...
   a. evaluateMetricTriggers 12969-13046
      detects: analytics_metric_triggers.enabled=1 whose metric_registry.last_value crosses the threshold.
      does: files ONE deduped issue "METRIC-TRIGGER-<id>-<KEY>: <title>" (source qnfo-fleet-control) whose description is the trigger's STATIC action text
            (+ optional code-task/code-anchor lines); closes it after 60 minutes of recovery (TRIGGER-RECOVERY-1).
      cadence: every 10 min; cooldown <= 120 min.  Does not read why the metric moved. breach_code_task_pct = 8.8 (target >= 30).
      why it leaves the 52 METRIC-TRIGGER breaches: the lever is prose; the planner can act only on a one-file code edit and answers not-code (44) / invalid (2) / nothing (6).
   b. remediationContractsTick 11361-11575 (+ scripts/remediation_consumer.py consume_d1 1124 / consume_one 1182, the GitHub-runner twin)
      detects: remediation_contracts due (LIMIT 150): literal read-only SELECT probes, external-https, d1-query@portfolio-state.
      does: writes remediation_verifications (path A) / remediation_evidence (path B), holds 7 days after a pass, reopens on relapse, supersedes carried-by-twin / wontfix
            contracts, escalates stale deferrals (rtEscalateStaleDeferrals), files PROBE-NEEDED-1 (rtEnsureLivePath 11945).
      it VERIFIES; it does not diagnose or fix. Deferral 'pending: ...' is not a verdict (2,284 remediation.deferred events in 7 days).
   c. rtEnsureLivePath 11945 / rtFileLivePathIssue 11835 / rtAuthorLivePathProbe 11899 (PROBE-AUTHOR-LIVEPATH-1, merged 2026-10-20)
      detects: open issue with no active/holding/monitoring/escalated contract, 60 min after open. Caps 3/tick, 12/day.
      does: files "PROBE-NEEDED-1: issue-<id>" (77 in 7 days) and was meant to author a probe with one cheap model call.
      DEAD: authored 0 probes ever (cloud_ops_events kind remediation.probe-authored = 0; contracts module probe-author-1 = 0; decision_log rows = 0).
        1. call site 11539 `await rtEnsureLivePath(db, out);` passes no env, so env is undefined inside 11906.
        2. 11906 reads env["qnfo-ai"] || env.qnfo_ai; the worker has env.AI (wrangler [ai]) and env.SVC_QNFO_AI (service binding, fetch only); `.run` does not exist on either name.
        3. 11939 INSERT INTO decision_log (ts, decision, reason): the table has actor, assumption, action, evidence, outcome, blast_radius, rollback_path (NOT NULL), so the doctrine log row would fail too.
   d. ISSUE-AGE-24H-1 replan = D1 trigger deploy_merge_age_tick AFTER INSERT ON fleet_tick (migration 2026-10-20-deploy-all-merges.sql)
      detects: open issue > 24 h, doer null, plan not-code/invalid older than 24 h.  does: moves issue_plans.planned_at to 2000-01-01 (<= 12/tick, once a day per issue).
      result: 479 re-arms of 132 issues since 2026-10-20; 1 became queued (0.2%); 466 are still not-code. It re-asks a prompt that can only say "one-file code edit", so it re-rolls a verdict; it adds no information.
      It also rides fleet_tick, which has been dead since 04:32:44Z today (see finding F1).
   e. RED-DRAIN-1 = fleet_tasks id red-drain (v6), fleet_crons red-drain-hourly "35 * * * *", run by fleet-exec (folded in qnfo-code-orchestrator)
      steps: supersede contracts with unusable probes, park metric-condition contracts as monitoring, escalate over-retried contracts, INSERT OR IGNORE code_tasks ct_im<id>
             for issues carrying a code-task line (LIMIT 5, skips CM_DENY paths), red_snapshots, re-arm parked contracts, loop-owned monitoring.
      hygiene of contracts, plus the dispatcher for code-task lines. It never creates a code-task line.
   f. loopWatch 7684 (hourly, LOOP-WATCH-1): charter + portfolio ledgers only; files CHARTER-TICK-STALE-1 etc.  Not a general loop monitor.
      workflowFailureIntake 6179 (10 min): files WORKFLOW-FAILED-1 per red workflow on main with failed job/step, closes on a green run.  One symptom class.
      improvementLoopTick 8613 (hourly): files METRIC-FIX-RELAPSED-1 / METRIC-REGRESSION-1 when a closed fix did not hold or a directional metric worsened >= 15%; the issue says "change the approach".
      objectiveConstraintsTick 8205 (hourly): proposes objective revisions for the owner (goals table); not a remediator.
      chaosDrill 13240: exercises two failure paths (pdf-relay, router-drill); files CHAOS-DRILL-FAILED-1.
      codeMergeTick 5011: merges green code-task PRs inside cmScope 3380; files CODE-MERGE-REFUSED-1 when it refuses (10 open, 9 critical, all "untrusted").
   g. SPECIAL: BREACH-SELFHEAL-1 (migrations/2026-10-26-breach-selfheal.sql, PR 4263, applied 04:42:33Z today): 6 hard-coded checks
      (errata confirm, research stall, publish collapse, budget share, worker error spike) as views + a D1 trigger breach_selfheal_tick AFTER INSERT ON fleet_tick
      that edits ops_config errata_confirm_max and requeues dead research claims.  It is the right idea in the wrong place: one trigger, 10 references to a view
      that macro-expands ~100 correlated subqueries each.  It is the only change on the fleet_tick fan-out since the last good tick.

2. qnfo-cloud-ops (5,632 lines, 407 KB, not control plane; one cron "*/10 * * * *", scheduled 5452)
   Per tick: runEmailOrchMember, tickDue(AMS_SCHEDULE) jobs, jobProbeCadence, jobFleetGraphCadence, jobResearchExecWatchdog 3685 (second trigger path of research-exec),
             jobGhTokenWatch 3776, jobProbeReview 3865.
   a. OWNER-STEPS-WATCH-1 jobOwnerStepsWatch 1059: TWO hard-coded probes (OWNER_STEP_PROBES 1039: ula-v2-1-post, code-release-pypi) that resolve human_actions cards from public URLs.  Daily slot.  Does not generalise.
   b. metric-refresh steps: per-metric writers into metric_registry (jobGhTokenWatch 3776-3797 every tick, jobIdeaTopicMetric 1028, outreach learner metrics 2788-2792, SLA-definition metrics 5106-5107).
      They measure; none diagnoses or remediates, and none is generic.
   c. PROBE-REVIEW-1 jobProbeReview 3865-3934: 2 closing probes per tick judged by gpt-oss-120b / deepseek-v4-flash ("tests-dod | partial | self-confirming"); a self-confirming probe is set to
      status probe-review-refused, which NEITHER executor reads.  PROBE_REVIEW_SELECT (3816-3824) excludes probe-template*, orphan-issue-guard-1, METRIC-TRIGGER-, failure-mode, fm-, belief-,
      but NOT module reopen-live-path: 19 of 55 open PROBE-NEEDED-1 issues have their OWN closing contract refused (16 + 2 + 1); 5 of them have a target that is already closed, so their probe
      would pass, yet they stay open for ever (issue-100492 refused 2026-10-21T22:00Z, still open).  Cross-loop conflict: one loop files a probe that the other refuses.
   d. research-exec watchdog: the model of a second path (RESEARCH-WATCHDOG-1).  Reuse for the doctor.

3. qnfo-code-orchestrator (3,854 lines, 353 KB; cron every minute, SINGLE-FLIGHT-1; control plane, in CM_LOOP_CANARIED)
   a. planIssues (see 0).  planWorkers 2968 picks the first service_registry worker NAME found in the text: service_registry holds a live "worker" named qnfo-workers (the repo),
      so any text containing "repo=qnfo-workers" yields path qnfo-workers/worker.js -> 404 -> "not-code: could not read qnfo-workers/worker.js: raw read HTTP 404"
      (7 open breach issues: 2805, 100524, 100579, 100582, 100594, 100596, 1000015; the filter at 3169-3171 checks the name pattern and PLAN_DENY_WORKERS only).
   b. PLAN_TRUSTED (2919-2936) = ops_config code_merge_trusted_sources: (source|title-prefix) pairs.  Fleet loops with structured provenance are not on it:
      PROBE-NEEDED-1 (43 breach rows), CODE-MERGE-REFUSED-1 (10), TOOL-FAILURE (15 + 5 + 3), CHAOS-DRILL-FAILED-1, FLEET-JOURNEY-FAILED-1, PAPER-LEARN-1, PORTFOLIO-GAP => "untrusted", never read by anything.
   c. intake of code-task lines (ISSUE-INTAKE-1), CODE-LOOP-EXHAUSTED-1 after 3 ended tasks in 3 days (9 unowned), NEEDS-ANCHOR-ROUTE-1 turns a non-unique anchor into a session task (so the doctor must verify anchors).
   d. feedFleetTick 3739: the producer of fleet_tick every 10 minutes (guard: no row in the last 9 minutes), with the OR IGNORE isolated retry (FLEET-TICK-ISOLATE-1).  Handles constraint errors, not memory errors.

4. D1 triggers that file or close issues (all on the shared transaction chain; D1 refuses an INSERT into agent_issues deep in the chain)
   agent_issues_autotriage2_ins, agent_issues_birth_contract_ins (writes issue-<id> contract at birth), agent_issues_open_dup_annotate, agent_issues_reopen_live_path_upd,
   issue_close_evidence_required (ABORT without issue_triage.close_evidence; ABORT when a contract on the issue fails), triage_close_sync_*, remediation_verification_autoclose / reopen_on_relapse,
   53 AFTER INSERT triggers on fleet_tick (queue_sla_tick_10m, deploy_merge_age_tick, doctrine_*_tick, scorecard_v2_tick, breach_selfheal_tick ...), one transaction, no bulkhead.

5. WHAT NONE OF THEM DOES (the gap)
   - no loop maps an unowned breach to a CAUSE from structured facts;
   - no lane exists for a fix that is data / config / contract / ops (the planner has code or not-code; RED-DRAIN only tidies contracts);
   - no loop owns "untrusted but structured" issues (they are recorded and forgotten for 7 days);
   - "doer" is defined by code-loop artefacts only, so a fleet action that is not a code task cannot make an issue owned;
   - metrics that prove health are refreshed by the thing they measure (fleet_tick triggers), so a dead heartbeat is invisible: tick_completion_24h reads 99.3 from its last refresh at 04:32Z.
