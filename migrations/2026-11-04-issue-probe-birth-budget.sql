-- ISSUE-PROBE-BIRTH-BUDGET-1 (2026-11-04, charter pillar cost; owner: Workers AI about USD 200-300 a month; AI-spend audit, docs/INFRA-AUDIT-2026-11-04.md).
-- Measured 2026-11-04 ~16:30Z. Cloudflare's own meter (GraphQL aiInferenceAdaptiveGroups, the source of cost_daily.workers_ai) read 3.56 M neurons (USD 39.03) on
-- 11-03 and 2.36 M (USD 25.84) by 16:00Z on 11-04, 2.4 times what the fleet's counters attribute (ai_call_counters 1.48 M on 11-03; workers_ai_attribution_coverage_pct 37),
-- so the caps that steer spend (research 360 K, code loop 100 K, q08 50 K neurons a day) cannot see about 60 % of it. The largest uncounted consumer is
-- @cf/deepseek-ai/deepseek-v4.1-flash-1017: 2.32 M neurons (39 % of the account) in 12,391 calls since 11-03 00:00Z, still 20-75 K neurons and 130-450 calls every hour.
-- Its callers are cf_agent_requests handled by qnfo-agents (agent loop, about 25 model calls and 32 K input tokens per request, about 3.3 K neurons or USD 0.036 a request):
-- issue-probe-agent 304 requests on 11-04 (311 on 11-03, 368 on 11-02) and program-manager:* 92 (133 on 11-03).
-- Of the 304 issue-probe-agent requests, 133 were queued at issue birth by the D1 trigger agent_issues_birth_contract_ins (ISSUE-BIRTH-DOER-PROBE-1, 2026-11-01): it inserts a
-- request for every new open issue, with no hourly budget, ignoring ops_config issue_probe_agent_per_hour (the hourly step's LIMIT, cut 12 -> 2 today) and spending an agent loop
-- on each of the 34 D1-overload tickets (CF-OBS-ISSUE-1, LOOP-BREAKER-1) filed today, so the overload also drives AI spend. The per-hour cut did not move the hourly deepseek calls (about 330 an hour at 15:00Z).
-- Change: the birth request is queued only while fewer than ops_config issue_probe_birth_per_hour (default 3) requests of the issue-probe-agent were created in the last 60 minutes
-- (all sources). A born issue that is not asked at birth keeps its needs-machine-probe contract and stays in v_issue_probe_intake, so the hourly step (LIMIT issue_probe_agent_per_hour
-- = 2, at most issue_probe_max_attempts = 2 asks per issue) asks it within the next runs. Total requests: at most about 3 + 2 an hour (120 a day) against about 300.
-- The hourly count reads the new index idx_cf_agent_requests_req_created (requester, created_at); without it each birth would read every request of the requester.
-- Prediction: issue-probe-agent requests 304 a day -> under 120; deepseek-v4.1-flash-1017 neurons about 1.0 M a day -> under 0.4 M (-0.6 M neurons, about USD 6.6 a day, about USD 200 a month);
-- verify with the same GraphQL query by hour (target: under 20 K neurons and 130 calls an hour) and SELECT COUNT(*) FROM cf_agent_requests WHERE requester = 'issue-probe-agent' per day.
-- Revert without a deploy: UPDATE ops_config SET value = '1000' WHERE key = 'issue_probe_birth_per_hour'.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261104_birth_trigger
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_birth_contract_ins; then re-create it from bak_20261104_birth_trigger (column sql holds the exact previous CREATE statement); DROP INDEX IF EXISTS idx_cf_agent_requests_req_created; DELETE FROM ops_config WHERE key = 'issue_probe_birth_per_hour'; DELETE FROM remediation_contracts WHERE class = 'fm-issue-probe-hourly-unbounded'; DELETE FROM failure_modes WHERE fm_key = 'issue-probe-hourly-unbounded'
-- spof-review: one trigger gains a guard in an existing statement (same table, same statements, no new dependency); the hourly step is the second path for every issue not asked at birth.

CREATE TABLE IF NOT EXISTS bak_20261104_birth_trigger AS
SELECT name, type, sql FROM sqlite_master WHERE type = 'trigger' AND name = 'agent_issues_birth_contract_ins';

CREATE INDEX IF NOT EXISTS idx_cf_agent_requests_req_created ON cf_agent_requests (requester, created_at);

INSERT OR IGNORE INTO ops_config (key, value, note)
VALUES ('issue_probe_birth_per_hour', '3', 'ISSUE-PROBE-BIRTH-BUDGET-1: most issue-probe-agent requests created in any 60 minutes before a new issue is queued at birth; later ones wait for the hourly step. 1000 lifts the limit.');

DROP TRIGGER IF EXISTS agent_issues_birth_contract_ins;
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open'
BEGIN
  INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
  SELECT NEW.id, 'ISSUE-BIRTH-DOER-PROBE-1', 'triaged', owner, datetime('now')
  FROM v_issue_birth_owner WHERE issue_id = NEW.id;
  UPDATE issue_triage SET owner = (SELECT owner FROM v_issue_birth_owner WHERE issue_id = NEW.id),
    rc = 'ISSUE-BIRTH-DOER-PROBE-1'
  WHERE issue_id = NEW.id AND rc = 'AUTOTRIAGE-1' AND owner = 'qnfo-ops';
  INSERT OR IGNORE INTO remediation_contracts
    (class, issue_id, precondition, action, verify_probe, verify_transport,
     max_attempts, escalate_to, expected_cadence_h, status, module)
  SELECT 'issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)',
    'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1,
    'needs-machine-probe', 'birth'
  WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE issue_id = NEW.id);
  INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority)
  SELECT 'issue-probe-agent', 'run', prompt, 'probe-issue-' || issue_id, priority
  FROM v_issue_probe_intake WHERE issue_id = NEW.id
    AND COALESCE((SELECT value FROM ops_config WHERE key = 'issue_probe_agent'), 'on') <> 'off'
    AND (SELECT COUNT(*) FROM cf_agent_requests z WHERE z.requester = 'issue-probe-agent'
         AND z.created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes'))
        < CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'issue_probe_birth_per_hour'), '3') AS INTEGER)
    AND NOT EXISTS (SELECT 1 FROM cf_agent_requests
                    WHERE requester = 'issue-probe-agent' AND instance = 'probe-issue-' || NEW.id);
  INSERT OR IGNORE INTO issue_probe_requests (issue_id, request_id, requested_at)
  SELECT NEW.id, id, created_at FROM cf_agent_requests
  WHERE requester = 'issue-probe-agent' AND instance = 'probe-issue-' || NEW.id
  ORDER BY id DESC LIMIT 1;
END;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('issue-probe-hourly-unbounded',
  'a trigger or step queues an LLM agent loop (about 25 model calls, 3.3 K neurons, USD 0.036) per event with no hourly budget, so spend follows the event rate: the issue-probe-agent ran 304 loops a day, 44 % of them at issue birth, and the D1-overload tickets drove it',
  'agent_issues_birth_contract_ins inserted a cf_agent_requests row for every new open issue (ISSUE-BIRTH-DOER-PROBE-1); the hourly LIMIT (issue_probe_agent_per_hour) bounds only the step, and the fleet caps do not see qnfo-agents calls (attribution coverage 37 %)',
  'ISSUE-PROBE-BIRTH-BUDGET-1: the birth request counts the requester created_at over the last 60 minutes against ops_config issue_probe_birth_per_hour (3); the detector fails when an hour holds more than 8 requests',
  'fm-issue-probe-hourly-unbounded: 1 when more than 8 issue-probe-agent requests were created in the last 60 minutes, expected 0',
  'fm-issue-probe-hourly-unbounded', '2026-11-04', (SELECT id FROM agent_issues WHERE title LIKE 'D1-OVERLOAD-1e:%' ORDER BY id DESC LIMIT 1),
  'a burst of new issues (an outage files dozens of tickets) while the birth path has no rate budget',
  'cf_agent_requests issue-probe-agent above 120 a day; deepseek-v4.1-flash-1017 above 20 K neurons an hour in GraphQL aiInferenceAdaptiveGroups',
  'Workers AI neurons, the AI-spend caps, the single-writer D1 (each agent loop reads and writes qnfo-audit)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-issue-probe-hourly-unbounded', NULL, 'ISSUE-PROBE-BIRTH-BUDGET-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST(CASE WHEN (SELECT COUNT(*) FROM cf_agent_requests WHERE requester = ''issue-probe-agent'' AND created_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) > 8 THEN 1 ELSE 0 END AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session:fleet-tick-fanout', 'the largest Workers AI consumer outside the caps is an agent loop queued per new issue; a per-hour budget on the birth path keeps the check for every issue and bounds the spend',
  'ISSUE-PROBE-BIRTH-BUDGET-1: agent_issues_birth_contract_ins queues the probe request only while the issue-probe-agent created fewer than issue_probe_birth_per_hour (3) requests in the last 60 minutes; index idx_cf_agent_requests_req_created',
  'GraphQL aiInferenceAdaptiveGroups since 11-03 00:00Z: deepseek-v4.1-flash-1017 2.32 M of 5.93 M neurons (39 %), 12,391 calls, 20-75 K neurons an hour on 11-04 after the per-hour cut; cf_agent_requests issue-probe-agent 304 requests on 11-04, 133 of them within 3 minutes of the issue (birth), 34 issues were D1-overload tickets; cost_daily.workers_ai USD 39.03 on 11-03 against ai_call_counters 1.48 M neurons',
  'every issue still gets its check through the hourly step; about 60 % fewer agent loops', 'one trigger on agent_issues (old text in bak_20261104_birth_trigger), one ops_config key, one index',
  'ops_config issue_probe_birth_per_hour = 1000, or the Rollback line', 'the issue-probe loop costs about USD 80 a month instead of about USD 330',
  'issue-probe-agent requests per day under 120 and deepseek-v4.1-flash-1017 under 20 K neurons an hour within 24 h of the merge', NULL, 'SQLite trigger test in migrations/issue-probe-birth-budget.test.mjs, live GraphQL and cf_agent_requests counts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'ISSUE-PROBE-BIRTH-BUDGET-1:%');
