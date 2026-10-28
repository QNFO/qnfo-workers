-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261028_cfa_contracts b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261028_cfa_contracts b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261028_cfa_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261028_cfa_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261028_cfa_contracts); UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261028_cfa_issues b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261028_cfa_issues); UPDATE postmortems SET root_cause = (SELECT b.root_cause FROM bak_20261028_cfa_pm b WHERE b.incident_key = postmortems.incident_key) WHERE incident_key IN (SELECT incident_key FROM bak_20261028_cfa_pm); UPDATE research_queue SET status = (SELECT b.status FROM bak_20261028_cfa_rq b), stage = (SELECT b.stage FROM bak_20261028_cfa_rq b), error = (SELECT b.error FROM bak_20261028_cfa_rq b) WHERE id = 'ac9cce13-f637-4a7f-abbe-7a02e5e2d884'; UPDATE issue_triage SET triage_state = 'triaged', close_evidence = NULL WHERE owner = 'cluster-f-a' AND issue_id IN (1000585, 1000248); UPDATE agent_issues SET status = 'open', close_channel = NULL WHERE id IN (1000585, 1000248) AND close_channel = 'session:cluster-f-a'; the tool_error_exclusions row 'Unexpected token' (issue_id 1000735) is removed with: DELETE FROM tool_error_exclusions WHERE pattern = 'Unexpected token' AND issue_id = 1000735
-- BACKUP: bak_20261028_cfa_contracts
--
-- CLUSTER-F-A drain of no-doer issues (2026-10-28, charter pillar autonomy; agent_issues 1000002, 1000678, 1000735, 1000619, 1000637, 1000639, 1000651, 1000248, 1000585, 100310, 100362 and the notes on the others).
-- Every statement below states the measurement it rests on (read 2026-10-28 from qnfo-audit, living-paper, the live hosts and git):
--
--  1000002 Errata chain: the integration monitor (qnfo-observability INTEGRATION_CHAINS, ERRATA-CHAIN-DRAINING-1) reads the chain "draining" (453 waiting, consumer advanced 4 minutes ago), internal-open is 5 (the confirm tick settles
--          at most errata_confirm_max an hour) and errata_actions holds 8 verified rows. The closing probe failed on a third clause, notes_publish_queue >= 1, a different queue (the owner's notes flagged "publish" in front matter, calendar-api
--          and notes-intake) that has no link to the errata chain and is empty by design. The probe now reads the chain's own conditions: internal-open under 50, a verified action, and a queue row moved in the last 3 hours.
--  1000678 travel.q08.org: 9 of 38 hourly availability samples failed, every one "status 401 in 5.3 to 6.0 s" (the sign-in wall answered, but over the SLI's 5 s limit). The postmortems said client-error, which the SLI accepts for 401;
--          the class was wrong (scripts/bp26_slo.py SLO-SLOW-CLASS-1) and the cause is personal-companion ensureTravel, which ran every CREATE and default INSERT on each request (1.44.2 TRAVEL-ENSURE-ONCE-1).
--          The probe now measures the outcome: at least 12 samples in the last 24 hours and none failed. Prediction: 9/38 (24 percent) failing samples fall to 0 within 24 hours of the deploy; falsifier: a sample over 5 s after the deploy.
--  1000735 run_code_net: the one error in 24 h was the agent's own code, "Unexpected token '('" from a bare expression passed to the sandbox (JavaScript parse error of the supplied code), which is the class tool_error_exclusions already holds
--          as agent-input-error for "SyntaxError", "invalid regex" and "malformed JSON". The V8 message has no "SyntaxError" prefix, so it filed TOOL-FAILURE. A pattern is added, and the probe now ignores the same excluded classes as
--          the filing trigger tool_error_files_issue_v2, so with 5 calls in 24 h one agent syntax slip is no longer 20 percent of a failing tool.
--  1000619 /sla-gap: the code task failed three times because it named qnfo-backlog-exec/worker.js, a FOLDED member that must stay line-identical to its host qnfo-lifecycle/worker.js (backlog-fold.test.mjs) and the loop cannot edit both.
--          The endpoint is built in a session pull request (qnfo-lifecycle 1.16.0: GET /backlog/sla-gap; member route /sla-gap). The contract is a runtime probe of that route.
--  1000637, 1000639, 1000651: roadmap items whose definition of done is a measurement over time. Their contracts were superseded at birth (CLOSE-PROBE-CIRCULAR-1), so the PROBE-NEEDED-1 children 1000685, 1000687 and 1000692 stood open.
--          Each now has an active contract that reads the document in which the measurement is recorded, which exists only after the measurement is made (a marker the first edit cannot satisfy).
--  100625 / 1000248: the closing probe of 100625 reads 1 because research_queue row ac9cce13 (status deferred by RESEARCH-BACKPRESSURE-1) carries terminal_rearms 5, re-armed before PARK-REARM-CAP-1 (research-exec 0.36.7) set the ceiling at 2.
--          The row is parked as the cap would park it (backup table kept). The other measure of 100625 (orphan rows queued with a stage) reads 0; its diagnosis was already shown not to hold for current code (finding 2026-10-26), so the code task
--          ct_im100625 (issue 1000248) has nothing left to edit. 1000248 closes with that evidence when no row is above the ceiling.
--  1000585 SECRET-CHANGE-OBSERVED qnfo-youtube-shorts: closes with the consumer evidence read 2026-10-28 (no secret value read or written): after the four secret versions of 2026-10-27T11:18:45Z the worker uploaded two Shorts through the
--          refreshed OAuth credentials and its tick has run on every cron since; a request with a wrong x-run-token is refused 401.
--  100310: the replacement lever named by the session note of 2026-10-26 gets a code-task line (the code loop edits scripts/code-task-publish.py).
INSERT INTO ops_config (key, value, note, updated_at) SELECT 'cluster_f_a_2026_10_28', 'applied', 'CLUSTER-F-A no-doer drain; see migrations/2026-10-28-cluster-f-a-no-doer-drain.sql', datetime('now') WHERE NOT EXISTS (SELECT 1 FROM ops_config WHERE key = 'cluster_f_a_2026_10_28');

CREATE TABLE IF NOT EXISTS bak_20261028_cfa_contracts AS SELECT class, verify_probe, verify_transport, status, last_verdict FROM remediation_contracts WHERE class IN ('issue-1000002', 'issue-1000678', 'issue-1000735', 'issue-1000619', 'issue-1000637', 'issue-1000639', 'issue-1000651');
CREATE TABLE IF NOT EXISTS bak_20261028_cfa_issues AS SELECT id, description FROM agent_issues WHERE id IN (1000002, 1000678, 1000735, 1000619, 1000637, 1000639, 1000651, 100310, 100362, 1000248, 1000585);
CREATE TABLE IF NOT EXISTS bak_20261028_cfa_pm AS SELECT incident_key, root_cause FROM postmortems WHERE incident_key LIKE 'avail:travel.q08.org:%';
CREATE TABLE IF NOT EXISTS bak_20261028_cfa_rq AS SELECT id, status, stage, error FROM research_queue WHERE id = 'ac9cce13-f637-4a7f-abbe-7a02e5e2d884';

-- 1000002: the errata chain probe reads the chain's own conditions.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''FIXED'' AS expected, CASE WHEN (SELECT COUNT(*) FROM errata_queue WHERE status = ''internal-open'') < 50 AND (SELECT COUNT(*) FROM errata_actions WHERE status = ''verified'') >= 1 AND (SELECT COUNT(*) FROM errata_queue WHERE updated_at > created_at AND updated_at >= datetime(''now'', ''-3 hours'')) >= 1 THEN ''FIXED'' ELSE ''BROKEN'' END AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1000002' AND instr(verify_probe, 'notes_publish_queue') > 0;

-- 1000678: the postmortems name the class the samples support, and the contract measures the outcome.
UPDATE postmortems SET root_cause = 'slow: the host answered with an accepted status (401, the sign-in wall) but slower than the 5 s limit (SLO-SLOW-CLASS-1, 2026-10-28; was client-error). Cause found in personal-companion ensureTravel (schema writes on every request), fixed in 1.44.2.'
WHERE incident_key LIKE 'avail:travel.q08.org:%' AND root_cause LIKE 'client-error%' AND timeline LIKE '%status 401 in 5%';
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM bp26_probe_results WHERE subject = ''avail:travel.q08.org'' AND run_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) < 12 THEN ''fewer than 12 samples in 24 h'' WHEN (SELECT COUNT(*) FROM bp26_probe_results WHERE subject = ''avail:travel.q08.org'' AND ok = 0 AND run_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) > 0 THEN ''a sample failed in the last 24 h'' ELSE ''ok'' END AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1000678';

-- 1000735: the agent's own parse errors are an agent-input class; the probe reads what the filing trigger files.
INSERT INTO tool_error_exclusions (pattern, err_class, rationale, added_at, issue_id)
SELECT 'Unexpected token', 'agent-input-error', 'JavaScript parse error of code the agent passed to run_code_net (V8 says "Unexpected token" without the SyntaxError prefix); the runtime rejected it correctly | CLUSTER-F-A 2026-10-28, agent_issues 1000735', datetime('now'), 1000735
WHERE NOT EXISTS (SELECT 1 FROM tool_error_exclusions WHERE pattern = 'Unexpected token');
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN COALESCE(SUM(status = ''error'' AND NOT EXISTS (SELECT 1 FROM tool_error_exclusions x WHERE instr(COALESCE(meta, ''''), x.pattern) > 0 OR instr(COALESCE(text, ''''), x.pattern) > 0)), 0) <= 0.15 * COUNT(*) THEN ''ok'' ELSE ''unexcluded errors '' || SUM(status = ''error'' AND NOT EXISTS (SELECT 1 FROM tool_error_exclusions x WHERE instr(COALESCE(meta, ''''), x.pattern) > 0 OR instr(COALESCE(text, ''''), x.pattern) > 0)) || ''/'' || COUNT(*) || '' in 24h'' END AS observed FROM cloud_ops_events WHERE kind = ''ops_ai_tool'' AND text = ''run_code_net'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')',
  last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1000735' AND instr(verify_probe, 'tool_error_exclusions') = 0;

-- 1000619: runtime probe of the endpoint; the code task that named the FOLDED member is retired in the text.
UPDATE remediation_contracts SET
  verify_probe = '{"url": "https://qnfo-lifecycle.q08.workers.dev/backlog/sla-gap", "status": 200, "contains": "first20_no_doer"}',
  verify_transport = 'runner-https', status = 'active', last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1000619' AND status = 'superseded';
UPDATE agent_issues SET description = replace(description, 'code-task: repo=qnfo-workers path=qnfo-backlog-exec/worker.js', 'code-task-retired: the path was a FOLDED member (qnfo-backlog-exec), a twin of qnfo-lifecycle/worker.js; see the CLUSTER-F-A note below')
WHERE id = 1000619 AND instr(description, 'code-task: repo=qnfo-workers path=qnfo-backlog-exec/worker.js') > 0;
UPDATE agent_issues SET description = description || char(10) || char(10) || 'CLUSTER-F-A 2026-10-28: the three code tasks failed because qnfo-backlog-exec is FOLDED into qnfo-lifecycle (qnfo-backlog-exec/FOLDED): the member file must stay line-identical to its host (qnfo-lifecycle/backlog-fold.test.mjs) and a code task may not carry a second worker source. A session pull request adds slaGap to both and the host route GET /backlog/sla-gap (qnfo-lifecycle 1.16.0). Done when that route answers 200 with first20_no_doer (the contract).'
WHERE id = 1000619 AND instr(description, 'CLUSTER-F-A 2026-10-28') = 0;

-- 1000637, 1000639, 1000651: active contracts that read the document recording the measurement.
UPDATE remediation_contracts SET verify_probe = '{"paths": ["docs/MEMORY-TIERING-EVAL.md"], "contains": "## Result at 30 days"}', verify_transport = 'code-read', status = 'active', last_verdict = NULL, next_due_at = datetime('now') WHERE class = 'issue-1000637' AND status = 'superseded';
UPDATE remediation_contracts SET verify_probe = '{"paths": ["docs/CODEMODE-EVAL.md"], "contains": "## Result on 20 tasks"}', verify_transport = 'code-read', status = 'active', last_verdict = NULL, next_due_at = datetime('now') WHERE class = 'issue-1000639' AND status = 'superseded';
UPDATE remediation_contracts SET verify_probe = '{"paths": ["docs/AI-SEARCH-INSTANCES.md"], "contains": "## Result of the 2026-11-08 check"}', verify_transport = 'code-read', status = 'active', last_verdict = NULL, next_due_at = datetime('now') WHERE class = 'issue-1000651' AND status = 'superseded';
UPDATE agent_issues SET description = description || char(10) || char(10) || 'CLUSTER-F-A 2026-10-28: closing probe (code-read) = docs/MEMORY-TIERING-EVAL.md carries the heading "## Result at 30 days": the view of consolidation row counts and the retrieval hit-rate before and after, measured at 7 and 30 days. The first step above builds the tier field; the managers (QNFO.OPS roadmap lane) write the document when the 30 days have run.'
WHERE id = 1000637 AND instr(description, 'CLUSTER-F-A 2026-10-28') = 0;
UPDATE agent_issues SET description = description || char(10) || char(10) || 'CLUSTER-F-A 2026-10-28: closing probe (code-read) = docs/CODEMODE-EVAL.md carries the heading "## Result on 20 tasks": tokens per task for the search and execute pair against the tool-per-endpoint surface on 20 tasks, task success unchanged. The first step above builds the pair; the managers (QNFO.OPS roadmap lane) write the document when the 20 tasks have run.'
WHERE id = 1000639 AND instr(description, 'CLUSTER-F-A 2026-10-28') = 0;
UPDATE agent_issues SET description = description || char(10) || char(10) || 'CLUSTER-F-A 2026-10-28: closing probe (code-read) = docs/AI-SEARCH-INSTANCES.md carries the heading "## Result of the 2026-11-08 check": the instance list and bill bound exist (docs/AI-SEARCH-INSTANCES.md, ROADMAP-DOERS-EB-1) and the unified cost metric must be compared for the 30 days before and after 2026-11-01 (usage billing starts then), which can only be done on or after 2026-11-08. Owner of that step: the QNFO.OPS manager lane.'
WHERE id = 1000651 AND instr(description, 'CLUSTER-F-A 2026-10-28') = 0;

-- 100625 / 1000248: park the one row above the re-arm ceiling as PARK-REARM-CAP-1 would, then close the exhausted code task on the evidence.
UPDATE research_queue SET status = 'wontfix', stage = 'parked',
  error = 'PARKED-POISON-1: terminal_rearms 5 is above the re-arm ceiling 2 (PARK-REARM-CAP-1, research-exec 0.36.7), re-armed 5 times before the cap and deferred by RESEARCH-BACKPRESSURE-1 since 2026-10-24; parked by session cluster-f-a 2026-10-28 (agent_issues 100625). Backup: bak_20261028_cfa_rq. Revert: status queued, stage NULL'
WHERE id = 'ac9cce13-f637-4a7f-abbe-7a02e5e2d884' AND status = 'deferred' AND terminal_rearms > 2;
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'cluster-f-a', 'closed', 'cluster-f-a', datetime('now'),
  'CLUSTER-F-A 2026-10-28, read from qnfo-audit: code task ct_im100625 (PARK-REARM-1 orphan rows, agent_issues 100625) exhausted its ladder because the edit it was asked for is not needed: the finding of 2026-10-26 on 100625 shows a queued row with a stage is claimable in current code, and the orphan measure of the 100625 probe reads 0. The one remaining measure, a row above the re-arm ceiling, was research_queue ac9cce13 (terminal_rearms 5); it is parked as PARK-REARM-CAP-1 parks (bak_20261028_cfa_rq), and no research_queue row now has terminal_rearms above 2 in queued, deferred, researching or review. The task is replaced by that data change, which is what its definition of done allowed ("or a task that replaces it").'
FROM agent_issues a
WHERE a.id = 1000248 AND a.status = 'open'
  AND NOT EXISTS (SELECT 1 FROM research_queue WHERE terminal_rearms > 2 AND status IN ('queued', 'deferred', 'researching', 'review'))
  AND NOT EXISTS (SELECT 1 FROM research_queue q WHERE q.status = 'queued' AND q.stage IN ('revise', 'review', 'verify', 'complete') AND q.claimed_at IS NULL AND q.created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1440 minutes') AND q.id NOT IN (SELECT id FROM research_ready))
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- 1000585: secret change observed, consumers shown working (nothing read, written or rotated).
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'cluster-f-a', 'closed', 'cluster-f-a', datetime('now'),
  'CLUSTER-F-A 2026-10-28 (SECRET-CHANGE-VERIFIED-1 method), read from qnfo-audit and the worker; no secret value was read, written or rotated. Change: qnfo-youtube-shorts versions 2 to 5 at 2026-10-27T11:18:45Z to 11:18:48Z (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN, YT_RUN_TOKEN). After it, cloud_ops_events job qnfo-youtube-shorts wrote youtube.uploaded ok at 2026-10-27T12:33:59Z and 13:04:52Z (public Short rhJc9xSP4fs among them: an upload needs the OAuth refresh with YT_CLIENT_ID, YT_CLIENT_SECRET and YT_REFRESH_TOKEN to succeed) and youtube.tick ok 31 times from 13:04Z to 2026-10-28T19:00Z, with no oauth refresh error in that stream (the stage errors before 12:19Z on 2026-10-27 are the render stage of one slug). GET /status reads credentials true. YT_RUN_TOKEN: a POST /run with a wrong x-run-token answered 401 unauthorized at 2026-10-28T19:5xZ, so only the current value opens the route; the rotated-out value is not held anywhere and a Workers secret keeps one value.'
FROM agent_issues a
WHERE a.id = 1000585 AND a.status = 'open' AND a.title LIKE 'SECRET-CHANGE-OBSERVED: qnfo-youtube-shorts %'
  AND EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job = 'qnfo-youtube-shorts' AND e.kind = 'youtube.uploaded' AND e.status = 'ok' AND e.ts > '2026-10-27T11:18:49Z')
  AND EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job = 'qnfo-youtube-shorts' AND e.kind = 'youtube.tick' AND e.status = 'ok' AND e.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes'))
  AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job = 'qnfo-youtube-shorts' AND e.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1440 minutes') AND (e.text LIKE '%oauth refresh%' OR e.text LIKE '%invalid_grant%' OR e.text LIKE '%401%'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;
UPDATE agent_issues SET close_channel = 'session:cluster-f-a' WHERE id IN (1000585, 1000248) AND status = 'closed' AND close_channel LIKE 'auto:triage-sync:cluster-f-a%';

-- 100310: the replacement lever as a code task the loop can place.
UPDATE agent_issues SET description = description || char(10) || char(10) || 'CLUSTER-F-A 2026-10-28: replacement lever as a task for the code loop (lever TP-1.5-CONTAINER-VERIFIER-1 is replaced, not repeated): code-task-publish.py runs the gate on the files a patch touches before it pushes. A function gate_check(repo_dir, files, base) beside standards_check runs python scripts/deploy_gate.py --check <worker_dir> for each changed worker directory (timeout 180 s each, skipped with a ::warning:: when npx or wrangler is absent), returns the first failing lines as GATE feedback for the model, and publish_one calls it after standards_check so a gate failure goes back to propose and never to a pull request. Offline selftest: a patched tree with a conflict marker returns feedback, a clean tree returns None.' || char(10) || 'code-task: repo=qnfo-workers path=scripts/code-task-publish.py' || char(10) || 'code-anchor: def standards_check(repo_dir, files, base):'
WHERE id = 100310 AND instr(description, 'CLUSTER-F-A 2026-10-28') = 0;

-- 100362: the replacement lever is the probe rewrite the session note names; this session did it for the issues of its list.
UPDATE agent_issues SET description = description || char(10) || char(10) || 'CLUSTER-F-A 2026-10-28: measured 106 on issues_without_next_action (metric_registry, 19:00Z). The lever that moves it is to give each doer-less issue a real contract or a code task; this session did that for the doer-less issues of its list (see the migration 2026-10-28-cluster-f-a-no-doer-drain.sql); the next tick re-measures.'
WHERE id = 100362 AND instr(description, 'CLUSTER-F-A 2026-10-28') = 0;
