-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed', close_channel = 'rollback:JOURNEY-CLOSE-CONTRACT-AWARE-1', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE title IN ('JOURNEY-CLOSE-CONTRACT-AWARE-1: jrnIssue tries to close a journey issue the close trigger refuses, so every tick logs an error group that fails traffic-health', 'EVAPI-5XX-RETRY-1: evApi logs an error group for a transient GitHub 502 and returns no body') AND status = 'open'
-- JOURNEY-CLOSE-CONTRACT-AWARE-1 + EVAPI-5XX-RETRY-1 (2026-10-26, pillar autonomy; agent_issues 1000489 and 1000471, FLEET-JOURNEY-FAILED-1 traffic-health).
-- Measured 2026-10-26 in Workers Observability (qnfo-fleet-control, last 24 h): the error group with "D1_ERROR: <token>: SQLITE_CONSTRAINT" and a journey field is
-- evt fleet-control:journeys:issue with "D1_ERROR: close-while-contract-fails" at 04:20, 04:41, 12:21 and 18:20 (traffic-health) and 18:20 (binding-census): jrnIssue (qnfo-fleet-control/worker.js)
-- passes the journey, writes close_evidence and updates the issue to closed, and the BEFORE UPDATE trigger issue_close_evidence_required (CLOSE-BINDS-TO-PROBE-1) refuses it while the issue's own
-- active or holding contract reads fail. The error group then fails the traffic-health journey step "no Cloudflare Observability error group recurred in 6 h", which files the next
-- FLEET-JOURNEY-FAILED-1 (1000489 at 19:20:48Z), so the journey loop keeps failing on its own log line. The second group is evApi: one GitHub 502 whose body "error code: 502" is not JSON
-- (18:31:55Z, agent_issues 1000471).
-- Both belong to qnfo-fleet-control/worker.js, which the code loop holds through a work claim until 21:31Z (ct_8n5jtgin8fc5kh), so each is filed with a code-task for the code loop instead of a
-- parallel edit by this session.

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'JOURNEY-CLOSE-CONTRACT-AWARE-1: jrnIssue tries to close a journey issue the close trigger refuses, so every tick logs an error group that fails traffic-health',
  'Charter pillar: autonomy. In qnfo-fleet-control/worker.js jrnIssue, when the journey passes and an open FLEET-JOURNEY-FAILED-1 issue exists, the loop writes issue_triage.close_evidence and runs UPDATE agent_issues SET status = ''closed''. The trigger issue_close_evidence_required refuses the close with close-while-contract-fails while a remediation_contracts row of that issue is active or holding and its last_verdict is fail, vacuous-probe-result, probe-error, probe-not-machine-executable or probe-same-account-host. The catch logs fleet-control:journeys:issue at error level (04:20, 04:41, 12:21 and 18:20Z on 2026-10-26: traffic-health, binding-census), the Observability error group recurs inside the 6 h window of the traffic-health step, and that step files FLEET-JOURNEY-FAILED-1 traffic-health (1000489) for the log line the loop itself wrote.' || char(10) ||
  'Doer: qnfo-code-orchestrator. In the close branch (the loop over open, before the two UPDATE statements), skip an issue for which SELECT 1 FROM remediation_contracts WHERE issue_id = ?1 AND status IN (''active'', ''holding'') AND COALESCE(last_verdict, '''') IN (''fail'', ''vacuous-probe-result'', ''probe-error'', ''probe-not-machine-executable'', ''probe-same-account-host'') returns a row: the contract probe closes the issue when it passes, so the loop must not try and must not log an error. Do not write close_evidence for a skipped issue. Mark the change with the comment JOURNEY-CLOSE-CONTRACT-AWARE-1 and add a case to a fleet-control journeys suite (a passing journey with an open issue whose contract reads fail issues no UPDATE and logs no error; with the contract passing the issue closes as before). Raise VERSION by a patch and keep deployed-current.worker.js identical.' || char(10) ||
  'Definition of done: the code-probe below passes, and no fleet-control:journeys:issue close-while-contract-fails event is logged for 6 hours.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
  'code-anchor: if (other && Number(other.ok) === 0) return;' || char(10) ||
  'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "JOURNEY-CLOSE-CONTRACT-AWARE-1"}',
  'session', 'reliability', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'JOURNEY-CLOSE-CONTRACT-AWARE-1: jrnIssue tries to close a journey issue the close trigger refuses, so every tick logs an error group that fails traffic-health' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'EVAPI-5XX-RETRY-1: evApi logs an error group for a transient GitHub 502 and returns no body',
  'Charter pillar: reliability. In qnfo-fleet-control/worker.js evApi (the GitHub REST helper of the evolve and merge lanes) a 502 from api.github.com answered with the plain text error code: 502, JSON.parse failed and the catch logged fleet-control:evApi:caught at error level (2026-10-26T18:31:55Z, status 502, cf-obs group 4d3c3283, agent_issues 1000471). The caller then sees j null and ok false with no hint that the answer was a gateway error, and the log line opens an Observability group that fails the traffic-health journey for 6 hours.' || char(10) ||
  'Doer: qnfo-code-orchestrator. In evApi retry a GET once, after about 500 ms, when the status is 502, 503 or 504; keep the log line for the final answer, and add the status class and the first 80 characters of the body to it so a gateway error reads as one. A non-GET is never retried. Mark the change with the comment EVAPI-5XX-RETRY-1 and add a case to an existing fleet-control suite (a 502 then 200 answer returns the 200 body and logs nothing; two 502 answers log once; a POST is sent once). Raise VERSION by a patch and keep deployed-current.worker.js identical.' || char(10) ||
  'Definition of done: the code-probe below passes.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
  'code-anchor: if (raw) { try { j = JSON.parse(raw); } catch (e) { console.error(JSON.stringify({ evt: "fleet-control:evApi:caught", status: r.status, error: String(e && e.message) })); } }' || char(10) ||
  'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "EVAPI-5XX-RETRY-1"}',
  'session', 'reliability', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'EVAPI-5XX-RETRY-1: evApi logs an error group for a transient GitHub 502 and returns no body' AND status = 'open');
