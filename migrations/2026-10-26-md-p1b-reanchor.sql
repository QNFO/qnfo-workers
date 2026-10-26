-- MD-P1B-REANCHOR-1 (2026-10-26, charter pillar autonomy; metric guard_rcs = 1, the deploy-gate guard red on every push to main since 15:05Z).
-- What happened: code task ct_im1000430 (issue 1000430, BREACH-DOCTOR-1: MD-P1b) merged as PR 4649 and rewrote the one comparison its code-anchor named,
-- in evaluateMetricTriggers. Two more functions of qnfo-fleet-control/worker.js end in the same shape, "op === "eq" ? v === thr : v >= thr;" (an unknown
-- operator reads as gte): ilTriggerHit (the relapse check) and perfBreaches (the perf strategy check). So the issue's code-probe ("absent") still fails, and:
--   1. the anchor line (var hit = ...) no longer occurs in the file, so the lever has no anchor the code loop can edit; intakeRetryDecision answers
--      "merged; the issue closes on its own probe" for a merged task, so no second task is ever built: the issue is stranded open;
--   2. migrations/metric-playbooks.test.mjs asserts that an open lever's anchor occurs exactly once (or that its probe passes), so it has failed since 15:05Z
--      ("FAIL MD-P1b: the code-anchor occurs exactly once ... :: 0"), deploy-gate (SUITE-RUNNER-1, strict on main) is red on every push (runs 40355983220 and
--      40356273738 read live), and metric guard_rcs reads 1 (deploy-gate is the one failing guard of five).
-- Fix, with no edit to the claimed qnfo-fleet-control/worker.js: re-anchor the issue on ilTriggerHit (it occurs once) and queue one code task per remaining
-- site, ct_im1000430b (ilTriggerHit) and ct_im1000430c (perfBreaches), each with its own single-line anchor, so the fleet doer finishes the lever. The probe of
-- the issue is unchanged: it stays the closing probe and passes only when no comparison on main is left in the unknown-operator-reads-as-gte shape.
-- The suite learns that a lever re-anchored by a later migration is not an orphan (metric-playbooks.test.mjs reads this file); md-p1b-reanchor.test.mjs
-- proves the new anchors and tasks.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = replace(description, 'code-anchor: function ilTriggerHit(tp, value) {', 'code-anchor: var hit = op === "gt" ? v > thr : op === "lte" ? v <= thr : op === "lt" ? v < thr : op === "eq" ? v === thr : v >= thr;') WHERE title LIKE 'BREACH-DOCTOR-1: MD-P1b %' AND status = 'open'; UPDATE code_tasks SET status = 'superseded', step = 'done' WHERE id IN ('ct_im1000430b', 'ct_im1000430c') AND status IN ('queued', 'failed')

UPDATE agent_issues
SET description = replace(description,
      'code-anchor: var hit = op === "gt" ? v > thr : op === "lte" ? v <= thr : op === "lt" ? v < thr : op === "eq" ? v === thr : v >= thr;',
      'code-anchor: function ilTriggerHit(tp, value) {')
    || char(10) || '(MD-P1B-REANCHOR-1 2026-10-26: ct_im1000430 merged as PR 4649 and fixed evaluateMetricTriggers only. The code-probe above still fails because ilTriggerHit and perfBreaches in the same file keep the shape "op === "eq" ? v === thr : v >= thr;". The first anchor no longer occurs, so the lever is re-anchored on ilTriggerHit and two code tasks, ct_im1000430b (ilTriggerHit) and ct_im1000430c (perfBreaches), finish it, one site each. This issue closes on the code-probe above when both land.)',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE title LIKE 'BREACH-DOCTOR-1: MD-P1b %' AND status = 'open'
  AND instr(description, 'code-anchor: var hit = op === "gt" ? v > thr : op === "lte" ? v <= thr : op === "lt" ? v < thr : op === "eq" ? v === thr : v >= thr;') > 0;

INSERT OR IGNORE INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, created_at, updated_at)
SELECT 'ct_im' || a.id || 'b', 'qnfo-workers', 'qnfo-fleet-control/worker.js',
  '[issue #' || a.id || '] BREACH-DOCTOR-1: MD-P1b qnfo-fleet-control an operator outside gt, gte, lt, lte, eq is unreadable, never read as gte' || char(10) ||
  'Remaining site 1 of 2 (PR 4649 fixed evaluateMetricTriggers only). In the function ilTriggerHit, an operator outside gt, gte, lt, lte, eq must be unreadable and never hit (return false), not read as gte. Keep the symbol forms > >= < <= = == accepted the way evaluateMetricTriggers now accepts them. Do not edit perfBreaches or evaluateMetricTriggers in this task. Keep every behaviour the worker suites pin; change only this comparison. Definition of done: the text ": op === "eq" ? v === thr : v >= thr;" no longer occurs in ilTriggerHit.',
  'queued', 'read', 0, json_object('anchor', 'function ilTriggerHit(tp, value) {'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM agent_issues a
WHERE a.title LIKE 'BREACH-DOCTOR-1: MD-P1b %' AND a.status = 'open'
  AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.id = 'ct_im' || a.id || 'b');

INSERT OR IGNORE INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, created_at, updated_at)
SELECT 'ct_im' || a.id || 'c', 'qnfo-workers', 'qnfo-fleet-control/worker.js',
  '[issue #' || a.id || '] BREACH-DOCTOR-1: MD-P1b qnfo-fleet-control an operator outside gt, gte, lt, lte, eq is unreadable, never read as gte' || char(10) ||
  'Remaining site 2 of 2 (PR 4649 fixed evaluateMetricTriggers only). In the function perfBreaches, an operator outside gt, gte, lt, lte, eq must be unreadable and never breach (return false), not read as gte. Keep the symbol forms > >= < <= = == accepted. Do not edit ilTriggerHit or evaluateMetricTriggers in this task. Keep every behaviour the worker suites pin; change only this comparison. Definition of done: the text ": op === "eq" ? v === thr : v >= thr;" no longer occurs in perfBreaches.',
  'queued', 'read', 0, json_object('anchor', 'function perfBreaches(op, thr, v) {'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM agent_issues a
WHERE a.title LIKE 'BREACH-DOCTOR-1: MD-P1b %' AND a.status = 'open'
  AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.id = 'ct_im' || a.id || 'c');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-infra-breach-remediation',
  'a lever whose first code task merged but whose probe still fails needs a new anchor and a new task, and a suite that asserts the old anchor is a stale assertion, not a defect to hide',
  'MD-P1B-REANCHOR-1: issue MD-P1b re-anchored on ilTriggerHit; code tasks ct_im1000430b and ct_im1000430c queued for ilTriggerHit and perfBreaches; metric-playbooks.test.mjs reads this migration',
  'deploy-gate runs 40355983220 and 40356273738 on main failed only in migrations/metric-playbooks.test.mjs (MD-P1b anchor count 0); qnfo-fleet-control/worker.js holds the shape at the lines of ilTriggerHit and perfBreaches after PR 4649; guard_rcs read 1',
  'applied by migration', 'two queued code tasks and one issue description; no worker change in this file', 'the Rollback line',
  'a partially landed lever gets its remaining sites queued without a session', 'deploy-gate green on the next push to main, guard_rcs 0 within an hour; issue 1000430 closes on its own code-probe once both tasks merge', NULL, 'node migrations/md-p1b-reanchor.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'MD-P1B-REANCHOR-1:%');
