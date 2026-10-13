-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE instr(title, 'ERRATA-INTERNAL-CONFIRM-1:') = 1 AND status = 'open'; DELETE FROM remediation_contracts WHERE class = 'fm-internal-errata-dead-end'; DELETE FROM failure_modes WHERE fm_key = 'internal-errata-dead-end'
-- ERRATA-INTERNAL-CONFIRM-1 (2026-10-13, pillars research and reach; metric paper_render_defect_pages 2).
-- errata_queue rows in status 'internal-open' are written by three paths: errata-hub's POST /internal-errata, its :00
-- ERRATA-INTERNAL-SWEEP-1 and qnfo-paper-reviser REVISER-FLAGGED-DEADEND-1. All three are now members of qnfo-research-exec, and
-- no code reads them. The design says "a single-model finding reaches no reader: a second model must confirm it first", but no step
-- confirms one: errata-respond selects status 'detected' and errata-publish selects drafted errata_actions. Row 6
-- (repro-18133065-v1-trajectory) has waited since 2026-10-06 11:48 UTC and row 7 (render-scale-invariant-physics-math-1, filed by this
-- session at 08:34 UTC) since 09:01 UTC; errata_actions holds 2 rows, both from September. The render defect behind
-- paper_render_defect_pages cannot be corrected by the pipeline that is meant to correct it.
-- (1) The issue below hands the confirm step to the code loop (one file, qnfo-research-exec/worker.js, anchored on the internal sweep).
-- (2) The failure mode is recorded with a d1-query detector: no internal-open row older than 24 hours. It reads failing until the fix
--     lands, because the condition is real now.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ERRATA-INTERNAL-CONFIRM-1: internal errata wait in internal-open forever; nothing confirms them, so no correction is drafted',
  'Charter pillar: research. errata_queue rows in status internal-open (written by ERRATA-INTERNAL-SWEEP-1, POST /internal-errata and qnfo-paper-reviser REVISER-FLAGGED-DEADEND-1, all members of qnfo-research-exec) are read by no code: errata-respond selects status ''detected'' and errata-publish selects drafted errata_actions. The design comment asks for a second-model confirmation first; that step does not exist. Row 6 waits since 2026-10-06, row 7 (render-scale-invariant-physics-math-1, 151 plain-text formulas behind paper_render_defect_pages) since 2026-10-13 09:01 UTC; errata_actions has 2 rows, both from September.'
  || char(10) || char(10) ||
  'Edit (qnfo-research-exec/worker.js only, the folded errata member): right after sweepInternalErrata, add confirmInternalErrata(env), called from the same :00 watch tick after the sweep. It reads up to 3 errata_queue rows WHERE status = ''internal-open'' AND created_at < datetime(''now'', ''-30 minutes'') ORDER BY id. For each it loads the paper text (papers.body_md by slug in paper_doi, through the binding the respond step already uses) and asks one Workers AI model of a family other than the finding''s (gpt-oss-120b when the sender names qnfo-paper-reviser, otherwise kimi-k2.6 with thinking off) whether the claim is true of the text, answering JSON {"confirmed": true|false, "why": "..."}. Confirmed: UPDATE status = ''detected'' (errata-respond then drafts errata_actions as for an inbound erratum). Not confirmed: UPDATE status = ''rejected'' and set internal_errata.status = ''rejected'' with the why. A finding whose sender names RENDER-HEALTH (a deterministic render measurement) is confirmed without a model call. Unreadable or failed calls leave the row for the next tick and log console.error. Bump the host VERSION (patch) and the member ERRATA_VERSION, keep deployed-current.worker.js identical, and add a test that an internal-open row older than 30 minutes moves to detected on confirmation and to rejected otherwise.'
  || char(10) || 'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js'
  || char(10) || 'code-anchor: async function sweepInternalErrata(env) {'
  || char(10) || 'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "confirmInternalErrata("}',
  'session_01Kddqwk5gQT5qSSHVKjT2EA', 'reliability', 'high', 'open',
  CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE instr(title, 'ERRATA-INTERNAL-CONFIRM-1:') = 1);
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('internal-errata-dead-end', 'an internal erratum (render sweep, reviser, audit) waits in errata_queue status internal-open with no reader, so no correction is ever drafted or published',
  'the three internal intake paths write status internal-open so the email-driven respond and publish crons never act on an unconfirmed finding, and the confirmation step that should move a confirmed finding to detected was never built',
  'ERRATA-INTERNAL-CONFIRM-1 (agent_issues, code loop, qnfo-research-exec): a cross-family confirmation moves an internal-open row to detected or rejected; deterministic render findings are confirmed directly',
  'no errata_queue row has status internal-open for more than 24 hours', 'fm-internal-errata-dead-end', '2026-10-06', NULL,
  'any internal finding about published text', 'errata_queue rows internal-open for days; errata_actions empty since September; render defects persist', 'every internal correction of a published paper');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-internal-errata-dead-end', NULL, 'ERRATA-INTERNAL-CONFIRM-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM errata_queue WHERE status = ''internal-open'' AND datetime(created_at) < datetime(''now'', ''-24 hours'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
UPDATE remediation_contracts SET verify_transport = 'd1-query',
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM errata_queue WHERE status = ''internal-open'' AND datetime(created_at) < datetime(''now'', ''-24 hours'')) AS TEXT) AS observed'
WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE instr(title, 'ERRATA-INTERNAL-CONFIRM-1:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a queue that no code reads is a dead end, whatever its intake writes',
  'ERRATA-INTERNAL-CONFIRM-1: the missing confirmation step for internal errata is filed for the code loop on qnfo-research-exec, with a failure-mode detector on the age of internal-open rows',
  'errata_queue rows 6 (internal-open since 2026-10-06 11:48 UTC) and 7 (since 09:01 UTC today); errata_actions 2 rows, both from September; no code selects status internal-open (grep of qnfo-research-exec, errata-hub, qnfo-paper-reviser on main)',
  'filed', 'the internal errata path of qnfo-research-exec', 'the Rollback line of this file',
  'internal findings reach a correction', 'the code loop opens a task for the issue within 3 hours of the qnfo-research-exec file claim freeing, and errata_queue row 7 leaves internal-open within 24 hours of that task merging', 'readers of scale-invariant-physics see typeset formulas',
  'd1:errata_queue, errata_actions, internal_errata; code:qnfo-research-exec sweepInternalErrata, errata respond select'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'ERRATA-INTERNAL-CONFIRM-1:') = 1);
