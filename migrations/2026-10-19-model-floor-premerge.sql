-- MODEL-FLOOR-PREMERGE-1 (2026-10-19, charter pillar: autonomy; agent_issues 100121). PR 2753 (qnfo-ops 2.50.0) merged with the cf_docs tool
-- description naming a banned sub-frontier model inside a string literal; model-floor-guard failed on the push to main (run 39233050805,
-- ci-watchdog 2767) and every later push on a worker path would have failed the same way until a fix merged. The workflow triggered on push to
-- main, the 2-hourly schedule and workflow_dispatch only. It now also runs on pull_request in diff mode (scripts/model-floor-guard.mjs --base):
-- the repo-source scan only, no token and no live sweep, failing for a violation the change ADDS and never for debt already on main, so an
-- unrelated pull request is not blocked while main is red. This is a new gate, so it gets its control_registry row here (disposition keep,
-- not on the critical path; the tested alternate is the existing post-merge run and the schedule, both unchanged).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control = 'model_floor_pr_check'

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id)
VALUES ('model_floor_pr_check', '.github/workflows/model-floor-guard.yml (pull_request) + scripts/model-floor-guard.mjs --base', 'gate',
 'a pull request that adds a banned sub-frontier model name to a worker source reaching main before the guard can speak', 0, 'keep', 'applied',
 'the post-merge push run and the 2-hourly schedule of the same workflow (unchanged); scripts/model-floor-guard.test.mjs replays the added, inherited, moved and removed cases',
 'PR 2753 merged qnfo-ops 2.50.0 with a banned model in the cf_docs description at 09:50Z 2026-10-19; model-floor-guard went red on main (ci-watchdog 2767) and stayed red until qnfo-ops wording fix 2.50.1. Diff mode: 9-check suite scripts/model-floor-guard.test.mjs.', 100121);
