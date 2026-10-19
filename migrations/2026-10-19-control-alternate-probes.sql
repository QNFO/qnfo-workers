-- CONTROL-ALT-PROBES-1 (2026-10-19, pillar autonomy; agent_issues 2826 PATHS-UNTESTED-1 and 2880 controls_on_critical_path_untested;
-- doctrine sections 10-11, chaos verification; the design is docs/handoff/2026-10-19-closeout.md, control-alternates-never-drilled).
-- A control that declares an alternate path is only as safe as the last time that alternate ran, and control_registry.alternate_tested_at
-- had no writer except a session typing a date. CHAOS-DRILL-1 (migration 2026-10-12-39) fixed this for the single points of failure
-- (spof_alternate_probes, re-run every 6 h by qnfo-fleet-control chaosDrill) and never reached the controls. Measured 2026-10-19T13:00Z:
-- control_registry 75 rows, all with an alternate_path, 18 with alternate_tested_at NULL (v_path_coverage_violations alternate-untested 18,
-- of which 3 carry the recorded reason ALTERNATE-NOT-EXERCISABLE). The 7 critical controls that controls_on_critical_path_untested counted
-- were stamped by hand at 12:55Z (7 to 0), so the metric is green on dates nothing will ever re-check.
-- Re-measured 2026-10-19T14:5xZ before landing (package LA): control_registry 91 rows, 29 alternate-untested, and controls_on_critical_path_untested reads 4 again:
-- four critical controls were registered after the hand stamps (claim-integrity-gate, research-floor-extend, research-revise-shrink-guard, research-width-governor).
-- The probes of the 11 controls registered since 13:00Z are in migrations/2026-10-19-control-alternate-probes2.sql (the 4 above, code_reasoning_low,
-- loop_breaker_tool_exclusions, research-floor-rearm, research-kimi-last-resort and the loop-owned-contract-park control of LOOP-OWNED-CONTRACT-MONITORING-1). Three
-- (model_floor_pr_check: a CI workflow, research-model-skip-gauge: an isolate's memory, research-fallback-price-guard: a code constant) have alternates no D1 read can
-- observe, so they stay without a probe rather than get a decorative one; the detector at the end of this file therefore reads 3 at birth (and falls as an
-- exerciser is written for each), which is the honest state, not a defect of the file.
--
-- This file gives every exercisable control a drilled alternate in the same shape as CHAOS-DRILL-1:
--   * control_alternate_probes: one read-only expected/observed probe per control (the chaosJudge shape: expected 'ok', observed 'ok' or
--     the reason the alternate is not proven), the 7 critical controls first, then the other exercisable controls, then the probe set's
--     own control. A probe reads the alternate's own evidence (a trigger in sqlite_master, a config lever, a ledger row, an event within
--     the window in window_note). Nothing is stamped from a declaration. Live read-only runs on 2026-10-19: 22 of 22 control probes pass.
--   * v_control_alternate_status and v_control_alternate_untested: the per-control drill state (a pass older than 480 minutes, the drill's 6 h cadence
--     plus the 120 minutes SLA-120M-1 allows, reads probe-stale) and the counts, so the metric behind 2880 is
--     computable from this table (critical_untested_by_probe next to critical_untested_by_register, which is the v_doctrine_scorecard_v2
--     expression). The scorecard and metric_registry definitions are not touched.
--   * v_path_coverage_gaps reads a row whose alternate is 'none needed' and whose evidence records ALTERNATE-NOT-EXERCISABLE as the distinct
--     state 'alternate-not-exercisable' (reason on the row), and v_path_coverage_violations lists it no more. The 3 rows (research-owner-hold,
--     command-drain-key, outreach-consent-gate) protect people outside the fleet or have no bypass route, so no probe can exercise them.
--   * failure mode control-alternate-undrilled with its fm- detector contract, a control_registry row for the probe set, evidence on
--     the 22 controls it drills, a decision_log row.
-- The runner is NOT in this file: chaosDrill reads only spof_alternate_probes (qnfo-fleet-control 0.37.0, CHAOS-DRILL-1 block) and cannot
-- read a second table without a worker change, so the second pass is filed below as CONTROL-ALT-PROBES-RUNNER-1 with a code-task line and a
-- code-probe that closes it when the code reading this table is on main. Until it lands, last_run_at stays NULL and no control is stamped by
-- this table; the existing hand-written stamps are unchanged.
-- The agent-issues-enum-guard probe exempts a 'monitoring' row that has an open twin: that status is the deliberate parked-twin state, it is
-- not in status_canon, and agent_issues_reopen_open_twin_guard refuses the tick's rewrite to open on purpose (METRIC-TRIGGER-TWIN-1).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: control_registry
-- Rollback: DROP VIEW IF EXISTS v_control_alternate_untested; DROP VIEW IF EXISTS v_control_alternate_status; DROP TABLE IF EXISTS control_alternate_probes; UPDATE control_registry SET evidence = replace(evidence, ' | CONTROL-ALT-PROBES-1 2026-10-19: probed by its control_alternate_probes row, which the chaos drill runs once CONTROL-ALT-PROBES-RUNNER-1 lands, and only a passing probe stamps alternate_tested_at', '') WHERE evidence LIKE '%CONTROL-ALT-PROBES-1 2026-10-19%'; DELETE FROM control_registry WHERE control = 'control-alternate-probes'; DELETE FROM remediation_contracts WHERE class = 'fm-control-alternate-undrilled'; DELETE FROM failure_modes WHERE fm_key = 'control-alternate-undrilled'; DROP VIEW IF EXISTS v_path_coverage_violations; DROP VIEW IF EXISTS v_path_coverage_gaps; CREATE VIEW v_path_coverage_gaps AS SELECT 'control_registry' AS source, control AS process, kind AS path_kind, CASE WHEN alternate_path IS NULL OR trim(alternate_path) = '' THEN 'no-alternate' WHEN alternate_tested_at IS NULL THEN 'alternate-untested' ELSE 'ok' END AS path_state, alternate_path AS alternate, alternate_tested_at FROM control_registry UNION ALL SELECT 'process_contracts' AS source, process, 'contract-paths' AS path_kind, CASE WHEN json_valid(paths_json) = 0 THEN 'paths-not-json' WHEN json_array_length(paths_json) < 2 THEN 'single-path' WHEN json_array_length(paths_json) = 2 THEN 'two-paths-no-spare' ELSE 'ok' END AS path_state, NULL AS alternate, NULL AS alternate_tested_at FROM process_contracts; CREATE VIEW v_path_coverage_violations AS SELECT source, process, path_kind, path_state, alternate, alternate_tested_at FROM v_path_coverage_gaps WHERE path_state <> 'ok'
-- Rollback note: the decision_log row stays (append-only) and the CONTROL-ALT-PROBES-RUNNER-1 issue stays open until its code-probe or a closing record resolves it.

CREATE TABLE IF NOT EXISTS control_alternate_probes (
  control TEXT PRIMARY KEY,
  probe_sql TEXT NOT NULL,
  window_note TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_pass INTEGER,
  last_pass_at TEXT,
  last_observed TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES
 ('agent-issues-enum-guard',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''agent_issues_normalise_tick'' AND tbl_name = ''fleet_tick'' AND sql LIKE ''%status_canon%'' AND sql LIKE ''%priority_canon%'' AND sql LIKE ''%NO-SILENT%'') THEN ''the normalise tick trigger agent_issues_normalise_tick is missing or no longer reads the canon tables'' WHEN (SELECT COUNT(*) FROM status_canon) = 0 OR (SELECT COUNT(*) FROM priority_canon) = 0 THEN ''status_canon or priority_canon is empty, so the tick cannot map a status'' WHEN EXISTS (SELECT 1 FROM agent_issues a WHERE ((a.status IS NOT NULL AND NOT EXISTS (SELECT 1 FROM status_canon s WHERE s.raw_value = a.status) AND NOT (a.status = ''monitoring'' AND EXISTS (SELECT 1 FROM agent_issues o WHERE o.id <> a.id AND o.status = ''open'' AND lower(trim(o.title)) = lower(trim(a.title))))) OR (a.priority IS NOT NULL AND NOT EXISTS (SELECT 1 FROM priority_canon p WHERE p.raw_value = a.priority))) AND typeof(a.updated_at) = ''integer'' AND a.updated_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 1800) * 1000) THEN ''an agent_issues row kept a status or priority that the canon tables do not map for over 30 minutes, so the tick did not normalise it'' ELSE ''ok'' END AS observed',
  '30 min: the tick runs every 5-10 minutes and a row still unmapped after 30 minutes was not normalised (state probe on the trigger text, the canon vocabulary and the rows). A monitoring row with an open twin is the deliberate parked-twin state: it is not in status_canon and the twin guard refuses the rewrite to open', 1),
 ('agent-issues-evidence-guard',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''agent_issues_evidence_annotate_ai'' AND tbl_name = ''agent_issues'' AND sql LIKE ''%NO-SILENT%'') THEN ''the annotate trigger agent_issues_evidence_annotate_ai is missing'' WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''agent_issues_evidence_must_exist_ins'') THEN ''the abort trigger agent_issues_evidence_must_exist_ins is back, so an issue that cites a missing event would be lost'' WHEN EXISTS (SELECT 1 FROM agent_issues a WHERE a.source LIKE ''cloud_ops_events:%'' AND typeof(a.created_at) = ''integer'' AND a.created_at > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 1209600) * 1000 AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.id = substr(a.source, 18)) AND COALESCE(a.description, '''') NOT LIKE ''%the cited evidence event%'') THEN ''an issue of the last 14 days cites a missing event and carries no annotation'' ELSE ''ok'' END AS observed',
  '14 days: the trigger text from sqlite_master plus the issues it should have annotated; a production row that needed it is rare, so the replay lives in migrations/control-alternate-probes.test.mjs', 1),
 ('idea-triaged-hold-owner-and-reentry',
  'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM idea_proposals WHERE (name LIKE ''owner%'' OR name LIKE ''rowan%'' OR name = ''chat-session'' OR contact = ''owner'' OR contact LIKE ''rowan%'') AND name <> ''owner-corpus'' AND name NOT LIKE ''intake:%'' AND status IN (''triaged_hold'', ''rejected'') AND COALESCE(rationale, '''') NOT LIKE ''%withdrawn by owner%'' AND created_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 days'')) THEN ''an owner-authored idea of the last 30 days was held or rejected'' WHEN NOT EXISTS (SELECT 1 FROM signals WHERE source = ''artifact_reentry'' AND status = ''consumed'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) THEN ''no re-entry signal was consumed in 7 days, so re-entry is not flowing as a rate'' ELSE ''ok'' END AS observed',
  '30 days for owner ideas (rare; an idea the owner withdrew is not counted), 7 days for re-entry (idea-hub 1.8.0 admits 2 a day); the replacement tests are idea-hub/owner-admission-bypass.test.mjs and idea-hub/reentry-drain.test.mjs', 1),
 ('research-citation-unverified-hold',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''research_hold_expiry_tick'' AND tbl_name = ''fleet_tick'' AND sql LIKE ''%360 minutes%'') THEN ''the 6 h hold-expiry trigger research_hold_expiry_tick is missing or its window changed'' WHEN COALESCE((SELECT value FROM ops_config WHERE key = ''research_citation_gate''), ''enforce'') NOT IN (''enforce'', ''measure'') THEN ''ops_config research_citation_gate holds a value other than enforce or measure'' WHEN EXISTS (SELECT 1 FROM research_queue q JOIN research_hold_seen h ON h.id = q.id WHERE q.status = ''held'' AND instr(COALESCE(q.error, ''''), ''Revert: status review, stage publish'') > 0 AND h.first_seen < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-480 minutes'')) THEN ''a held research row with a revert line passed 8 h without release (the expiry is 6 h)'' ELSE ''ok'' END AS observed',
  'state probe: the release trigger, the measure lever and no hold past 8 h; the citation lookups themselves are pinned by qnfo-research-exec/citation-gate-step.test.mjs', 1),
 ('research-gate-structure',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''revise-patch'' AND status IN (''ok'', ''warn'') AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) THEN ''the revise route recorded no revise-patch event in 7 days, so a failing first pass has no live route'' ELSE ''ok'' END AS observed',
  '7 days: event-driven path (the drill cannot manufacture a failing paper); the structure rules are pinned by qnfo-research-exec/verify-precision.test.mjs', 1),
 ('research-review-hard-gate',
  'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = ''research_review_gate''), '''') NOT IN (''enforce'', ''measure'') THEN ''ops_config research_review_gate is neither enforce nor measure, so the reversible lever is unreadable'' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''review-triage'' AND status = ''ok'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-48 hours'')) THEN ''no ok review-triage event in 48 h, so a withheld row has no recover loop'' ELSE ''ok'' END AS observed',
  '48 h: the review triage loop runs every tick; the gate behaviour is pinned by qnfo-research-exec/verify-precision.test.mjs', 1),
 ('zenodo-enabled',
  'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM ops_config WHERE key LIKE ''%zenodo%'' AND lower(COALESCE(value, '''')) IN (''1'', ''on'', ''true'', ''enabled'', ''enforce'')) OR EXISTS (SELECT 1 FROM pipeline_flags WHERE key LIKE ''%zenodo%'' AND lower(COALESCE(value, '''')) IN (''1'', ''on'', ''true'', ''enabled'')) THEN ''a Zenodo switch is on again, so the in-house path is no longer the only one'' WHEN NOT EXISTS (SELECT 1 FROM research_queue WHERE status = ''published'' AND published_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-48 hours'')) THEN ''no paper reached published in 48 h through the in-house path'' WHEN EXISTS (SELECT 1 FROM research_queue WHERE status = ''published'' AND published_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-48 hours'') AND doi LIKE ''10.5281/%'') THEN ''a paper published in 48 h carries a Zenodo DOI'' ELSE ''ok'' END AS observed',
  '48 h: in-house publication and identifiers are the alternate (INHOUSE-PUBLISH-1 landed); the switch stays off', 1),
 ('social-weekly-caps',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT value FROM pipeline_flags WHERE key = ''social_channel_caps'') IS NULL OR json_valid((SELECT value FROM pipeline_flags WHERE key = ''social_channel_caps'')) = 0 THEN ''pipeline_flags social_channel_caps is missing or not JSON'' WHEN COALESCE((SELECT MIN(gap_min) FROM (SELECT (julianday(substr(published_at, 1, 19)) - julianday(LAG(substr(published_at, 1, 19)) OVER (PARTITION BY platform ORDER BY published_at))) * 1440 AS gap_min FROM social_media_posts WHERE status = ''published'' AND platform <> ''buffer-substack'' AND published_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days''))), 99999) < 360 THEN ''two posts on one channel landed under 6 h apart, so the spacing that stands in for the cap is not holding'' ELSE ''ok'' END AS observed',
  '7 days: the spacing between consecutive published posts per channel (Substack Notes roll-ups excluded); the cap itself is read from pipeline_flags', 1),
 ('cf-obs-nested-too-deep-pin',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-trigger-depth-compile'' AND status = ''active'') THEN ''the fm-trigger-depth-compile detector contract is missing or not active'' WHEN COALESCE((SELECT last_verdict FROM remediation_contracts WHERE class = ''fm-trigger-depth-compile''), '''') <> ''pass'' THEN ''the fm-trigger-depth-compile detector does not read pass'' ELSE ''ok'' END AS observed',
  'the contract runs hourly; its latest verdict is the evidence the rule''s alternate (a recurrence re-activates the group) is not hiding a depth fault', 1),
 ('compat-advance-review-gate',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM deployment_history WHERE action = ''deploy'' AND status = ''success'' AND deployed_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''no successful deploy in 24 h, so the gate may be withholding more than the date change'' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''compat-verify'' AND status = ''ok'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) THEN ''no ok compat-verify event in 7 days'' ELSE ''ok'' END AS observed',
  '24 h for deploys (the gate withholds only the date, never the upload), 7 days for the compat verifier; qnfo-ops/compat-date-apply.test.mjs pins each branch', 1),
 ('gh_app_primary',
  'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = ''gh_app_primary''), '''') NOT IN (''on'', ''off'') THEN ''ops_config gh_app_primary is neither on nor off, so the kill switch is unreadable'' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''github'' AND status = ''ok'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''no ok github event in 24 h, so neither the app token nor the personal fallback is carrying calls'' ELSE ''ok'' END AS observed',
  '24 h: GitHub writes keep succeeding with the switch readable; the per-request fallback is pinned by qnfo-fleet-control/gh-app-broker.test.mjs', 1),
 ('improvement-loop-superseded-marker',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM analytics_metric_triggers WHERE metric_key IN (''issues_open_over_120m'', ''open_issues_without_doer_120m'') AND enabled = 1) < 2 THEN ''a successor metric of a superseded one has no enabled trigger'' WHEN (SELECT COUNT(*) FROM metric_registry WHERE metric IN (''issues_open_over_120m'', ''open_issues_without_doer_120m'')) < 2 THEN ''a successor metric is not in metric_registry'' ELSE ''ok'' END AS observed',
  'state probe: the successors named in the control (issues_open_over_120m and open_issues_without_doer_120m) stay registered with an enabled trigger', 1),
 ('migration-header-guard',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-migration-headerless-silent-skip'' AND status = ''active'') THEN ''the fm-migration-headerless-silent-skip detector contract is missing or not active'' WHEN NOT EXISTS (SELECT 1 FROM migration_runs WHERE status = ''ok'' AND applied_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) THEN ''no migration run applied in 7 days'' WHEN COALESCE((SELECT last_refreshed FROM metric_registry WHERE metric = ''migrations_unapplied''), '''') < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'') THEN ''the migrations_unapplied sweep metric was not refreshed in 3 h'' ELSE ''ok'' END AS observed',
  '7 days for applied runs, 3 h for the unapplied-sweep metric; scripts/apply_migrations_test.py pins the header guard itself', 1),
 ('migration-headerless-allowlist',
  'SELECT ''ok'' AS expected, CASE WHEN date(''now'') > ''2026-11-19'' THEN ''the allowlist passed its stated expiry 2026-11-19 and is still in use'' WHEN NOT EXISTS (SELECT 1 FROM migration_runs WHERE status = ''ok'' AND applied_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) THEN ''no migration run applied in 7 days, so a headered file is not being picked up'' ELSE ''ok'' END AS observed',
  'asserts the stated reason of ''none needed'': the runner is alive and the grandfather clause is inside its recorded expiry (2026-11-19)', 1),
 ('ops-jobs-payload-redaction',
  'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM ops_jobs WHERE payload LIKE ''%magic-link%'' OR payload LIKE ''%magic_link%'' OR payload LIKE ''%/login%token=%'' OR payload LIKE ''%/verify%token=%'' OR payload LIKE ''%/reset%token=%'' OR payload LIKE ''%verification code%'' OR payload LIKE ''%one-time code%'' OR payload LIKE ''%login code%'') THEN ''a stored ops_jobs payload still holds a login link or a one-time code'' WHEN EXISTS (SELECT 1 FROM ops_jobs WHERE status IN (''succeeded'', ''failed'', ''terminated'', ''cancelled'') AND updated_at < strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-15 days'')) THEN ''a terminal ops_jobs row is older than 15 days, so the 14-day sweep is not running'' ELSE ''ok'' END AS observed',
  'state probe on the stored payloads and the 14-day sweep that bounds what a user-typed link can keep', 1),
 ('ops-jobs-terminal-sweep',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM queue_sla WHERE stuck_type = ''ops-job-terminal-retained'') THEN ''the queue_sla row ops-job-terminal-retained is missing'' WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-ops-jobs-sweep-status-gap'' AND status = ''active'') THEN ''the fm-ops-jobs-sweep-status-gap contract is missing or not active'' WHEN COALESCE((SELECT last_verdict FROM remediation_contracts WHERE class = ''fm-ops-jobs-sweep-status-gap''), '''') <> ''pass'' THEN ''the fm-ops-jobs-sweep-status-gap contract does not read pass'' ELSE ''ok'' END AS observed',
  'asserts the stated reason of ''none needed'': the sweep''s failure is measured by queue_sla and the detector contract', 1),
 ('owner-request-receipt-gate',
  'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = ''autonomy_first_gate''), '''') NOT IN (''on'', ''off'') THEN ''ops_config autonomy_first_gate is neither on nor off, so the off lever is unreadable'' WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''view'' AND name = ''v_human_action_gate'' AND sql LIKE ''%receipt%'') THEN ''v_human_action_gate no longer carries the receipt branch'' ELSE ''ok'' END AS observed',
  'state probe: the lever the control names (autonomy_first_gate) and the view branch it can switch off', 1),
 ('owner-request-requires-card',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''owner_request_requires_card'' AND tbl_name = ''agent_issues'') THEN ''the owner_request_requires_card trigger is missing'' WHEN NOT EXISTS (SELECT 1 FROM issue_lifecycle WHERE event = ''dispositioned'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) THEN ''issue_lifecycle recorded no closure in 7 days, so the second record of a closure is silent'' WHEN EXISTS (SELECT 1 FROM agent_issues a WHERE a.category = ''owner-request'' AND a.status IN (''closed'', ''resolved'', ''wontfix'') AND typeof(a.updated_at) = ''integer'' AND a.updated_at > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 604800) * 1000 AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND trim(t.close_evidence) <> '''')) THEN ''an owner-request issue closed in 7 days has no close_evidence'' ELSE ''ok'' END AS observed',
  '7 days: the alternate record of a closure (issue_lifecycle and issue_triage.close_evidence) does not depend on the trigger', 1),
 ('perf-loop-enabled',
  'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = ''perf_loop_enabled''), '''') <> ''1'' THEN ''the perf loop is paused again (perf_loop_enabled is not 1)'' WHEN NOT EXISTS (SELECT 1 FROM ops_config WHERE key = ''perf_pin:q08-cadence'') OR NOT EXISTS (SELECT 1 FROM ops_config WHERE key = ''q08_max_per_day'') THEN ''the q08 cadence pin or the cap it protects is missing, so the loop could search the owners cap'' ELSE ''ok'' END AS observed',
  'state probe: the loop runs again behind PERF-PIN-1, which is the alternate to the old pause', 1),
 ('research-admission-cap',
  'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM idea_proposals WHERE rationale LIKE ''[research admission cap%'' AND status NOT IN (''triaged_hold'', ''triaged_accepted'', ''ensemble-registered'')) THEN ''an admission-cap row left the hold without being re-queued (it was rejected or lost)'' WHEN NOT EXISTS (SELECT 1 FROM idea_proposals WHERE triaged_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''idea triage recorded nothing in 24 h, so held cap rows are not being re-queued'' ELSE ''ok'' END AS observed',
  '24 h: triage runs every cycle and re-queues held cap rows oldest first; idea-hub/owner-admission-bypass.test.mjs pins the owner bypass', 1),
 ('tool_error_exclusions',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''view'' AND name = ''tool_failures_excluded_24h'') THEN ''the tool_failures_excluded_24h view is missing, so excluded errors are no longer listed'' WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''view'' AND name = ''tool_failures_24h'' AND sql LIKE ''%failure_class%'') THEN ''tool_failures_24h no longer carries failure_class'' WHEN EXISTS (SELECT 1 FROM tool_error_exclusions WHERE rationale IS NULL OR trim(rationale) = '''') THEN ''an exclusion pattern has no rationale'' ELSE ''ok'' END AS observed',
  'state probe: every excluded error stays listed with its class and every pattern keeps its rationale', 1),
 ('tracker-mass-flip-guard',
  'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT updated_at FROM tracker_sync_state WHERE k = ''last_run''), '''') < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 hours'') THEN ''the tracker sync recorded no run in 2 h'' WHEN NOT EXISTS (SELECT 1 FROM gh_issue_links WHERE d1_status IS NOT NULL AND synced_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''no gh_issue_links row refreshed its d1_status in 24 h, so a mass flip cannot be explained'' ELSE ''ok'' END AS observed',
  '2 h for the sync run, 24 h for the d1_status refresh the guard reads to tell a D1 burst from drift', 1),
 ('control-alternate-probes',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-control-alternate-undrilled'' AND status = ''active'') THEN ''the fm-control-alternate-undrilled detector contract is missing or not active'' WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''view'' AND name = ''v_control_alternate_untested'') THEN ''v_control_alternate_untested is missing'' WHEN COALESCE((SELECT controls_untested_without_probe FROM v_control_alternate_untested), 1) > 0 THEN ''a control with an alternate has no probe and no tested date'' ELSE ''ok'' END AS observed',
  'the detector contract runs hourly from the remediation consumer and needs no worker: it is the alternate to the chaos drills second pass', 1);

UPDATE control_registry SET evidence = evidence || ' | CONTROL-ALT-PROBES-1 2026-10-19: probed by its control_alternate_probes row, which the chaos drill runs once CONTROL-ALT-PROBES-RUNNER-1 lands, and only a passing probe stamps alternate_tested_at'
WHERE control IN (SELECT control FROM control_alternate_probes) AND evidence NOT LIKE '%CONTROL-ALT-PROBES-1 2026-10-19%';

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('control-alternate-probes', 'qnfo-audit.control_alternate_probes (read by v_control_alternate_status and v_control_alternate_untested, run by the qnfo-fleet-control chaos drill once CONTROL-ALT-PROBES-RUNNER-1 lands)', 'guard',
  'a control alternate path declared tested once by hand that nothing re-runs, so its alternate_tested_at decays unseen', 0, 'keep', 'applied',
  'the fm-control-alternate-undrilled detector contract and the v_control_alternate_untested view read the table without the worker, and any probe_sql can be run by hand as a SELECT',
  NULL, 'CONTROL-ALT-PROBES-1 2026-10-19: 23 read-only probes, 22 live read-only runs passed on 2026-10-19 and the 23rd (this row) needs the objects this file creates. Not stamped: the chaos drill stamps it on its first passing run (CONTROL-ALT-PROBES-RUNNER-1).', 2826);

CREATE VIEW IF NOT EXISTS v_control_alternate_status AS
SELECT c.control AS control, c.critical_path AS critical_path, c.disposition AS disposition, c.disposition_state AS disposition_state,
  c.alternate_path AS alternate_path, c.alternate_tested_at AS alternate_tested_at,
  p.enabled AS probe_enabled, p.last_run_at AS last_run_at, p.last_pass AS last_pass, p.last_pass_at AS last_pass_at, p.last_observed AS last_observed,
  p.window_note AS window_note,
  CASE
    WHEN c.alternate_path IS NULL OR trim(c.alternate_path) = '' THEN 'no-alternate'
    WHEN c.disposition = 'remove' AND c.disposition_state = 'applied' THEN 'removed'
    WHEN p.control IS NULL AND lower(trim(c.alternate_path)) LIKE 'none needed%' AND c.evidence LIKE '%ALTERNATE-NOT-EXERCISABLE%' THEN 'not-exercisable'
    WHEN p.control IS NULL THEN 'no-probe'
    WHEN p.enabled <> 1 THEN 'probe-disabled'
    WHEN p.last_run_at IS NULL THEN 'probe-never-run'
    WHEN p.last_pass IS NOT 1 THEN 'probe-failing'
    WHEN p.last_pass_at IS NULL OR p.last_pass_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-480 minutes') THEN 'probe-stale'
    ELSE 'drilled'
  END AS drill_state
FROM control_registry c LEFT JOIN control_alternate_probes p ON p.control = c.control;

CREATE VIEW IF NOT EXISTS v_control_alternate_untested AS
SELECT
  (SELECT COUNT(*) FROM control_registry WHERE critical_path = 1 AND NOT (disposition = 'remove' AND disposition_state = 'applied') AND alternate_tested_at IS NULL) AS critical_untested_by_register,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state NOT IN ('no-alternate', 'removed', 'not-exercisable', 'drilled')) AS critical_untested_by_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state IN ('probe-disabled', 'probe-never-run', 'probe-failing', 'probe-stale')) AS critical_probe_not_drilled,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state = 'no-probe') AS critical_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'no-probe' AND alternate_tested_at IS NULL) AS controls_untested_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'no-probe' AND alternate_tested_at IS NOT NULL) AS controls_hand_stamped_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'probe-failing') AS probes_failing,
  (SELECT COUNT(*) FROM control_alternate_probes WHERE enabled = 1) AS probes_enabled,
  (SELECT COUNT(*) FROM control_alternate_probes) AS probes_total;

DROP VIEW IF EXISTS v_path_coverage_gaps;
CREATE VIEW v_path_coverage_gaps AS
SELECT
  'control_registry' AS source,
  control AS process,
  kind AS path_kind,
  CASE
    WHEN alternate_path IS NULL OR trim(alternate_path) = '' THEN 'no-alternate'
    WHEN alternate_tested_at IS NULL AND lower(trim(alternate_path)) LIKE 'none needed%' AND evidence LIKE '%ALTERNATE-NOT-EXERCISABLE%' THEN 'alternate-not-exercisable'
    WHEN alternate_tested_at IS NULL THEN 'alternate-untested'
    ELSE 'ok'
  END AS path_state,
  alternate_path AS alternate,
  alternate_tested_at
FROM control_registry
UNION ALL
SELECT
  'process_contracts' AS source,
  process,
  'contract-paths' AS path_kind,
  CASE
    WHEN json_valid(paths_json) = 0 THEN 'paths-not-json'
    WHEN json_array_length(paths_json) < 2 THEN 'single-path'
    WHEN json_array_length(paths_json) = 2 THEN 'two-paths-no-spare'
    ELSE 'ok'
  END AS path_state,
  NULL AS alternate,
  NULL AS alternate_tested_at
FROM process_contracts;

DROP VIEW IF EXISTS v_path_coverage_violations;
CREATE VIEW v_path_coverage_violations AS
SELECT source, process, path_kind, path_state, alternate, alternate_tested_at
FROM v_path_coverage_gaps
WHERE path_state NOT IN ('ok', 'alternate-not-exercisable');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('control-alternate-undrilled', 'a control declares an alternate path that nothing re-runs, so its tested date is a hand-written stamp that decays',
  'CHAOS-DRILL-1 reads only spof_alternate_probes, and control_registry.alternate_tested_at had no writer except a session: 25 declared alternates sat untested on 2026-10-19 and the 7 critical ones were then stamped by hand',
  'control_alternate_probes holds a read-only expected/observed probe per exercisable control and the chaos drill runs them and stamps alternate_tested_at on a pass (CONTROL-ALT-PROBES-1, runner CONTROL-ALT-PROBES-RUNNER-1)',
  'the fm-control-alternate-undrilled contract counts controls with an alternate, no tested date and no probe row (v_control_alternate_untested.controls_untested_without_probe)',
  'fm-control-alternate-undrilled', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 2826,
  'a control_registry row with alternate_path set, alternate_tested_at NULL and no control_alternate_probes row',
  'v_path_coverage_violations alternate-untested, controls_on_critical_path_untested, a tested date older than any evidence',
  'the doctrine scorecard, the path coverage views and the CHAOS-DRILL-FAILED-1 control issues');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-control-alternate-undrilled', NULL, 'CONTROL-ALT-PROBES-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT controls_untested_without_probe FROM v_control_alternate_untested) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'CONTROL-ALT-PROBES-RUNNER-1: chaosDrill never reads control_alternate_probes, so no control alternate is re-drilled',
  'Charter pillar: autonomy. CONTROL-ALT-PROBES-1 (migrations/2026-10-19-control-alternate-probes.sql) created control_alternate_probes with 23 read-only expected/observed probes (the 7 critical controls first; migrations/2026-10-19-control-alternate-probes2.sql adds 9 for controls registered later), the views v_control_alternate_status and v_control_alternate_untested and the fm-control-alternate-undrilled detector. qnfo-fleet-control chaosDrill (CHAOS-DRILL-1) reads only spof_alternate_probes, so nothing runs those probes and control_registry.alternate_tested_at still has no writer but a session (agent_issues 2826 and 2880). Change in chaosDrill: after the loop over the spof probes and before the plan is built, read SELECT control, probe_sql FROM control_alternate_probes WHERE enabled = 1 ORDER BY control inside a try/catch (a missing table must not break the spof pass), judge each row with chaosJudge as a spof row is judged, write last_run_at, last_pass, last_observed and last_pass_at on the row (same CASE as the spof update), and push a verdict whose component is control:<name> so chaosPlan files one deduped CHAOS-DRILL-FAILED-1: control:<name> issue and closes it on the next pass. In the stamp loop a stamp entry that starts with control: runs UPDATE control_registry SET alternate_tested_at = nowIso, reviewed_at = nowIso WHERE control = ?. Keep chaosUntested over the spof rows only and add controls=N and control_pass=M to the chaos-drill event text. Test in qnfo-fleet-control/chaos-drill.test.mjs: a passing control probe stamps alternate_tested_at, a failing probe leaves it unchanged and files exactly one issue, a second failing run files none, a later pass closes it, a disabled row is skipped, a missing table leaves the spof pass intact. Raise the minor version (VERSION-MINOR-CAPABILITY-1: the worker now decides on its own to mark controls tested). After the deploy force one drill (POST /chaos-drill?force=1 on qnfo-fleet-control) and read SELECT * FROM v_control_alternate_untested, then give the controls counted in controls_hand_stamped_without_probe their probes. Then replace the age probes of issue-2826 and issue-2880 (UPDATE on class issue-<id>) with their substance: for 2826 expected 0 and observed COUNT(*) FROM v_path_coverage_violations WHERE path_state = ''alternate-untested'', for 2880 expected 0 and observed critical_untested_by_probe FROM v_control_alternate_untested. The probe set was run read-only against qnfo-audit on 2026-10-19 and 22 of 22 control probes passed, so a first-drill failure is a real broken alternate.' || char(10) || 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) || 'code-anchor: var openTitles = open.map(function(r) { return r.title; });' || char(10) || 'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "FROM control_alternate_probes WHERE enabled = 1"}',
  'migration-2026-10-19-control-alternate-probes', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'CONTROL-ALT-PROBES-RUNNER-1:%' AND status = 'open');

UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-fleet-control/worker.js"], "contains": "FROM control_alternate_probes WHERE enabled = 1"}', status = 'active', module = 'code-probe-line-v1', attempts = 0, last_verdict = NULL,
  next_due_at = datetime('now'), expected_cadence_h = 6, max_attempts = 3, precondition = 'code-probe line in the issue (PROBE-BIRTH-2)',
  action = 'the doer changes the code on main, scripts/remediation_consumer.py reads its checkout of main and a pass closes the issue'
WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'CONTROL-ALT-PROBES-RUNNER-1:%' AND status = 'open')
  AND COALESCE(module, '') <> 'code-probe-line-v1';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a control alternate counts as tested only while a probe on its own evidence keeps passing, a date written once by hand decays, and chaosDrill reads only spof_alternate_probes so it cannot run a second table without a worker change',
  'CONTROL-ALT-PROBES-1: control_alternate_probes with 23 read-only expected/observed probes (the 7 critical controls first), views v_control_alternate_status and v_control_alternate_untested, the state alternate-not-exercisable in v_path_coverage_gaps, failure mode control-alternate-undrilled with its detector; the chaos drill second pass is filed as CONTROL-ALT-PROBES-RUNNER-1 with a code-task line',
  'read 2026-10-19T13:00Z: control_registry 75 rows, 18 untested, v_path_coverage_violations alternate-untested 18, the 7 critical controls stamped by hand at 12:55Z (controls_on_critical_path_untested 7 to 0); qnfo-fleet-control 0.37.0 chaosDrill reads only spof_alternate_probes; the 22 control probes ran read-only against qnfo-audit and 22 passed; 34 monitoring rows with an open twin are the parked-twin state the enum probe exempts',
  'migration only, no worker change: nothing stamps alternate_tested_at from the new table until CONTROL-ALT-PROBES-RUNNER-1 lands',
  'one new table, two new views, two redefined views (v_path_coverage_gaps and v_path_coverage_violations, no other reader), evidence text on 22 control_registry rows, one control row, one failure mode, one detector contract, one issue',
  'the Rollback line of migrations/2026-10-19-control-alternate-probes.sql',
  'the fleet can say which control alternates are proven by a recent probe instead of a hand-written date; expected on apply (14:5xZ read): v_path_coverage_violations alternate-untested leaves the 3 not-exercisable rows and gains the probe set control row, 29 to 27 before the second seed file and the loop-owned park control are counted; the register-based metric stays at 4 until CONTROL-ALT-PROBES-RUNNER-1 deploys and one forced drill stamps the probed controls',
  'controls_on_critical_path_untested <= 4 within 6 h',
  'none', 'd1:qnfo-audit read-only probe runs, node:sqlite fixtures in migrations/control-alternate-probes.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'CONTROL-ALT-PROBES-1:%');
