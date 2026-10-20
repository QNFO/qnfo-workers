-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET ts = (SELECT b.ts FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), max_attempts = (SELECT b.max_attempts FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), deferred_since = (SELECT b.deferred_since FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), last_attempt_at = (SELECT b.last_attempt_at FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), expected_cadence_h = (SELECT b.expected_cadence_h FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class), escalate_to = (SELECT b.escalate_to FROM bak_20261020_real_probes_3 b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261020_real_probes_3) AND module = 'real-probes-3'; DELETE FROM remediation_contracts WHERE class = 'fm-applier-version-step-not-idempotent'; DELETE FROM failure_modes WHERE fm_key = 'applier-version-step-not-idempotent';
--
-- REAL-PROBES-3 (2026-10-20, charter pillar autonomy; agent_issues 100293 MERGE-LANE-THROUGHPUT-1, 100308 CF-MODEL-EVAL-1, 100314 PROBE-NEEDED-1 for issue 100308, 100320 APPLIER-ROT-ERROR).
-- Third round of the circular-probe cure, after migrations/2026-10-19-windows-parity-probe.sql and migrations/2026-10-19-ab-length-retry.sql. decision_log is append-only, so the Rollback line above leaves the decision row.
-- Companion to scripts/checkin-scale-anchored-1-patch.py (the applier fix for issue 100320) and its suite in the same pull request.
--
-- WHAT WAS WRONG (read 2026-10-20 from qnfo-audit, read-only)
--   Four open issues each held one contract that no loop could close:
--   * issue-100293, issue-100308 and issue-100320 are superseded (module probe-template-v3-generic, last_verdict superseded:closure-observing-probe-at-birth, CLOSE-PROBE-CIRCULAR-1). The born probe reads the
--     status of its own issue, and issue_close_evidence_required lets that status change only after a close that the same probe blocks.
--   * issue-100314 (PROBE-NEEDED-1 for issue 100308) is probe-review-refused. PROBE-REVIEW-1 (qnfo-cloud-ops) judged its probe self-confirming: it reads ok when issue 100308 is no longer open and also when no contract
--     exists, so it can pass without the outcome the issue asks for. PROBE-REVIEW-1 puts a refused contract back to active only on a rewritten verify_probe.
--   None of the four closes by waiting, so each stood in v_issue_dead_end and in fm-open-issue-no-doer.
--
-- WHAT THIS CHANGES (each probe measures the issue's own definition of done, never the status of the issue, and reads pending or a failing token while the defect stands)
--   1. issue-100320 (APPLIER-ROT-ERROR, applier-doctor). The defect was in scripts/checkin-scale-anchored-1-patch.py: the patch is on main (personal-companion/wellbeing-wire.js and worker.js carry SCALE-ANCHORED-1), but its last step
--      required the worker to carry VERSION 1.29.0 or 1.30.0 and died with FAIL-CLOSED when personal-companion moved on to 1.37.2, which applier-doctor counts as error (ci-status/applier-doctor.json, ts 2026-10-20T08:23:21Z, errored
--      lists the script). The script now treats a worker that carries the marker as already applied. The contract becomes a code-read probe of ci-status/applier-doctor.json on main: the file must still be the doctor report (it contains
--      "marker": "APPLIER-DOCTOR-2", so an emptied or replaced file cannot pass) and it must not name the script in any list. The report is written with json.dumps defaults and sorted keys, so today it reads
--      "errored": ["scripts/checkin-scale-anchored-1-patch.py"] and the probe observes present-marker:ci-status/applier-doctor.json. The probe absent-text is the quoted path and not the longer text that starts at "errored": because the
--      lists are sorted by path and a script that sorts before this one in the same list would hide the prefix from the longer text. The doctor workflow triggers on a push to main that touches scripts/*patch*.py, so the merge of
--      this file runs it, and it commits the new report back; the contract passes when that report is on main. The consumer reads main from its own checkout, so the pass is seen on its next run after the commit-back.
--   2. issue-100293 (MERGE-LANE-THROUGHPUT-1, high). A d1-query probe of the three figures its definition of done names, read from the same sources the issue names (v_sla_compliance for the queue, code_tasks for the merged share and
--      the expressions of v_issue_family_throughput for opened and closed), observing ok only when all hold at once: the code-task-merge queue_minutes is at most 120, the merged share of the code_tasks created in the 7-day window
--      is at least 0.70 (integer test, merged * 10 >= created * 7), the same two figures hold for the window that ended 1440 minutes before the read (the issue's "two consecutive daily reads", taken from the data and not from
--      two ticks; the queue of that window is the same average over merged_at in the 7-day window ending 1440 minutes ago), and the issues closed exceed the issues opened over the 7-day window (created_at and, for a closed or
--      resolved issue, updated_at inside the window: the opened_24h and closed_24h expressions of v_issue_family_throughput over 10080 minutes). A window with fewer than 20 code tasks reads pending, so a quiet lane cannot pass on a
--      handful of rows. Otherwise it observes the first failing clause with its number (pending: code-task-merge queue 279.1 min > 120 min SLA). The probe names no issue id and reads no status of issue 100293: the closed count is the
--      aggregate over every issue. Live on 2026-10-20 at 08:52Z: queue 279.1 minutes; merged 113 of 248 (0.456); earlier window 71 of 181 (0.392) with queue 402.9 minutes; closed 959 against opened 943. The probe therefore
--      observes the queue clause first. Thresholds, metric formulas and sla_registry are not changed. max_attempts 24 so a long-lived real defect does not park the contract.
--   3. issue-100308 (CF-MODEL-EVAL-1 notice: promote @cf/google/gemma-4-26b-a4b-it on the chat battery). Its definition of done is a decision, not a flip: the notice says to flip routing only after the canary agrees, so the issue is done when
--      the model is active in model_ladder_models and cf_model_canary holds an agreement of 0.7 or more for it (CANARY_BAR in qnfo-model-eval), or the fleet has recorded that it will not be promoted: cf_model_catalog status
--      rejected (the cf-model-eval verdict reject), or the roadmap item MODEL-@cf/google/gemma-4-26b-a4b-it retired or carrying evidence that starts with BLOCKED: (what blockDecisionPromotion writes when a promotion is withdrawn).
--      Anything else observes pending and names what is missing. The probe reads cf_model_catalog, roadmap_implementation, model_ladder_models and cf_model_canary and nothing of the issue tables.
--      FINDING THAT CHANGES THE PREMISE (read live 2026-10-20): the notice says the model was registered in model_ladder_models with active=0. It was not. The ladder row is an older one (tier 1, quality 62, notes "instruction following;
--      free neurons", active=1), cf_model_catalog already read in_production, and decide() registers a promotion with INSERT OR IGNORE, which did nothing here, then files the notice anyway. So the state is not "waiting to be flipped":
--      the model reads active=1 with no canary row and no rejection, and the standing policy MODEL-FLOOR-1 (scripts/model-floor-guard.mjs, BANNED gemma-4-26b: sub-frontier) lists it as banned, the current qnfo-ai/worker.js does
--      not route it, and cf_model_evals id 61 (cfmb-2, 2026-10-20 06:21:17) records verdict promote. The probe therefore does not pass on active=1 alone: that row predates the evaluation and no decision was taken on it.
--      THE FLEET HAS NO AUTOMATIC PATH THAT RECORDS THIS DECISION for a chat-battery model: the canary (clefCanary) exists for the decision (clef) models only, and a chat promotion registers the model, adds the roadmap item and files
--      this notice, then stops. No code is added here. The owning loop is cf-model-eval (qnfo-model-eval); the contract text names it and the exact records that close the issue, so the issue has a doer. The record that fits the
--      evidence above is cf_model_catalog status rejected for the model with a note naming MODEL-FLOOR-1.
--   4. issue-100314 (PROBE-NEEDED-1 for issue 100308). Its definition of done is that issue 100308 holds a live contract with a probe of its own. The probe observes ok only when contract issue-100308 exists with status active or
--      holding, transport d1-query and a probe text that contains neither the placeholder nor a read of the issue table (each tested as two literals so this probe's own text does not match itself), pending when the contract is absent
--      and pending otherwise. It reads remediation_contracts only. Item 3 above makes the condition true, so this contract reads ok on its first run; it is set active with attempts 0 and no verdict so that PROBE-REVIEW-1
--      re-judges the rewritten text.
--
-- Shared rules: every UPDATE is guarded on the retired state (status superseded or probe-review-refused and the circular text still in the probe), so a replay or a probe a doer has written by hand is left alone. The four contracts
-- are backed up first in bak_20261020_real_probes_3 (CREATE TABLE IF NOT EXISTS: a replay keeps the original rows); the Rollback restores them only while module is still real-probes-3. No agent_issues or issue_triage row is written: the four
-- issues stay open and close only through their own contracts. No duration is stated in hours or days.
--
-- FAILURE MODE applier-version-step-not-idempotent with its code-read detector fm-applier-version-step-not-idempotent (the marker branch is in the script on main). The generic detector of the class is the doctor report itself
-- (APPLIER-ROT-TRIAGE-1 files an issue per errored script), which is what contract issue-100320 reads.
--
-- spof-review: no new loop, cap, hold or gate. Four contracts re-pointed, one detector added, one backup table.

-- 0. Backup of the four contracts this file changes (BACKUP-CREATES-1). A replay finds the table and leaves it as it is.
CREATE TABLE IF NOT EXISTS bak_20261020_real_probes_3 AS
  SELECT class, issue_id, ts, status, verify_probe, verify_transport, last_verdict, module, action, precondition, attempts, max_attempts, next_due_at, deferred_since, last_attempt_at, expected_cadence_h, escalate_to
  FROM remediation_contracts
  WHERE class IN ('issue-100293', 'issue-100308', 'issue-100314', 'issue-100320');

-- 1. Issue 100293: the three figures of its definition of done, in two windows.
UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query',
  verify_probe = 'WITH w AS (SELECT julianday(''now'', ''-10080 minutes'') AS now_lo, julianday(''now'', ''-11520 minutes'') AS prev_lo, julianday(''now'', ''-1440 minutes'') AS prev_hi),
q AS (SELECT (SELECT queue_minutes FROM v_sla_compliance WHERE process = ''code-task-merge'') AS now_min),
p AS (SELECT AVG((julianday(c.merged_at) - julianday(c.created_at)) * 1440) AS prev_min FROM code_tasks c, w WHERE c.merged_at IS NOT NULL AND c.created_at IS NOT NULL AND julianday(c.merged_at) > w.prev_lo AND julianday(c.merged_at) <= w.prev_hi),
s AS (SELECT COALESCE(SUM(CASE WHEN julianday(c.created_at) > w.now_lo THEN 1 ELSE 0 END), 0) AS n_now,
  COALESCE(SUM(CASE WHEN julianday(c.created_at) > w.now_lo AND c.status = ''merged'' THEN 1 ELSE 0 END), 0) AS m_now,
  COALESCE(SUM(CASE WHEN julianday(c.created_at) > w.prev_lo AND julianday(c.created_at) <= w.prev_hi THEN 1 ELSE 0 END), 0) AS n_prev,
  COALESCE(SUM(CASE WHEN julianday(c.created_at) > w.prev_lo AND julianday(c.created_at) <= w.prev_hi AND c.status = ''merged'' THEN 1 ELSE 0 END), 0) AS m_prev
  FROM code_tasks c, w),
t AS (SELECT COALESCE(SUM(CASE WHEN i.created_at > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 604800) * 1000 THEN 1 ELSE 0 END), 0) AS opened,
  COALESCE(SUM(CASE WHEN i.status IN (''closed'', ''resolved'') AND i.updated_at > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 604800) * 1000 THEN 1 ELSE 0 END), 0) AS closed
  FROM agent_issues i)
SELECT ''ok'' AS expected, CASE
  WHEN q.now_min IS NULL THEN ''pending: v_sla_compliance has no code-task-merge row because no code task merged in the 7-day window''
  WHEN q.now_min > 120 THEN ''pending: code-task-merge queue '' || printf(''%.1f'', q.now_min) || '' min > 120 min SLA''
  WHEN s.n_now < 20 THEN ''pending: '' || s.n_now || '' code tasks created in the 7-day window, a share needs 20 or more''
  WHEN s.m_now * 10 < s.n_now * 7 THEN ''pending: merged share '' || printf(''%.3f'', 1.0 * s.m_now / s.n_now) || '' < 0.70 ('' || s.m_now || '' merged of '' || s.n_now || '' code tasks created in the 7-day window)''
  WHEN p.prev_min IS NULL THEN ''pending: no code task merged in the window that ended 1440 minutes ago''
  WHEN p.prev_min > 120 THEN ''pending: queue of the window that ended 1440 minutes ago '' || printf(''%.1f'', p.prev_min) || '' min > 120 min SLA''
  WHEN s.n_prev < 20 THEN ''pending: '' || s.n_prev || '' code tasks created in the window that ended 1440 minutes ago, a share needs 20 or more''
  WHEN s.m_prev * 10 < s.n_prev * 7 THEN ''pending: merged share of the window that ended 1440 minutes ago '' || printf(''%.3f'', 1.0 * s.m_prev / s.n_prev) || '' < 0.70 ('' || s.m_prev || '' merged of '' || s.n_prev || '')''
  WHEN t.closed <= t.opened THEN ''pending: issues closed '' || t.closed || '' <= opened '' || t.opened || '' in the 7-day window''
  ELSE ''ok'' END AS observed
FROM q, p, s, t',
  last_verdict = NULL, attempts = 0, max_attempts = 24, deferred_since = NULL, next_due_at = datetime('now'),
  module = 'real-probes-3', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1,
  precondition = 'REAL-PROBES-3: issue 100293 (MERGE-LANE-THROUGHPUT-1) measured by the figures its definition of done names, never by the status of the issue',
  action = 'MEASURES the defect. Reads ok only when all of these hold at once: v_sla_compliance code-task-merge queue_minutes is at most 120, the share of code_tasks created in the 7-day window that are merged is at least 0.70, the same two figures hold for the window that ended 1440 minutes before the read (the two consecutive daily reads of the definition of done, taken from the data), and issues closed exceed issues opened over the 7-day window (the expressions of v_issue_family_throughput over that window). Otherwise it observes the first failing clause with its number, for example pending: merged share 0.456 < 0.70. Live on 2026-10-20: queue 279.1 minutes, merged 113 of 248 (0.456), earlier window 71 of 181 (0.392) with queue 402.9 minutes, closed 959 against opened 943. The work is the five levers in the issue text (re-create a conflicted or mirror-guard-failed change on a fresh branch from main and supersede the old PR, split patches over 200000 characters, retry a suite failure once after a re-base, a per-class NO-PROGRESS-CEILING-1, a doer for every issue without one), done by the code loop (qnfo-code-orchestrator, qnfo-fleet-control) and the sessions that take them. Thresholds, metric formulas and sla_registry are not changed.'
WHERE class = 'issue-100293' AND issue_id = 100293 AND status IN ('superseded', 'probe-review-refused') AND instr(verify_probe, 'FROM agent_issues WHERE id = 100293') > 0;

-- 2. Issue 100308: the decision for the model, read from the tables the evaluation and the canary write.
UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query',
  verify_probe = 'SELECT ''ok'' AS expected, CASE
  WHEN EXISTS (SELECT 1 FROM cf_model_catalog WHERE model_id = ''@cf/google/gemma-4-26b-a4b-it'' AND status = ''rejected'') THEN ''ok''
  WHEN EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = ''MODEL-@cf/google/gemma-4-26b-a4b-it'' AND (status = ''retired'' OR evidence LIKE ''BLOCKED:%'')) THEN ''ok''
  WHEN EXISTS (SELECT 1 FROM model_ladder_models WHERE id = ''@cf/google/gemma-4-26b-a4b-it'' AND active = 1)
    AND COALESCE((SELECT k.agreement FROM cf_model_canary k WHERE k.model_id = ''@cf/google/gemma-4-26b-a4b-it'' ORDER BY k.id DESC LIMIT 1), 0) >= 0.7 THEN ''ok''
  WHEN NOT EXISTS (SELECT 1 FROM model_ladder_models WHERE id = ''@cf/google/gemma-4-26b-a4b-it'') THEN ''pending: model_ladder_models has no row for the model, cf_model_canary holds no agreement of 0.7 or more for it and no rejection is recorded''
  WHEN EXISTS (SELECT 1 FROM model_ladder_models WHERE id = ''@cf/google/gemma-4-26b-a4b-it'' AND active = 1) THEN ''pending: the model is active in model_ladder_models but cf_model_canary holds no agreement of 0.7 or more for it and no rejection is recorded (catalog status '' || COALESCE((SELECT status FROM cf_model_catalog WHERE model_id = ''@cf/google/gemma-4-26b-a4b-it''), ''none'') || '')''
  ELSE ''pending: the model is inactive in model_ladder_models, cf_model_canary holds no agreement of 0.7 or more for it and no rejection is recorded (catalog status '' || COALESCE((SELECT status FROM cf_model_catalog WHERE model_id = ''@cf/google/gemma-4-26b-a4b-it''), ''none'') || '')'' END AS observed',
  last_verdict = NULL, attempts = 0, max_attempts = 24, deferred_since = NULL, next_due_at = datetime('now'),
  module = 'real-probes-3', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1,
  precondition = 'REAL-PROBES-3: issue 100308 (CF-MODEL-EVAL-1 notice for @cf/google/gemma-4-26b-a4b-it) is done when the decision is recorded, never when its own status changes. Owning loop: cf-model-eval in qnfo-model-eval, which filed the notice',
  action = 'MEASURES the decision. Reads ok when cf_model_catalog records the model as rejected, or the roadmap item MODEL-@cf/google/gemma-4-26b-a4b-it is retired or carries evidence that starts with BLOCKED:, or the model is active in model_ladder_models and cf_model_canary holds an agreement of 0.7 or more for it. Otherwise pending, naming what is missing. Read live 2026-10-20: the ladder row is an older one (tier 1, quality 62, active=1), the catalog reads in_production, cf_model_canary has no row for the model, cf_model_evals id 61 (cfmb-2) says promote, and MODEL-FLOOR-1 (scripts/model-floor-guard.mjs) lists gemma-4-26b as sub-frontier. The notice said the model was registered with active=0; decide() registers with INSERT OR IGNORE, which did nothing for a model already in the ladder. The fleet has no automatic path that records this decision for a chat-battery model (the canary exists for decision models only), so the doer is the cf-model-eval owner or the session that takes issue 100308: record the rejection as cf_model_catalog status rejected for the model with a note that names MODEL-FLOOR-1, or the adoption with a canary agreement, and the contract reads ok.'
WHERE class = 'issue-100308' AND issue_id = 100308 AND status IN ('superseded', 'probe-review-refused') AND instr(verify_probe, 'FROM agent_issues WHERE id = 100308') > 0;

-- 3. Issue 100314: a live contract with a probe of its own on issue 100308, read from remediation_contracts only.
UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query',
  verify_probe = 'SELECT ''ok'' AS expected, CASE
  WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = ''issue-100308'' AND c.issue_id = 100308 AND c.status IN (''active'', ''holding'') AND c.verify_transport = ''d1-query'' AND instr(c.verify_probe, ''needs-machine'' || ''-probe'') = 0 AND instr(c.verify_probe, ''agent_'' || ''issues'') = 0) THEN ''ok''
  WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = 100308) THEN ''pending: issue 100308 has no contract at all, a doer writes one''
  ELSE ''pending: the contract of issue 100308 is not active or holding on the d1-query transport with a probe of its own (a placeholder or a read of the issue table does not count), a doer writes one'' END AS observed',
  last_verdict = NULL, attempts = 0, max_attempts = 24, deferred_since = NULL, next_due_at = datetime('now'),
  module = 'real-probes-3', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1,
  precondition = 'REAL-PROBES-3: issue 100314 (PROBE-NEEDED-1 for issue 100308) is done when issue 100308 holds a live contract with a probe of its own',
  action = 'MEASURES the defect. Reads ok only when contract issue-100308 exists with status active or holding on the d1-query transport and a probe text that contains neither the needs-machine placeholder nor a read of the issue table. An absent contract reads pending, never ok. Rewritten from the probe PROBE-REVIEW-1 judged self-confirming (it read ok when issue 100308 was no longer open or when no contract existed).'
WHERE class = 'issue-100314' AND issue_id = 100314 AND status IN ('superseded', 'probe-review-refused') AND instr(verify_probe, 'agent_issues x WHERE x.id = 100308') > 0;

-- 4. Issue 100320: the doctor report on main, read by the consumer's code-read transport.
UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'code-read',
  verify_probe = '{"paths":["ci-status/applier-doctor.json"],"contains":"\"marker\": \"APPLIER-DOCTOR-2\"","absent":"\"scripts/checkin-scale-anchored-1-patch.py\""}',
  last_verdict = NULL, attempts = 0, max_attempts = 24, deferred_since = NULL, next_due_at = datetime('now'),
  module = 'real-probes-3', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1,
  precondition = 'REAL-PROBES-3: issue 100320 (APPLIER-ROT-ERROR for scripts/checkin-scale-anchored-1-patch.py) is done when the applier-doctor report on main no longer names the script, never when its own status changes',
  action = 'MEASURES the defect with a code-read probe (run by scripts/remediation_consumer.py against its checkout of main): ci-status/applier-doctor.json must contain the marker APPLIER-DOCTOR-2 (it is the doctor report) and must not name scripts/checkin-scale-anchored-1-patch.py in any list. Today it names the script under errored (ts 2026-10-20T08:23:21Z). The script now exits 0 and prints already applied when the worker carries SCALE-ANCHORED-1; the applier-doctor workflow runs on the push that merges the fix and commits the new report, which is what turns this probe ok.'
WHERE class = 'issue-100320' AND issue_id = 100320 AND status IN ('superseded', 'probe-review-refused') AND instr(verify_probe, 'FROM agent_issues WHERE id = 100320') > 0;

-- 5. The failure mode and its detector: the marker branch stays in the script on main.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('applier-version-step-not-idempotent',
  'a patch script dies with FAIL-CLOSED on its VERSION bump once the artifact has moved past the version string it knows, although its patch is on main, so applier-doctor counts it as an error and the rot triage files an issue no doer can clear by waiting',
  'scripts/checkin-scale-anchored-1-patch.py patched personal-companion/wellbeing-wire.js (already applied, printed as such) and then required the worker to carry VERSION 1.29.0 or 1.30.0. personal-companion moved on to 1.37.2, so the third step died with VERSION anchor not found (exit 1). applier-doctor classes an exit other than 0 or 3 as error, and ci-status/applier-doctor.json listed the script under errored (issue 100320, ts 2026-10-20T08:23:21Z)',
  'REAL-PROBES-3: the VERSION step treats a worker that carries the patch marker SCALE-ANCHORED-1 as already applied (exit 0, prints already applied); a worker with neither the marker nor a known version still dies closed. scripts/checkin-scale-anchored-1-patch.test.mjs proves both and runs applier-doctor over a throwaway git tree. Contract issue-100320 reads ci-status/applier-doctor.json on main until the script is named in no list',
  'fm-applier-version-step-not-idempotent (code-read: the marker branch is in scripts/checkin-scale-anchored-1-patch.py on main) and the doctor report ci-status/applier-doctor.json (APPLIER-ROT-TRIAGE-1), which contract issue-100320 reads',
  'fm-applier-version-step-not-idempotent', '2026-10-20', 100320,
  'a patch script whose last step bumps a version string by exact match runs on a tree where the patch is on main and the artifact has moved past that string',
  'applier-doctor lists the script under errored and APPLIER-ROT-TRIAGE-1 files an APPLIER-ROT-ERROR issue for a patch that is on main (issue 100320)',
  'every scripts/*patch*.py applier whose version step is an exact-match bump, and the issues the rot triage files for them');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-applier-version-step-not-idempotent', NULL, 'REAL-PROBES-3', 'failure-mode detector',
  '{"paths":["scripts/checkin-scale-anchored-1-patch.py"],"contains":"elif MARK in wsrc:"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 6. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a probe that reads the status of its own issue cannot pass while the issue is open, and a probe that passes on a state which predates the evaluation would close an issue on a decision nobody took, so each issue is measured by the records its definition of done names',
  'REAL-PROBES-3: migrations/2026-10-20-real-probes-3.sql re-points contracts issue-100293 (code_tasks merged share and queue in two windows, issue throughput), issue-100308 (decision records for @cf/google/gemma-4-26b-a4b-it), issue-100314 (a live contract with a probe of its own on issue 100308) and issue-100320 (code-read of ci-status/applier-doctor.json), adds the failure mode applier-version-step-not-idempotent with its detector, and scripts/checkin-scale-anchored-1-patch.py exits 0 when the worker carries SCALE-ANCHORED-1',
  'read 2026-10-20: all four contracts were circular or refused (superseded:closure-observing-probe-at-birth x3, probe-review-refused x1); v_sla_compliance code-task-merge queue 279.1 minutes; code_tasks merged 113 of 248 in the 7-day window and 71 of 181 in the window that ended 1440 minutes earlier; issues closed 959 against opened 943; model_ladder_models gemma-4-26b-a4b-it active=1 tier 1 with catalog status in_production, no cf_model_canary row, cf_model_evals id 61 verdict promote, and MODEL-FLOOR-1 listing the model as banned; ci-status/applier-doctor.json errored lists scripts/checkin-scale-anchored-1-patch.py and the old script exits 1 with FAIL-CLOSED on the real tree; the three d1-query probes were run read-only against qnfo-audit and observe pending, with the first failing clause named',
  'applied through the canonical path on merge; the applier-doctor workflow runs on the same push and commits the new report',
  'four remediation_contracts rows re-pointed and one detector contract, one failure mode and one backup table added; no worker, no agent_issues or issue_triage row, no secret; the applier fix changes one branch of a patch script that is not run by any workflow other than applier-doctor',
  'run the migration Rollback header: it restores the four contracts from bak_20261020_real_probes_3 (only while their module is still real-probes-3) and removes the detector contract and the failure mode (decision_log is append-only and keeps this row); the applier fix is reverted with git',
  'the four circular-probe issues carry probes that measure their definition of done, and an applier whose patch is on main exits 0 so applier-doctor stops counting it as an error',
  'contract issue-100293 observes pending: code-task-merge queue 279.1 min > 120 min SLA at its first read and ok only when queue, merged share (both windows) and issue throughput hold together; issue-100308 observes pending until the decision is recorded; issue-100314 reads ok at its first run because issue-100308 holds an active contract with a probe of its own, and the autoclose path closes it; issue-100320 observes present-marker:ci-status/applier-doctor.json until the next applier-doctor run on main commits a report without the script, then ok',
  'none',
  'migrations/real-probes-3.test.mjs (SQLite fixtures with the live column lists and triggers, each probe failing on a fixture shaped like today and passing on one shaped like done, the consumer''s own parse_code_probe and run_code_probe on the code-read probes), scripts/checkin-scale-anchored-1-patch.test.mjs (old script exits 1, new exits 0, applier-doctor over a throwaway git tree), scripts/applier-doctor.py run locally, and read-only runs of the three d1-query probes against live qnfo-audit'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REAL-PROBES-3:') = 1);
