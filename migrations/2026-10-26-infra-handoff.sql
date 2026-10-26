-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_rem_a6_handoff_desc b WHERE b.id = agent_issues.id) WHERE id IN (2596, 2754) AND EXISTS (SELECT 1 FROM bak_20261026_rem_a6_handoff_desc b WHERE b.id = agent_issues.id);
-- BACKUP: bak_20261026_rem_a6_handoff_desc
-- INFRA-HANDOFF-1 (2026-10-26, pillar autonomy; session rem-a6, infrastructure cluster of the 2026-10-26 issue remediation). Follow-up to INFRA-NOTES-1.
-- OWNER-NO-LOOSE-ENDS-1: a follow-up written down in a note is implemented or filed with a doer, and prose is not a record. Two of the notes of INFRA-NOTES-1 end in a bounded code change that no session of this run had time to make:
--   * 2596 GH-APP-FLEET-2     qnfo-ops uses the personal GitHub token at about 29 sites; the broker of qnfo-fleet-control is live and unused (broker_callers 13, app_calls 0)
--   * 2754 DEPLOY-NON-CANONICAL-DEPLOY  the nonCanon pass of qnfo-deploy-guard counts the Workers Builds stub (qnfo-workers, HTTP 410) because its newest code row is a reconcile row
-- Each issue gets one dated handoff paragraph with the change spelled out and a code-task line with a code-anchor line (ACT-BRIDGE-1), so the code loop opens the pull request, the merge runner merges on green and verifies live.
-- Both anchors occur exactly once in their file (checked in migrations/infra-handoff.test.mjs against this tree). The appended text is appended once (instr guard); the previous descriptions are kept in
-- bak_20261026_rem_a6_handoff_desc (created first, read by the Rollback line). Nothing is deleted. decision_log is only inserted into.

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_handoff_desc AS
SELECT id, description FROM agent_issues WHERE id IN (2596, 2754);

UPDATE agent_issues SET updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, description = description || char(10) || char(10) ||
 'REM-A6 2026-10-26 (handoff to the code loop, INFRA-HANDOFF-1): the change is bounded and its doer is the code loop. In qnfo-ops: (1) wrangler.toml declares a [[services]] binding GH_APP_BROKER to qnfo-fleet-control with props = { caller = "qnfo-ops" }; (2) worker.js gets a client that POSTs /gh-app/token through that binding, caches the installation token until five minutes before expires_at, and replaces env.GITHUB_TOKEN once per fetch, scheduled and queue invocation (wrap env at the entry, as __aiAttrEnv does at the top of fetch) with the personal token kept as the per-request fallback on 401, 403 or 404, as qnfo-fleet-control does; (3) /health answers gh_app ok only when the broker minted a token (a cached one counts) and gh_app pat-fallback otherwise, never a constant. Run the fleet-graph impact query on worker:qnfo-fleet-control first; the VERSION bump goes above main; the mirror stays identical; a suite proves the fallback and the cache. This issue closes on its own contract (qnfo-ops /health answers gh_app ok).' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-ops/worker.js' || char(10) ||
 'code-anchor: async fetch(request, env, ctx) {'
WHERE id = 2596 AND instr(description, 'REM-A6 2026-10-26 (handoff to the code loop') = 0;

UPDATE agent_issues SET updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, description = description || char(10) || char(10) ||
 'REM-A6 2026-10-26 (handoff to the code loop, INFRA-HANDOFF-1): the guard-side part is a bounded change in qnfo-deploy-guard/worker.js. The nonCanon pass reads the newest code row of every worker; for qnfo-workers, the Workers Builds stub that answers HTTP 410, that row is a RECONCILED-FROM-CF-API row written by the ledger reconcile, which is not a TOMBSTONE-STUB row, so the stub counts as a non-canonical deploy. Skip the worker in that pass while tombstoneBody(name) still verifies the stub (410, identical body on / and /__tombstone_probe, under 1024 bytes, the stub mark), so a stub that was replaced by real code is still flagged; add both cases to an offline suite of the worker; the VERSION bump goes above main; the mirror stays identical. The other four names are not guard defects: qnfo-artifacts is retired in the repository and still live in the account (the retirement lane removes it), qnfo-agents has a directory and no line in deploy-targets.txt (its owning session decides), voice-stt has no repository directory, q08-mind clears at its next canonical deploy. The ticket resolves itself (DEPLOY-TICKET-AUTORESOLVE-1) when the list is empty.' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-deploy-guard/worker.js' || char(10) ||
 'code-anchor: if (CONTAINER_WORKERS.indexOf(ncw) >= 0) { if (nlr.ok === 0) nonCanon.push(ncw); continue; }'
WHERE id = 2754 AND instr(description, 'REM-A6 2026-10-26 (handoff to the code loop') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a6',
  'a follow-up that is written down in a note and has no doer is a loose end; the code loop is the doer of a bounded change in one file, and a code-task line with an anchor that occurs exactly once is how it receives one',
  'INFRA-HANDOFF-1: issues 2596 and 2754 each get one dated handoff paragraph with the change spelled out, a code-task line and a code-anchor line; previous descriptions kept in bak_20261026_rem_a6_handoff_desc',
  'read in this session: qnfo-ops/worker.js has the entry async fetch(request, env, ctx) { once and about 29 uses of env.GITHUB_TOKEN; the broker answers gh_app ok with broker_callers 13 and app_calls 0; the nonCanon loop of qnfo-deploy-guard/worker.js has the container line once; /scan of qnfo-deploy-guard at 19:07Z lists qnfo-artifacts, voice-stt, q08-mind, qnfo-workers, qnfo-agents',
  'applied by migration',
  'two issue descriptions extended once; the code loop may open two pull requests, each behind the suites, the canary and the automatic revert',
  'the Rollback line restores both descriptions from the backup table',
  'open follow-ups carry a doer and an anchor instead of prose',
  'the code loop picks both issues up in v_issue_queue_v2 order and opens one pull request each',
  'no follow-up of this run is left as prose',
  'the anchors were counted in the files of main before the lines were written'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE instr(d.action, 'INFRA-HANDOFF-1: issues 2596 and 2754 each get') = 1);
