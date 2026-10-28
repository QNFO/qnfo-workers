-- GATE-AUDIT-1 (2026-10-28, charter pillar autonomy; OWNER-NO-LOOSE-ENDS-1): files one issue per MODEL-ONLY row of docs/DETERMINISTIC-GATE-AUDIT.md
-- (RM-DETERMINISTIC-GATE-AUDIT-1, source arXiv 2609.02246). The seven PARTIAL rows are listed in the doc with their hardening and are not filed here.
-- Each row names a code-task whose code-anchor occurs exactly once in the file (checked with grep -c on main at 54eb9f1c) and a code-probe that closes it.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'GATE-AUDIT-1 #%';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'GATE-AUDIT-1 #1: qnfo-ops cf_worker_deploy deploys model-authored JS with no non-model gate',
 'docs/DETERMINISTIC-GATE-AUDIT.md row 1 (MODEL-ONLY). The chat tool cf_worker_deploy in qnfo-ops deploys whatever JS the ops agent passes, live, through the CF API. Its own tool description says it does not validate JS syntax; the expected_version and downgrade guards run only if the model supplies expected_version; the deploy ledger row is written after the deploy; main has no branch protection (docs/QUNIVERSE-CHARTER.md). Lever: when the call does not come from the canonical deploy route, require sha256(content) to equal the sha256 of the worker.js on main at a named ref (read from GitHub), run the code-orchestrator JS parse check, and refuse a control-plane worker unless the caller holds the file:<worker>/worker.js work claim. Mark the new check with a comment containing GATE-AUDIT-1:cf_worker_deploy. Revert: ops_config cf_worker_deploy_main_only = off. Prediction: deploys of bytes not on main fall to 0 per week (deployment_history rows whose notes carry no commit sha).

code-task: repo=qnfo-workers path=qnfo-ops/worker.js
code-anchor: const _CONTAINER_WORKERS = ["qnfo-containers-pilot"];
code-probe: {"paths": ["qnfo-ops/worker.js"], "contains": "GATE-AUDIT-1:cf_worker_deploy"}',
 'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'GATE-AUDIT-1 #1:%' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'GATE-AUDIT-1 #2: qnfo-ops github_file_write and github_pr can write to main with no path or branch gate',
 'docs/DETERMINISTIC-GATE-AUDIT.md row 2 (MODEL-ONLY). githubFileWrite in qnfo-ops PUTs any path of any repo, to the default branch when no branch is given. docs/QUNIVERSE-CHARTER.md says main has no branch protection, so no CI runs before such a commit lands. Lever: refuse a write whose branch is the default branch, refuse .github/ paths, gate-script paths and control-plane worker paths (reuse the cmScope and CM_SCRIPT_DENY patterns from qnfo-fleet-control), and cap bytes per call, so the change goes through a pull request and the stale-PR lane or the code loop merge runner. Mark the check with a comment containing GATE-AUDIT-1:github_file_write. Revert: ops_config github_write_default_branch = allow. Prediction: commits to main authored by qnfo-ops outside the canonical deploy fall to 0 per week.

code-task: repo=qnfo-workers path=qnfo-ops/worker.js
code-anchor: async function githubFileWrite(env, args) {
code-probe: {"paths": ["qnfo-ops/worker.js"], "contains": "GATE-AUDIT-1:github_file_write"}',
 'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'GATE-AUDIT-1 #2:%' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'GATE-AUDIT-1 #3: qnfo-ops ops_d1_write destructive gate is satisfied by the model own confirm flag',
 'docs/DETERMINISTIC-GATE-AUDIT.md row 3 (MODEL-ONLY). d1Write in qnfo-ops treats a statement as destructive only for DROP, TRUNCATE, or DELETE/UPDATE without WHERE, and accepts args.confirm === true (set by the model in the same call) or a regex over the user text (yes, please, do it, execute ...) as the confirmation. A DELETE or UPDATE with a WHERE clause is never gated, including on qnfo-audit control tables. Lever: a protected-table list (ops_config, fleet_budget, metric_registry, control_registry, analytics_metric_triggers, sla_registry, spof_registry) refused unless the call supplies a live work-claim token for d1:<table>; run the WHERE as SELECT COUNT(*) first and refuse more than 50 rows without a named BACKUP table; stop using args.confirm or user text as authority for DELETE or UPDATE. Revert: ops_config d1_write_guard = off. Prediction: control-table writes by qnfo-ops without a claim fall to 0.

code-task: repo=qnfo-workers path=qnfo-ops/worker.js
code-anchor: if (destructive && args && args.confirm !== true && !affirmed) return
code-probe: {"paths": ["qnfo-ops/worker.js"], "absent": "if (destructive && args && args.confirm !== true && !affirmed) return"}',
 'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'GATE-AUDIT-1 #3:%' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'GATE-AUDIT-1 #4: qnfo-intent-orchestrator promotes and rejects intents on a model score alone',
 'docs/DETERMINISTIC-GATE-AUDIT.md row 4 (MODEL-ONLY). triageIntent promotes an intent to a research candidate when scoreOf (a weighted sum of four model-assigned numbers) reaches PROMOTE_THRESHOLD, and rejects it when the model sets is_noise. The candidate is then dispatched and spends a research run. Only the isNoise regex and the embedding dedup run before the model; nothing follows it. Lever: a per-day cap on promotions (ops_config intent_promote_per_day), a deterministic second condition for promotion (dedup against papers by embedding distance and at least one resolvable slug or citation in the question), and a ledger row with the model reason for every model rejection so a probe can sample them; a model is_noise is not terminal for an owner-sourced intent. Mark the cap with a comment containing GATE-AUDIT-1:intent_promote. Revert: raise the cap, or set status = pending on the rejected rows. Prediction: promotions per day stay at or below the cap and sampled rejects show a false-reject share under 10 percent.

code-task: repo=qnfo-workers path=qnfo-intent-orchestrator/worker.js
code-anchor: if (score >= PROMOTE_THRESHOLD) {
code-probe: {"paths": ["qnfo-intent-orchestrator/worker.js"], "contains": "GATE-AUDIT-1:intent_promote"}',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'GATE-AUDIT-1 #4:%' AND status = 'open');
