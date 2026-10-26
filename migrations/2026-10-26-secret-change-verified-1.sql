-- SECRET-CHANGE-VERIFIED-1 (2026-10-26, charter pillar security; agent_issues 100333, 100418, 1000199, 1000200 SECRET-CHANGE-OBSERVED, filed by qnfo-ops secretChangeWatch).
-- Each issue's definition of done: every consumer of the changed secret works with the current value, a rotated-out value is not re-accepted, and the evidence is in issue_triage.close_evidence. This file closes an
-- issue only when the facts it quotes still hold at apply time (a condition that does not hold leaves the issue open), through the triage row (the triggers triage_close_sync_issue_ins and _upd close the issue
-- with close_channel auto:triage-sync:rem-a2). No secret is read, copied, rotated, minted or printed: the evidence is what each worker did after the change, read from cloud_ops_events and metric_registry, and four
-- calls to the workers' own public routes (a health read, and one call with a deliberately invalid value).
-- What can and cannot be shown (stated in each evidence text): a Workers secret holds one value and a PUT replaces it, so the worker itself accepts only the current one; "a rotated-out value is not re-accepted" is
-- shown by an invalid value being refused through the worker's own route where the route allows it (qnfo-ops: no owner credential answers key_rejected; qnfo-ai-search /ingest: invalid X-Sync-Token answers 401), and the
-- old value itself is never held. "Every consumer works" is shown by the worker's own secret-dependent jobs and the absence of authorisation errors in its event stream, not by a call from each client.
--   100333  qnfo-ops, version 549 at 2026-10-20T09:23:40Z (source api, one secret-triggered version).
--   100418  qnfo-research-exec, version 362 at 2026-10-21T10:17:14Z (source api).
--   1000199 qnfo-ai-search, version 77 at 2026-10-25T11:45:11Z (source api; secrets SPEND_CAP_TOTAL_USD, SYNC_TOKEN).
--   1000200 qnfo-fleet-dashboard, version 404 at 2026-10-25T11:35:36Z (source api; BINDING-PROPS-RESTORE-1 redeployed it at 12:02:27Z).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE issue_triage SET triage_state = 'triaged', close_evidence = NULL WHERE rc = 'secret-change-verified' AND owner = 'rem-a2' AND issue_id IN (100333, 100418, 1000199, 1000200); UPDATE agent_issues SET status = 'open', close_channel = NULL WHERE id IN (100333, 100418, 1000199, 1000200) AND close_channel = 'auto:triage-sync:rem-a2'

-- 100333 qnfo-ops
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'secret-change-verified', 'closed', 'rem-a2', datetime('now'),
  'SECRET-CHANGE-VERIFIED-1 2026-10-26 (rem-a2), read from qnfo-audit and the worker. Change: qnfo-ops version 549 at 2026-10-20T09:23:40Z, source api, one secret-triggered version (12 secret names: CF_API_TOKEN, DEEPSEEK_API_KEY, EMAIL_API_KEY, GITHUB_TOKEN, INTENT_TOKEN, OPS_DAILY_CAP, OPS_OWNER_KEY, OPS_ROUTER_AUTH_KEY, OPS_ROUTER_AUTH_KEY_2, PILOT_TOKEN, REGISTRY_TOKEN, SHELL_EXEC_URL). After the change, 10,798 ops_ai_tool calls (cloud_ops_events) with 0 GitHub 401/403/Bad credentials errors and 0 key-rejected errors. CF_API_TOKEN: 308 secret-watch-tick rows status ok, first 2026-10-20T09:31:14Z, last 2026-10-26T18:32:25Z (the watch lists every worker script and its versions with that token). GITHUB_TOKEN: github_repo_read 573 ok, git_op 235 ok, github_file_write 37 ok, the last github_repo_read at 2026-10-26T17:48:39Z. Owner login path (OPS_OWNER_KEY, EMAIL_API_KEY): owner_login 25 ok and owner_verify 9 ok, last owner_login 2026-10-25T09:09:41Z. SHELL_EXEC_URL and PILOT_TOKEN: shell_exec 1,163 ok and container_workspace_exec 274 ok, the last ok at 2026-10-25T11:17:19Z, with no container tool call after that and none failing. Live read 2026-10-26 18:44Z: GET https://ops.qnfo.org/health answers status ok, version 2.58.4-d1-caller-reject-2, and a POST /v1/tools/call without an owner credential answers key_rejected (invalid_api_key), so a value that is not the owner credential is refused. Limits: a rotated-out value is never held (secret lock), a Workers secret holds one value, and DEEPSEEK_API_KEY, REGISTRY_TOKEN, INTENT_TOKEN and OPS_DAILY_CAP have no call of their own in the event stream that this read can name; no authorisation error of any of them appears in it.'
FROM agent_issues a
WHERE a.id = 100333 AND a.status = 'open' AND a.title LIKE 'SECRET-CHANGE-OBSERVED: qnfo-ops %'
  AND EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.kind = 'secret-watch-tick' AND e.status = 'ok' AND e.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes'))
  AND EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.kind = 'ops_ai_tool' AND e.text = 'github_repo_read' AND e.status = 'ok' AND e.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-360 minutes'))
  AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.kind = 'ops_ai_tool' AND e.status = 'error' AND e.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1440 minutes') AND (e.meta LIKE '%GitHub 401%' OR e.meta LIKE '%GitHub 403%' OR e.meta LIKE '%Bad credentials%' OR e.meta LIKE '%key_rejected%'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- 100418 qnfo-research-exec
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'secret-change-verified', 'closed', 'rem-a2', datetime('now'),
  'SECRET-CHANGE-VERIFIED-1 2026-10-26 (rem-a2), read from qnfo-audit. Change: qnfo-research-exec version 362 at 2026-10-21T10:17:14Z, source api, one secret-triggered version (secrets GITHUB_TOKEN, PILOT_TOKEN, ROUTER_TOKEN). After the change the worker wrote, in cloud_ops_events job qnfo-research-exec: done ok 1,091 (last 2026-10-26T04:32:42Z), complete ok 117, claim ok 278, idea-to-publish ok 129 (last 2026-10-26T18:01:10Z), research-budget ok 868 (last 2026-10-26T18:41:02Z). ROUTER_TOKEN: the pipeline stages that call the model router finish (done ok, review-triage ok 292, slop-scan ok 342). GITHUB_TOKEN: complete ok 117 and idea-to-publish ok 129 are the publishing stages, and none reports an authorisation failure. Zero events of the worker since the change carry 401, 403, Unauthorized or key rejected in their text. The pause of research since 2026-10-26T04:32Z is the research budget hold (research-budget events), not authorisation. Limits: the rotated-out value is never held (secret lock) and a Workers secret holds one value; PILOT_TOKEN has no call of its own in the event stream that this read can name; no authorisation error appears in it.'
FROM agent_issues a
WHERE a.id = 100418 AND a.status = 'open' AND a.title LIKE 'SECRET-CHANGE-OBSERVED: qnfo-research-exec %'
  AND EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job = 'qnfo-research-exec' AND e.kind = 'idea-to-publish' AND e.status = 'ok' AND e.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes'))
  AND EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job = 'qnfo-research-exec' AND e.kind = 'done' AND e.status = 'ok' AND e.ts > '2026-10-21T10:17:14Z')
  AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job = 'qnfo-research-exec' AND e.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1440 minutes') AND (e.text LIKE '% 401%' OR e.text LIKE '%Unauthorized%' OR e.text LIKE '%HTTP 403%' OR e.text LIKE '%key rejected%'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- 1000199 qnfo-ai-search
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'secret-change-verified', 'closed', 'rem-a2', datetime('now'),
  'SECRET-CHANGE-VERIFIED-1 2026-10-26 (rem-a2), read from qnfo-audit and the worker. Change: qnfo-ai-search version 77 at 2026-10-25T11:45:11Z, source api, one secret-triggered version (secrets SPEND_CAP_TOTAL_USD, SYNC_TOKEN). After the change the ASK-LOOP-1 hourly measure refreshed at 2026-10-26T18:40:18Z reads ask_answers_7d 24, ask_error_rate_7d 0.04, ask_grounded_share_7d 0.9375, ask_retrieval_mrr 0.9531, ask_cost_per_answer_usd_7d 0.00259: answers are generated (not sources-only, which is what SPEND_CAP_TOTAL_USD at the fleet spend would cause) and retrieval from the index works. Live read 2026-10-26 18:44Z through the worker''s own routes: GET /health answers status ok, version 2.11.0; POST /ingest with a deliberately invalid X-Sync-Token answers HTTP 401 Unauthorized (an invalid value is refused). Limits: the eight other workers whose code sends or checks an X-Sync-Token (agent-orchestrator, qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-gateway, qnfo-idea-factory, qnfo-idea-triage, qnfo-intent-orchestrator, qnfo-skill-sync) are not called one by one here (a call would write to the corpus), and the rotated-out value is never held (secret lock); no cloud_ops_events row since the change mentions X-Sync-Token.'
FROM agent_issues a
WHERE a.id = 1000199 AND a.status = 'open' AND a.title LIKE 'SECRET-CHANGE-OBSERVED: qnfo-ai-search %'
  AND (SELECT CAST(m.last_value AS REAL) FROM metric_registry m WHERE m.metric = 'ask_error_rate_7d' AND m.last_refreshed > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes')) <= 0.25
  AND (SELECT CAST(m.last_value AS REAL) FROM metric_registry m WHERE m.metric = 'ask_answers_7d' AND m.last_refreshed > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes')) > 0
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- 1000200 qnfo-fleet-dashboard
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'secret-change-verified', 'closed', 'rem-a2', datetime('now'),
  'SECRET-CHANGE-VERIFIED-1 2026-10-26 (rem-a2), read from qnfo-audit and the worker. Change: qnfo-fleet-dashboard version 404 at 2026-10-25T11:35:36Z, source api, one secret-triggered version (secrets CF_TOKEN, GA4_SA_KEY, GITHUB_TOKEN, LOOP_TOKEN, OWNER_TOKEN, PORTFOLIO_TRIGGER_SECRET, REVISER_TOKEN); BINDING-PROPS-RESTORE-1 found the service-binding props missing after it and dispatched the canonical redeploy at 2026-10-25T12:02:27Z. After the change the worker wrote, in cloud_ops_events job qnfo-fleet-dashboard: changelog-tick ok 32 (GITHUB_TOKEN, last 2026-10-26T18:30:49Z), ga4-ingest ok at 2026-10-26T02:00:49Z (GA4_SA_KEY), reach-ingest at 2026-10-26T02:30:47Z with cf-rum:pages=213 and cf-rum-human:referrers=13 (the Cloudflare RUM read that CF_TOKEN serves; its status partial, skipped 1, is the same on 2026-10-23 and 2026-10-24, before the change), attention-scorecard ok, portfolio-daily ok 2, portfolio-strategic ok 2, identity-weekly ok, report-card-weekly ok. Live read 2026-10-26 18:44Z: https://fleet.qnfo.org/ and /api/watchmaker answer 200. Limits: LOOP_TOKEN, OWNER_TOKEN, PORTFOLIO_TRIGGER_SECRET and REVISER_TOKEN guard routes that take owner or loop callers and were not called here (a call would change the fleet), the rotated-out value is never held (secret lock), and no authorisation error of the worker appears in its event stream since the change.'
FROM agent_issues a
WHERE a.id = 1000200 AND a.status = 'open' AND a.title LIKE 'SECRET-CHANGE-OBSERVED: qnfo-fleet-dashboard %'
  AND EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job = 'qnfo-fleet-dashboard' AND e.kind = 'changelog-tick' AND e.status = 'ok' AND e.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes'))
  AND EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job = 'qnfo-fleet-dashboard' AND e.kind = 'ga4-ingest' AND e.status = 'ok' AND e.ts > '2026-10-25T11:35:36Z')
  AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.job = 'qnfo-fleet-dashboard' AND e.ts > '2026-10-25T11:35:36Z' AND (e.text LIKE '% 401%' OR e.text LIKE '%Unauthorized%' OR e.text LIKE '%HTTP 403%' OR e.text LIKE '%key rejected%'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a2 (remediation session 2026-10-26)',
  'a secret change is verified by what the worker did with it afterwards, not by reading the secret; an issue whose facts still hold at apply time is closed with them, one whose facts do not is left open',
  'SECRET-CHANGE-VERIFIED-1: close_evidence written for agent_issues 100333 (qnfo-ops), 100418 (qnfo-research-exec), 1000199 (qnfo-ai-search) and 1000200 (qnfo-fleet-dashboard), each guarded by live event or metric facts at apply time and by no failing active contract',
  'read 2026-10-26 from live qnfo-audit and the workers: 10,798 qnfo-ops tool calls since version 549 with 0 GitHub authorisation errors, 308 secret-watch ticks ok; qnfo-research-exec 1,091 done ok since version 362 and no 401 or 403 text; qnfo-ai-search ask metrics refreshed 18:40Z with error rate 0.04 and an invalid X-Sync-Token refused with 401; qnfo-fleet-dashboard ga4-ingest ok, 32 changelog ticks ok, cf-rum ingested',
  'applied through the canonical path on merge: the four issues are closed with their evidence unless a guard no longer holds',
  'four issue_triage rows and the four issues they close, no secret read, copied, rotated or printed, no worker, trigger or contract touched',
  'the Rollback header of migrations/2026-10-26-secret-change-verified-1.sql reopens the four issues and clears their close evidence',
  'secret-change-verified-by-behaviour',
  'the four issues are closed on apply; a new secret-triggered version of any of the four workers files its own SECRET-CHANGE-OBSERVED issue',
  NULL,
  'node:sqlite replay (migrations/secret-change-verified-1.test.mjs) with the live triage close triggers, each guard met and unmet, apply_migrations.py --check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor LIKE 'rem-a2%' AND instr(action, 'SECRET-CHANGE-VERIFIED-1') > 0);
