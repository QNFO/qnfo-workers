-- CLUSTER-E-C (2026-10-28, charter pillar autonomy; ROADMAP-1 even-keel-fm-audit FM-1..FM-4, EK-2/3/4/6 doers; agent_issues 1000713 to 1000721).
-- Evidence (qnfo-audit, 2026-10-28): cf_agent_requests #238 and #97 hold raw tool-call markup as the whole answer and the management-personas step rc-agent-report appends any
-- 'done' answer that is not '(the model returned no text)'; the three oldest ROOT-CAUSE-1 issues (1000301, 1000302, 1000303) end in 'no answer yet; the managers ask again'
-- because their agent-diagnose persona_actions row was set to 'reported' by an older step version, so later clean answers are never appended; cf_agent_requests 273
-- proposed a worker.js edit for a gate that is a D1 trigger (nothing asked for the anchor to be checked); the issue-probe-agent selects only issues without an active contract,
-- so the 59 open issues on a VACUOUS-PROBE contract (2 of the METRIC-UNMEASURED-1 and CF-OBS-ISSUE-1 families) are never given a measuring probe.
-- Changes (each one component, versioned, backed up):
--   FM-1  management-personas v+1: rc-agent-request, rc-agent-report and rc-agent-mark treat an answer with tool-call markup as unanswered (re-ask, up to 6 requests per issue);
--         the three stale ROOT-CAUSE-1 rows are set back to 'requested' so the next tick appends the clean answer that exists.
--   FM-2  management-personas v+1: the rc-agent-request prompt tells the agent to confirm that a code-anchor occurs exactly once in the file and to name the D1 trigger,
--         view, migration or fleet_tasks step (a migration) when that is the layer.
--   FM-3  v_close_dwell_shadow: per currently closed issue with reopened_count >= 2 that closed on a verification row, how many passes of the same class preceded the closing
--         pass inside 60 minutes (single_pass_close = 1 when none): the shadow count the issue asks for before any dwell is enforced.
--   FM-4  issue-probe-agent v+1: its probe-request step also selects the open METRIC-UNMEASURED-1 and CF-OBS-ISSUE-1 issues whose active contract is a VACUOUS-PROBE, so the
--         agent writes a measuring probe for them (probe-apply already overwrites the contract of class issue-<id>); v_vacuous_probe_share is the guard-metric basis.
--   Contracts: 1000717..1000721 get measuring probes (their birth contract was superseded as closure-observing). Issues 1000713..1000716 get a code-task line for the code loop.
-- Prediction: ROOT-CAUSE-1 descriptions written after the apply carry zero tool-call markup; open VACUOUS-PROBE contracts in the two families stay at 0 and the share of open
-- issues on a vacuous contract falls; guard: open_agent_issues and cf_agent_requests per hour (<= 3 + 12 per tick as before) do not rise.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261028_cluster_e_c_tasks
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT b.definition FROM bak_20261028_cluster_e_c_tasks b WHERE b.id = fleet_tasks.id), version = version + 1 WHERE id IN ('management-personas', 'issue-probe-agent'); DROP VIEW IF EXISTS v_close_dwell_shadow; DROP VIEW IF EXISTS v_vacuous_probe_share; UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261028_cluster_e_c_issues b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261028_cluster_e_c_issues);

CREATE TABLE IF NOT EXISTS bak_20261028_cluster_e_c_tasks AS SELECT id, definition, version FROM fleet_tasks WHERE id IN ('management-personas', 'issue-probe-agent');
CREATE TABLE IF NOT EXISTS bak_20261028_cluster_e_c_issues AS SELECT id, description FROM agent_issues WHERE id IN (1000713, 1000714, 1000715, 1000716, 1000717, 1000718, 1000719, 1000720, 1000721);
CREATE TABLE IF NOT EXISTS bak_20261028_cluster_e_c_contracts AS SELECT * FROM remediation_contracts WHERE class IN ('issue-1000717', 'issue-1000718', 'issue-1000719', 'issue-1000720', 'issue-1000721');

-- FM-1 and FM-2: management-personas. Every fragment must occur exactly once or nothing is written.
UPDATE fleet_tasks SET
  definition = replace(replace(replace(replace(definition,
    'r.instance = ''root-cause-'' || a.id AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%'')',
    'r.instance = ''root-cause-'' || a.id AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%'' AND COALESCE(r.result, '''') NOT LIKE ''%tool_call%'' AND COALESCE(r.result, '''') NOT LIKE ''%<invoke%'' AND COALESCE(r.result, '''') NOT LIKE ''%<function_calls%'' AND COALESCE(r.result, '''') NOT LIKE ''%DSML%'') AND (SELECT COUNT(*) FROM cf_agent_requests q WHERE q.instance = ''root-cause-'' || a.id) < 6'),
    'r.instance = ''root-cause-'' || agent_issues.id AND r.status IN (''done'', ''failed'', ''error'') AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%''',
    'r.instance = ''root-cause-'' || agent_issues.id AND r.status IN (''done'', ''failed'', ''error'') AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%'' AND COALESCE(r.result, '''') NOT LIKE ''%tool_call%'' AND COALESCE(r.result, '''') NOT LIKE ''%<invoke%'' AND COALESCE(r.result, '''') NOT LIKE ''%<function_calls%'' AND COALESCE(r.result, '''') NOT LIKE ''%DSML%'''),
    'r.instance = ''root-cause-'' || persona_actions.issue_id AND r.status IN (''done'', ''failed'', ''error'') AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%''',
    'r.instance = ''root-cause-'' || persona_actions.issue_id AND r.status IN (''done'', ''failed'', ''error'') AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%'' AND COALESCE(r.result, '''') NOT LIKE ''%tool_call%'' AND COALESCE(r.result, '''') NOT LIKE ''%<invoke%'' AND COALESCE(r.result, '''') NOT LIKE ''%<function_calls%'' AND COALESCE(r.result, '''') NOT LIKE ''%DSML%'''),
    'as a code-task proposal with repo, path and the exact edit. If you can file it, file one agent_issues row with a code-task line.',
    'as a code-task proposal with repo, path and the exact edit, only after you have read the file and confirmed that the code-anchor text occurs exactly once in it; when the gate or writer is a D1 trigger, view, migration or fleet_tasks step, say so and propose the migration instead of a worker.js edit. If you can file it, file one agent_issues row with a code-task line.'),
  version = version + 1, updated_at = '2026-10-28T20:30:00Z'
WHERE id = 'management-personas' AND json_valid(definition)
  AND instr(definition, '%DSML%') = 0
  AND length(definition) - length(replace(definition, 'r.instance = ''root-cause-'' || a.id AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%'')', '')) =
    length('r.instance = ''root-cause-'' || a.id AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%'')')
  AND length(definition) - length(replace(definition, 'r.instance = ''root-cause-'' || agent_issues.id AND r.status IN (''done'', ''failed'', ''error'') AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%''', '')) =
    length('r.instance = ''root-cause-'' || agent_issues.id AND r.status IN (''done'', ''failed'', ''error'') AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%''')
  AND length(definition) - length(replace(definition, 'r.instance = ''root-cause-'' || persona_actions.issue_id AND r.status IN (''done'', ''failed'', ''error'') AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%''', '')) =
    length('r.instance = ''root-cause-'' || persona_actions.issue_id AND r.status IN (''done'', ''failed'', ''error'') AND COALESCE(r.result, '''') NOT LIKE ''(the model returned no text)%''')
  AND length(definition) - length(replace(definition, 'as a code-task proposal with repo, path and the exact edit. If you can file it, file one agent_issues row with a code-task line.', '')) =
    length('as a code-task proposal with repo, path and the exact edit. If you can file it, file one agent_issues row with a code-task line.');

-- the three oldest ROOT-CAUSE-1 issues carry the stale 'no answer yet' line and a 'reported' row: ask the report step to append the clean answer that exists
UPDATE persona_actions SET to_value = 'requested'
WHERE kind = 'agent-diagnose' AND to_value = 'reported' AND issue_id IN (1000301, 1000302, 1000303)
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = persona_actions.issue_id AND a.status = 'open' AND a.description LIKE '%no answer yet; the managers ask again')
  AND EXISTS (SELECT 1 FROM cf_agent_requests r WHERE r.instance = 'root-cause-' || persona_actions.issue_id AND r.status IN ('done', 'failed', 'error')
              AND COALESCE(r.result, '') <> '' AND COALESCE(r.result, '') NOT LIKE '(the model returned no text)%' AND COALESCE(r.result, '') NOT LIKE '%tool_call%'
              AND COALESCE(r.result, '') NOT LIKE '%<invoke%' AND COALESCE(r.result, '') NOT LIKE '%<function_calls%' AND COALESCE(r.result, '') NOT LIKE '%DSML%');

-- FM-4: issue-probe-agent also asks for the vacuous-probe issues of the two flapping families.
UPDATE fleet_tasks SET
  definition = replace(definition,
    'AND COALESCE(c.status, ''none'') NOT IN (''active'', ''monitoring'', ''holding'') AND a.created_at',
    'AND (COALESCE(c.status, ''none'') NOT IN (''active'', ''monitoring'', ''holding'') OR (c.action LIKE ''VACUOUS-PROBE%'' AND (a.title LIKE ''METRIC-UNMEASURED-1%'' OR a.title LIKE ''CF-OBS-ISSUE-1%''))) AND a.created_at'),
  version = version + 1, updated_at = '2026-10-28T20:30:00Z'
WHERE id = 'issue-probe-agent' AND json_valid(definition)
  AND instr(definition, 'c.action LIKE ''VACUOUS-PROBE%''') = 0
  AND length(definition) - length(replace(definition, 'AND COALESCE(c.status, ''none'') NOT IN (''active'', ''monitoring'', ''holding'') AND a.created_at', '')) =
    length('AND COALESCE(c.status, ''none'') NOT IN (''active'', ''monitoring'', ''holding'') AND a.created_at');

-- FM-3 shadow count and FM-4 guard-metric basis (read-only views).
CREATE VIEW IF NOT EXISTS v_close_dwell_shadow AS
SELECT x.issue_id AS issue_id, x.reopened_count AS reopened_count, x.verification_id AS verification_id, x.closed_on_pass_at AS closed_on_pass_at, x.prior_passes_60m AS prior_passes_60m,
       CASE WHEN x.prior_passes_60m = 0 THEN 1 ELSE 0 END AS single_pass_close
FROM (SELECT t.issue_id AS issue_id, t.reopened_count AS reopened_count, v.id AS verification_id, v.verified_at AS closed_on_pass_at,
             (SELECT COUNT(*) FROM remediation_verifications p WHERE p.class = v.class AND p.id < v.id AND p.pass = 1 AND p.verified_at >= datetime(v.verified_at, '-60 minutes')) AS prior_passes_60m
      FROM issue_triage t JOIN remediation_verifications v ON v.id = CAST(substr(t.close_evidence, 27) AS INTEGER)
      WHERE t.close_evidence LIKE 'remediation_verifications#%' AND COALESCE(t.reopened_count, 0) >= 2) x;

CREATE VIEW IF NOT EXISTS v_vacuous_probe_share AS
SELECT COUNT(*) AS open_issues,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.action LIKE 'VACUOUS-PROBE%') THEN 1 ELSE 0 END) AS on_vacuous_probe
FROM agent_issues a WHERE a.status = 'open';

-- Failure-mode registry rows (the detector text names the measure; the closing probes below are the contracts).
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, symptom, blast_radius) VALUES
 ('diagnosis-raw-markup', 'A root-cause diagnosis stored in an issue is raw tool-call markup or empty', 'rc-agent-report appended any done answer that was not the no-text marker', 'CLUSTER-E-C FM-1: markup answers count as unanswered and are re-asked (6 requests at most)', 'issue-1000717 probe: markup answers appended after 2026-10-29 = 0', 'd1-query', '2026-10-28', 1000717, 'cf_agent_requests 97 and 238 stored as diagnoses', 'ROOT-CAUSE-1 issues'),
 ('diagnosis-unresolved-anchor', 'A diagnosis proposes a worker.js code-task for a gate that is a D1 trigger', 'the prompt never asked for the anchor to be checked or for the layer to be named', 'CLUSTER-E-C FM-2: prompt requires one-occurrence check and layer naming', 'issue-1000718 probe: the live management-personas prompt carries the check', 'd1-query', '2026-10-28', 1000718, 'cf_agent_requests 273 proposed qnfo-fleet-control/worker.js for remediation_verification_autoclose_ins', 'ROOT-CAUSE-1 issues'),
 ('close-no-dwell', 'An issue reopened twice or more is closed on a single passing probe and reopens', 'remediation_verification_autoclose_* close on the first pass', 'CLUSTER-E-C FM-3 step 1: v_close_dwell_shadow measures single_pass_close; step 2 enforces a dwell of at most 120 minutes', 'issue-1000719 probe: single_pass_close = 1 closes in the last 24 hours = 0', 'd1-query', '2026-10-28', 1000719, 'PORTFOLIO-GAP umbrella 136 reopens, METRIC-REGRESSION-1 209', 'issues with reopened_count >= 2');

-- Measuring probes for the roadmap issues whose birth contract was superseded (re-armed only while still superseded).
UPDATE remediation_contracts SET status = 'active', attempts = 0, next_due_at = datetime('now'), action = 'CLUSTER-E-C measuring probe', precondition = 'CLUSTER-E-C FM-1: no markup diagnosis written after 2026-10-29 and no ROOT-CAUSE-1 issue left on the stale no-answer line',
  last_verdict = 're-armed:cluster-e-c',
  verify_probe = 'SELECT ''0'' AS expected, CAST((CASE WHEN instr((SELECT definition FROM fleet_tasks WHERE id = ''management-personas''), ''%tool_call%'') > 0 THEN (SELECT COUNT(*) FROM cf_agent_requests r JOIN agent_issues a ON r.instance = ''root-cause-'' || a.id WHERE r.finished_at > ''2026-10-29T00:00:00Z'' AND (r.result LIKE ''%tool_call%'' OR r.result LIKE ''%<invoke%'' OR r.result LIKE ''%DSML%'') AND instr(a.description, ''(cf_agent_requests #'' || r.id || '','') > 0) ELSE 1 END) + (SELECT COUNT(*) FROM agent_issues WHERE status = ''open'' AND title LIKE ''ROOT-CAUSE-1:%'' AND description LIKE ''%no answer yet'' || char(59) || '' the managers ask again'') AS TEXT) AS observed',
  verify_transport = 'd1-query'
WHERE class = 'issue-1000717' AND status = 'superseded';
UPDATE remediation_contracts SET status = 'active', attempts = 0, next_due_at = datetime('now'), action = 'CLUSTER-E-C measuring probe', precondition = 'CLUSTER-E-C FM-2: the live root-cause prompt requires the anchor check and layer naming',
  last_verdict = 're-armed:cluster-e-c',
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN instr((SELECT definition FROM fleet_tasks WHERE id = ''management-personas''), ''occurs exactly once in it'') > 0 THEN ''1'' ELSE ''0'' END AS observed',
  verify_transport = 'd1-query'
WHERE class = 'issue-1000718' AND status = 'superseded';
UPDATE remediation_contracts SET status = 'active', attempts = 0, next_due_at = datetime('now'), action = 'CLUSTER-E-C measuring probe', precondition = 'CLUSTER-E-C FM-3: no closes in the last 24 hours of an issue reopened twice or more on a single pass',
  last_verdict = 're-armed:cluster-e-c',
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_close_dwell_shadow WHERE single_pass_close = 1 AND closed_on_pass_at > datetime(''now'', ''-24 hours'')) AS TEXT) AS observed',
  verify_transport = 'd1-query'
WHERE class = 'issue-1000719' AND status = 'superseded';
UPDATE remediation_contracts SET status = 'active', attempts = 0, next_due_at = datetime('now'), action = 'CLUSTER-E-C measuring probe', precondition = 'CLUSTER-E-C FM-4: no open METRIC-UNMEASURED-1 or CF-OBS-ISSUE-1 issue on a vacuous probe, and the vacuous-share guard metric registered',
  last_verdict = 're-armed:cluster-e-c',
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a JOIN remediation_contracts c ON c.class = ''issue-'' || a.id WHERE a.status = ''open'' AND c.status IN (''active'', ''holding'') AND c.action LIKE ''VACUOUS-PROBE%'' AND (a.title LIKE ''METRIC-UNMEASURED-1%'' OR a.title LIKE ''CF-OBS-ISSUE-1%'')) + (CASE WHEN EXISTS (SELECT 1 FROM metric_registry WHERE metric = ''vacuous_probe_share'') THEN 0 ELSE 1 END) AS TEXT) AS observed',
  verify_transport = 'd1-query'
WHERE class = 'issue-1000720' AND status = 'superseded';
UPDATE remediation_contracts SET status = 'active', attempts = 0, next_due_at = datetime('now'), action = 'CLUSTER-E-C measuring probe', precondition = 'CLUSTER-E-C FM-5: remediation_verifications rows per 24 hours fall below 24000 (31903 on 2026-10-28)',
  last_verdict = 're-armed:cluster-e-c',
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM remediation_verifications WHERE verified_at > datetime(''now'', ''-24 hours'')) < 24000 THEN ''1'' ELSE ''0'' END AS observed',
  verify_transport = 'd1-query'
WHERE class = 'issue-1000721' AND status = 'superseded';

-- Doers: a code-task line for the code loop on the four EK issues (the anchor occurs once in the named file on 2026-10-28), a note on the migration-owned FM issues.
UPDATE agent_issues SET description = description || char(10) || char(10) || 'DOER cluster-e-c 2026-10-28: code loop. Build in the owner loop file; the briefing assembly is where sources are chosen. Closing measure: share of contested-topic pieces with at least 3 sources.' || char(10) || 'code-task: repo=qnfo-workers path=personal-companion/worker.js' || char(10) || 'code-anchor: The other items are supporting source material: use those that bear on the subject, ignore the rest.'
WHERE id = 1000713 AND status = 'open' AND description NOT LIKE '%code-task: repo=%';
UPDATE agent_issues SET description = description || char(10) || char(10) || 'DOER cluster-e-c 2026-10-28: code loop. Add the separate-family balance score beside the existing fact-check pass (ENSEMBLE-POLICY-1), log it per piece, keep the fact-check pass rate.' || char(10) || 'code-task: repo=qnfo-workers path=personal-companion/worker.js' || char(10) || 'code-anchor: async function factCheck(env, draft, ground, writerModel, seedText) {'
WHERE id = 1000714 AND status = 'open' AND description NOT LIKE '%code-task: repo=%';
UPDATE agent_issues SET description = description || char(10) || char(10) || 'DOER cluster-e-c 2026-10-28: code loop. The story source list is technology only (scrapeHN); add policy and science sources and apply the reading analysis form to them.' || char(10) || 'code-task: repo=qnfo-workers path=q08-signal-engine/worker.js' || char(10) || 'code-anchor: async function scrapeHN() {'
WHERE id = 1000715 AND status = 'open' AND description NOT LIKE '%code-task: repo=%';
UPDATE agent_issues SET description = description || char(10) || char(10) || 'DOER cluster-e-c 2026-10-28: code loop, after EK-3 (1000714) merges in the same file. Move the objection rule, even-keel check and sources footer into one module under _shared/ and import it from personal-companion first.' || char(10) || 'code-task: repo=qnfo-workers path=personal-companion/worker.js' || char(10) || 'code-anchor: The strongest objection to your central claim must appear in the piece'
WHERE id = 1000716 AND status = 'open' AND description NOT LIKE '%code-task: repo=%';
UPDATE agent_issues SET description = description || char(10) || char(10) || 'DOER cluster-e-c 2026-10-28: migrations/2026-10-28-cluster-e-c-failure-modes.sql (management-personas v+1: markup answers are unanswered and re-asked, three stale rows re-armed). Closing probe on class issue-1000717.'
WHERE id = 1000717 AND status = 'open' AND description NOT LIKE '%DOER cluster-e-c%';
UPDATE agent_issues SET description = description || char(10) || char(10) || 'DOER cluster-e-c 2026-10-28: the layer is the management-personas fleet_tasks prompt, not a worker; migrations/2026-10-28-cluster-e-c-failure-modes.sql adds the one-occurrence and layer-naming rule. Closing probe on class issue-1000718 reads the live prompt.'
WHERE id = 1000718 AND status = 'open' AND description NOT LIKE '%DOER cluster-e-c%';
UPDATE agent_issues SET description = description || char(10) || char(10) || 'DOER cluster-e-c 2026-10-28: step 1 is v_close_dwell_shadow (shadow count, migrations/2026-10-28-cluster-e-c-failure-modes.sql). Step 2, after 24 hours of shadow data: recreate remediation_verification_autoclose_ins/upd requiring a passing verification of the same class at least N minutes (N at most 120) before the closing pass for issues with reopened_count >= 2, with backup and rollback as in migrations/2026-10-28-vacuous-flap-1.sql. Closing probe on class issue-1000719.'
WHERE id = 1000719 AND status = 'open' AND description NOT LIKE '%DOER cluster-e-c%';
UPDATE agent_issues SET description = description || char(10) || char(10) || 'DOER cluster-e-c 2026-10-28: issue-probe-agent v+1 now selects the vacuous-probe issues of both families (migrations/2026-10-28-cluster-e-c-failure-modes.sql); v_vacuous_probe_share is the basis for the guard metric vacuous_probe_share, which still has to be registered in metric_registry together with its trigger (the closing probe on class issue-1000720 stays red until it is).'
WHERE id = 1000720 AND status = 'open' AND description NOT LIKE '%DOER cluster-e-c%';
UPDATE agent_issues SET description = description || char(10) || char(10) || 'DOER cluster-e-c 2026-10-28: scripts/remediation_consumer.py steady_state_cadence backs a contract whose last 6 verifications all passed with the same observed value off to 2 hours (never beyond 120 minutes); scripts/remediation_consumer_steady_test.py covers it. Closing probe on class issue-1000721: verifications per 24 hours below 24000 (31903 on 2026-10-28).'
WHERE id = 1000721 AND status = 'open' AND description NOT LIKE '%DOER cluster-e-c%';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session:cluster-e-c', 'the owner decides nothing; roadmap issues without a doer get one in the same change',
  'management-personas and issue-probe-agent workflow edits, shadow views, measuring probes for FM-1..FM-5, code-task lines for EK-2/3/4/6',
  '2026-10-28: 7 diagnoses stored as tool-call markup, 59 open issues on a vacuous probe, 31903 verification rows in 24 hours', 'pending',
  'two fleet_tasks definitions (backed up in bak_20261028_cluster_e_c_tasks), the description of nine issues, five contracts',
  'the Rollback line of migrations/2026-10-28-cluster-e-c-failure-modes.sql',
  'diagnoses-reject-markup', 'no markup diagnosis written after 2026-10-29; vacuous contracts of the two families stay 0; verification rows per 24 hours below 24000', 'fleet_tasks, remediation_contracts, agent_issues, offline suite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'session:cluster-e-c' AND capability_gain = 'diagnoses-reject-markup');
