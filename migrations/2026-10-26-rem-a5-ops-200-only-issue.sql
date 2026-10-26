-- REM-A5-OPS-200-ONLY-1 (2026-10-26, charter pillar autonomy; metric guard_rcs, trigger 361, ticket 2670). Files the one open defect behind the deploy-gate failure of run 40379913871 as an issue with a doer:
-- WORKERS-STANDARDS-GUARD-1 refused qnfo-ops/worker.js:501 [write-200-only] on the push of PR 4764 (qnfo-ops 2.59.0, 18:41:08Z): after the PATCH that closes a pull request, github_pr_close tests
-- `cl2.status !== 200`, so a 201 or 204 would read as a failure. The guard compares each push with HEAD~1, so only that push failed; the line is still in the file on main (read 2026-10-26 20:02Z)
-- and any later change that touches it fails the gate again. The finding was a comment on PR 4764 and a note on ticket 2670; this file gives it a doer (the code loop reaches qnfo-ops since
-- CODE-LOOP-CONTROL-PLANE-1) and a closing probe that reads the file on main. The issue source starts with session so the planner may take it; the anchor sits on the PATCH line next to the edit.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'WORKERS-STANDARDS-200-ONLY-1:%' AND source = 'session-rem-a5' AND status = 'open'
-- spof-review: adds no cron, D1 trigger, external host or credential; one issue.

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'WORKERS-STANDARDS-200-ONLY-1: qnfo-ops/worker.js github_pr_close accepts only HTTP 200 after a PATCH (write-200-only), the violation behind deploy-gate run 40379913871',
  'Charter pillar: autonomy. Measured 2026-10-26: deploy-gate main run 40379913871 (push 5de2acaa, PR 4764, qnfo-ops 2.59.0, 18:41:08Z) failed at WORKERS-STANDARDS-GUARD-1: qnfo-ops/worker.js:501 [write-200-only] "a write succeeded with any 2xx (201 Created, 204 No Content): accept 200 <= status < 300 or r.ok, not only 200". The line is `if (cl2.status !== 200) return { ok: false, error: "GitHub " + cl2.status + ...` after the PATCH in github_pr_close. The guard compares each push with HEAD~1, so only that push failed, but the line is still on main and the next change that touches it fails the gate again (guard_rcs reads 1 on each such push).' || char(10) ||
  'Edit (one file): test the status of that PATCH as 200 <= status < 300 (or its ok flag, whichever githubApi returns), keep the error text and the number field of the failure result, bump VERSION, keep deployed-current.worker.js identical. Do not mark the line standards-ok: GitHub answers 200 today but the rule is right for a write.' || char(10) ||
  'Definition of done: the closing probe below passes (the old test is gone from main), the qnfo-ops suites pass and the next deploy-gate main run is green.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-ops/worker.js' || char(10) ||
  'code-anchor: const cl2 = await githubApi(env, "PATCH", "/repos/" + encPath(repo) + "/pulls/" + number, { state: "closed" });' || char(10) ||
  'code-probe: {"paths": ["qnfo-ops/worker.js"], "absent": "if (cl2.status !== 200)"}',
  'session-rem-a5', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title LIKE 'WORKERS-STANDARDS-200-ONLY-1:%' AND a.status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'a guard violation that is still in the file after the failing push is a defect with a doer, not a comment on a merged pull request',
  'REM-A5-OPS-200-ONLY-1: issue WORKERS-STANDARDS-200-ONLY-1 filed with a code-task, an anchor on the PATCH line and a code-probe that reads qnfo-ops/worker.js on main',
  'gh api actions run 40379913871: failure at WORKERS-STANDARDS-GUARD-1, qnfo-ops/worker.js:501 [write-200-only]; origin/main 2026-10-26 20:02Z still holds `if (cl2.status !== 200)` once; the anchor line occurs once; qnfo-ops is changeable by the code loop since CODE-LOOP-CONTROL-PLANE-1; the file is claimed by rem-a6',
  'applied by migration', 'one agent_issues row (and its contracts made by the D1 triggers); no code change', 'the Rollback line closes the issue',
  'the guard finding has a doer and a closing probe', 'none: the fix is code in qnfo-ops (the issue is the record)', 'none',
  'github:actions run log; git:origin/main qnfo-ops/worker.js; d1:agent_issues'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-OPS-200-ONLY-1:%');
