-- GITHUB-STUCK-RUNS-1 evidence (2026-10-26, pillar autonomy; agent_issues 1000275, follow-up to DELETE-STUCK-RUNS-1/-2, #4328 and #4388)
--
-- WHAT WAS MEASURED (github-settings-actions delete-stuck-runs, both runs with the repository credential QNFO_GH_PAT, run logs kept)
--   run 40290472819 (08:10Z, DELETE only):                 DELETE run 37655533507 -> HTTP 403 "Could not delete the workflow run"
--   run 40291331755 (08:18Z, force-cancel then delete):    POST force-cancel run 37655533507 -> HTTP 409 "Cannot cancel a workflow run that has not been queued yet."
--   The issue's own text recorded the same 409 for the session token (cancel and force-cancel) and 403 for the delete. So three endpoints and two credentials are
--   refused by GitHub's own run state, not by a missing right: the five runs queued since 2026-10-07 and the deploy-gate run in progress since 2026-10-22 are in a
--   state the API cannot move. No further API path exists for the fleet; the remaining steps are the repository owner's (the Actions page in the GitHub UI, or a
--   GitHub Support request), which is an owner-account act, so it is a human_actions card with an IDENTITY-BOUND line, its default in effect and a closing probe.
--   They hold no concurrency group (newer runs of the same workflows execute), so nothing is blocked; they only distort run counts and the Actions page.
--
-- WHAT THIS FILE DOES
--   1. appends the evidence above to issue 1000275 (the old text is saved in bak_20261026_stuck_runs_issue)
--   2. gives the issue a probe that can pass: the old one asked for zero queued runs in the whole repository, which any live queued run breaks (superseded as
--      probe-unusable). The new one counts queued runs created before 2026-10-20 (GitHub filters on created), 5 today, 0 when the owner's step is done
--   3. files the owner card github-wedged-runs-six, whose closing probe is the in-progress half (the one run created before 2026-10-24, 1 today)
--   4. records the decision
--   Note: the D1 trigger human_actions_default_adopt_ai (DEFAULT-ADOPTED-1, owner directive 2026-10-12) closes a non-decision card on its stated default at
--   birth, so the card reads resolved on the default "the six runs stay" and does not wait on the owner; the issue stays open on its dated probe, which is the
--   live check, and a refile or OWNER-STEPS-WATCH-1 brings the card back if the runs still matter.
-- No trigger, no cron, no DELETE or DROP.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_stuck_runs_issue b WHERE b.id = 1000275) WHERE id = 1000275 AND EXISTS (SELECT 1 FROM bak_20261026_stuck_runs_issue); UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261026_stuck_runs_contract b), status = (SELECT b.status FROM bak_20261026_stuck_runs_contract b), last_verdict = (SELECT b.last_verdict FROM bak_20261026_stuck_runs_contract b) WHERE class = 'issue-1000275' AND EXISTS (SELECT 1 FROM bak_20261026_stuck_runs_contract); UPDATE human_actions SET status = 'dismissed', resolution = 'rolled back 2026-10-26 (GITHUB-STUCK-RUNS-1 evidence)' WHERE slug = 'github-wedged-runs-six' AND status = 'open'

CREATE TABLE IF NOT EXISTS bak_20261026_stuck_runs_issue AS SELECT id, status, description FROM agent_issues WHERE id = 1000275;

CREATE TABLE IF NOT EXISTS bak_20261026_stuck_runs_contract AS SELECT class, verify_probe, verify_transport, status, last_verdict FROM remediation_contracts WHERE class = 'issue-1000275';

UPDATE agent_issues
SET description = description || char(10) || char(10) || 'EVIDENCE 2026-10-26 (DELETE-STUCK-RUNS-1/-2, QNFO_GH_PAT, runs 40290472819 and 40291331755): DELETE run 37655533507 answered 403 "Could not delete the workflow run"; POST force-cancel run 37655533507 answered 409 "Cannot cancel a workflow run that has not been queued yet." Delete, cancel and force-cancel are all refused with two credentials, so GitHub holds these six runs (37655533507, 37642398490, 37642398493, 37642398499, 37642398494 queued since 2026-10-07; 39698201166 in progress since 2026-10-22) in a state the API cannot change. The fleet has no further path: the step is the repository owner''s (card github-wedged-runs-six: delete or cancel in the Actions UI, else a GitHub Support request). Closing probe below counts the queued half (5 today); the card probes the in-progress run (1 today).' || char(10) || char(10) || 'runtime-probe: {"url": "https://api.github.com/repos/QNFO/qnfo-workers/actions/runs?status=queued&created=%3C2026-10-20&per_page=1", "status": 200, "contains": "\"total_count\":0"}'
WHERE id = 1000275 AND status NOT IN ('closed', 'resolved') AND instr(description, 'EVIDENCE 2026-10-26 (DELETE-STUCK-RUNS-1/-2') = 0;

UPDATE remediation_contracts
SET verify_probe = '{"url": "https://api.github.com/repos/QNFO/qnfo-workers/actions/runs?status=queued&created=%3C2026-10-20&per_page=1", "status": 200, "contains": "\"total_count\":0"}',
    verify_transport = 'runner-https',
    status = 'active',
    last_verdict = NULL
WHERE class = 'issue-1000275' AND status = 'superseded' AND last_verdict LIKE 'superseded:probe-unusable%';

INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source, created_at, updated_at)
SELECT 'github-wedged-runs-six', 'Delete or cancel six workflow runs that GitHub holds in a state its API cannot change (five queued since 2026-10-07, one in progress since 2026-10-22)',
  'IDENTITY-BOUND: the repository owner''s own GitHub account (the Actions page in the web UI, or a GitHub Support request filed by the account holder). Measured 2026-10-26: with the repository credential QNFO_GH_PAT, DELETE answers 403 "Could not delete the workflow run" and cancel and force-cancel answer 409 "Cannot cancel a workflow run that has not been queued yet." (runs 40290472819 and 40291331755 of github-settings-actions); the session token gets the same 409. Three endpoints and two credentials are refused by GitHub''s run state, so the fleet has no path left. The runs hold no concurrency group; they only distort run counts and the Actions page.',
  'The six runs stay as they are; nothing is blocked. The fleet keeps skipping them (delete-stuck-runs lists them as candidates and stops at the first refusal).',
  'github.com/QNFO/qnfo-workers/actions > filter Status: Queued, then open each run (37655533507, 37642398490, 37642398493, 37642398499, 37642398494) and use Cancel run or the three-dot menu Delete workflow run; do the same for deploy-gate run 39698201166 (Status: In progress). If the UI refuses too, file a GitHub Support request (support.github.com, Actions) naming the run ids and "queued since 2026-10-07, cannot be cancelled or deleted". Closes when both read 0: https://api.github.com/repos/QNFO/qnfo-workers/actions/runs?status=queued&created=%3C2026-10-20&per_page=1 and https://api.github.com/repos/QNFO/qnfo-workers/actions/runs?status=in_progress&created=%3C2026-10-24&per_page=1 (total_count).',
  'https://github.com/QNFO/qnfo-workers/actions', 'low', 'open', 'session:DELETE-STUCK-RUNS-2', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = 'github-wedged-runs-six');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-code-session_015kWmGuAq2fNuvzu4MrD7x3',
  'a refusal that GitHub gives for the run state, on every endpoint and with both credentials, is the answer: the fleet states it with its text, gives the issue a probe that can pass, and hands the owner-account step over as a card; it does not look for a way around the refusal',
  'GITHUB-STUCK-RUNS-1: records the refusal evidence on issue 1000275, replaces its unusable probe with a dated queued-run count, files the IDENTITY-BOUND card github-wedged-runs-six',
  'run 40290472819 DELETE -> 403, run 40291331755 POST force-cancel -> 409 (QNFO_GH_PAT); live dated counts 2026-10-26 08:2xZ: queued before 2026-10-20 = 5, in progress before 2026-10-24 = 1; the issue text records the session token 409 on cancel and force-cancel',
  'migration merged', 'one issue description, one contract row, one owner card (low); no worker, no cron', 'the Rollback header restores the description and the contract from the two bak_ tables and dismisses the card',
  'the fleet has a delete-stuck-runs action that force-cancels before it deletes and records any refusal verbatim',
  'issue 1000275 closes by its own probe once the owner has removed the five queued runs; the card closes when the in-progress run is gone too',
  'run counts and the Actions page stop carrying six dead rows',
  'github-settings-actions delete-stuck-runs live twice (delete, then force-cancel and delete), api.github.com runs list with the created filter, the issue text'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'GITHUB-STUCK-RUNS-1: records the refusal evidence') = 1);
