-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class), max_attempts = (SELECT b.max_attempts FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261019_high_issue_probes b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_high_issue_probes); DELETE FROM remediation_contracts WHERE class = 'issue-2830-required-check';
--
-- HIGH-ISSUE-PROBES-1 (2026-10-19, charter pillar autonomy; owner directives OWNER-NO-LOOSE-ENDS-1 and CLOSE-BINDS-TO-PROBE-1)
--
-- Five open high-priority issues carried a contract that could not verify them: four were superseded (CLOSE-PROBE-CIRCULAR-1 retired the
-- probe that only asked whether the issue was closed, or the contract was parked as probe-unusable) and issue 2081 sat on superseded:open-twin
-- although no twin is open. Nothing measured any of their defects, so none could close on evidence and none had a next action
-- (issues_without_next_action 70 on 2026-10-19). Each contract below is re-pointed at a probe that measures the defect the issue describes and
-- never reads the issue's own status, set active and due now, so the remediation runners verify it within the hour. Every probe was run
-- read-only against live qnfo-audit (or api.github.com) on 2026-10-19 13:0xZ and reads a failure now. Nothing is closed here
-- and no evidence is written: a probe passes only when the fleet itself changes.
--
--   2750 AI-CREDIT-OWNER-CLIENT-1   d1-query. Owner-local Anthropic spend (ai_spend_owner_local, kept by qnfo-fleet-control OWNER-LOCAL-INGEST-1b) is
--        at or under the 10 USD daily cap on each of the last 3 UTC days, and the ingest ran in the last 3 h. Read: 97.03 USD on 2026-10-18 (1140
--        calls) and 55.02 on 2026-10-17, so the daily cap recorded on the issue does not hold the burn. The probe passes after the untagged client
--        is repointed or stops. Accepting a higher level is the owner's call on the owner's account: it is a recorded migration that changes the 10.
--   2805 PROMPT-STORE-CONCURRENT-CLOBBER-1   d1-query. The issue's remaining piece is a claim around prompt-stores/sync_system_prompt.py. Claims are
--        kept by qnfo-deploy-guard (work_claims, key file:<path>), so the probe asks whether the sync took a claim on exactly that path in the
--        last 14 days; there is none. It proves the claim is taken, not that every run takes it: the script is in a private repository this runner
--        cannot read, so the claim footprint is the observable. The path is exact so an unrelated claim on a prompt file cannot close the issue.
--   2830 MERGE-BOUNDARY-GATE-1   code-read plus a second contract issue-2830-required-check (external-https). The definition of done is that a change cannot
--        reach main with a red full suite. Path A of the issue needs both halves: deploy-gate.yml runs on merge_group (where the workflow already runs
--        the full set, because only pull_request events select changed directories), and a ruleset requires the status check. Path B or C: replace
--        the code-read probe by a migration that names the file text that proves it.
--   2927 INTEG-GITHUB-HARDEN-1   external-https (run hourly by qnfo-fleet-control, public GitHub API, no credential): GET /repos/QNFO/qnfo-workers/rules/branches/main
--        lists a required_status_checks rule. Read: the active main-safety ruleset (id 25060446) holds only deletion and non_fast_forward. The issue's
--        second half, high code-scanning alerts on deployed code = 0, is the definition of done of issue 2928 (INTEG-CODEQL-HIGH-1), so this contract
--        measures the ruleset half that is 2927's own; the alerts API needs a security_events grant no probe transport carries, and a transport
--        for it is a qnfo-github-steward change.
--   2931 INTENT-TASK WAE-FLEET-1 tranche 2   not touched: the issue was superseded by 100162 (WAE-FLEET-1-T2-APPLY-1) at 13:03Z while this file was written.
--        For that rollout the fleet graph already answers "which live fetch workers still lack FLEET_ANALYTICS": 31 of 32 on 2026-10-19
--        (qnfo-graph fg_node, scope live, binding:<worker>.FLEET_ANALYTICS), the probe a per-worker rollout can reuse.
--   2935 GA4-PROPERTY-MISMATCH-1   not touched: PR 2896 (migrations/2026-10-19-ga4-reingest-1.sql, merged minutes before this file) already gave
--        issue-2935 an active probe that compares GA4 with the human RUM total (GA4 0 on the tagged zones against 2155 on 2026-10-18 when read).
--   2081 METRIC-TRIGGER runtime_verified_share_24h   d1-query. The share the trigger watches, computed from remediation_verifications and transport_trust
--        exactly as scripts/remediation_consumer.py does, at least 10 (the trigger's threshold; the registry target is 25). Read 8.3 on 8172 verifications
--        (678 runtime). The probe does not read the metric registry, so red-drain does not park it as a monitored condition.
-- Limits that stay: a probe fails closed (stale or missing data reads as a failure, never as ok), thresholds change only by a recorded migration.
-- max_attempts is 24 on each contract (hourly, so red-drain's park-after-5x-max_attempts rule needs 120 failing hours, as the GA4 probe of PR 2896 sets):
-- these are real defects that fail for days, and a park after 15 hours would put the issue back on the dead-end list.
-- 2954 (VERIFICATION-DEFERRAL-STALL-1) is owned by the CONSUMER-PENDING-IS-DEFERRAL-1 / VERIFICATION-PATH-1 work and is left untouched here.
-- Transports: d1-query runs in qnfo-fleet-control and the consumer, code-read in scripts/remediation_consumer.py, external-https in
-- qnfo-fleet-control. spof-review: no new loop, cap, hold or gate; six contract rows re-pointed and one added.

-- 0. Backup of the rows this file changes (BACKUP-CREATES-1).
CREATE TABLE IF NOT EXISTS bak_20261019_high_issue_probes AS
  SELECT class, status, verify_probe, verify_transport, last_verdict, module, action, precondition, attempts, max_attempts, next_due_at
  FROM remediation_contracts
  WHERE class IN ('issue-2750', 'issue-2805', 'issue-2830', 'issue-2927', 'issue-2081');

-- 1. The five contracts: re-pointed at a probe that measures the defect, active, due now (UPDATE on the class, ORPHAN-GUARD-BIRTH-1).
UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query', verify_probe =
 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''owner-local-ingest'' AND datetime(ts) > datetime(''now'', ''-3 hours'')) = 0 THEN ''ingest-stale: no owner-local-ingest event in the last 3 h, the burn cannot be read'' WHEN (SELECT COALESCE(MAX(w.usd), 0) FROM (SELECT SUM(usd) AS usd FROM ai_spend_owner_local WHERE lower(provider) = ''anthropic'' AND day >= date(''now'', ''-2 days'') GROUP BY day) w) > 10 THEN ''burn: anthropic owner-local spend on the worst of the last 3 UTC days is '' || (SELECT ROUND(MAX(w.usd), 2) FROM (SELECT SUM(usd) AS usd FROM ai_spend_owner_local WHERE lower(provider) = ''anthropic'' AND day >= date(''now'', ''-2 days'') GROUP BY day) w) || '' USD against the 10 USD daily cap'' ELSE ''ok'' END AS observed',
  last_verdict = 'rearmed: HIGH-ISSUE-PROBES-1 (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || ')', attempts = 0, max_attempts = 24, next_due_at = datetime('now'),
  module = 'measuring-probe-high-issues-1', precondition = 'HIGH-ISSUE-PROBES-1: issue 2750 defect (owner-client Anthropic burn on the stored gateway key) measured, not its status',
  action = 'MEASURES the defect: owner-local Anthropic spend (ai_spend_owner_local, written hourly by qnfo-fleet-control OWNER-LOCAL-INGEST-1b) is at or under the 10 USD daily cap on each of the last 3 UTC days and the ingest ran in the last 3 h. Passes when the untagged desktop client is repointed to Workers AI or stops, never by closing the issue. Accepting a higher level is the owner''s decision on the owner''s account and is a recorded migration that changes the threshold. Read 2026-10-19: 97.03 USD on 2026-10-18, 55.02 on 2026-10-17.'
WHERE class = 'issue-2750';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query', verify_probe =
 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM work_claims WHERE path = ''prompt-stores/sync_system_prompt.py'' AND claimed_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-14 days'')) > 0 THEN ''ok'' ELSE ''no-claim: the prompt-store sync has taken no work claim on prompt-stores/sync_system_prompt.py in 14 days, so two sessions can still interleave writes to one prompt store'' END AS observed',
  last_verdict = 'rearmed: HIGH-ISSUE-PROBES-1 (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || ')', attempts = 0, max_attempts = 24, next_due_at = datetime('now'),
  module = 'measuring-probe-high-issues-1', precondition = 'HIGH-ISSUE-PROBES-1: issue 2805 remaining piece (a last-writer claim around the prompt-store sync) measured, not its status',
  action = 'MEASURES the defect: the prompt-store sync (prompt-stores/sync_system_prompt.py, private repository) takes a work claim before it writes a store. The fix is POST /work-lock/acquire on qnfo-deploy-guard with key file:prompt-stores/sync_system_prompt.py before the write and /work-lock/release after, the same procedure CLAUDE.md gives sessions; the probe passes once a claim on exactly prompt-stores/sync_system_prompt.py exists in work_claims within 14 days (an unrelated claim on a prompt file does not count). It proves the claim is taken, not that every run takes it.'
WHERE class = 'issue-2805';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'code-read', verify_probe =
 '{"paths": [".github/workflows/deploy-gate.yml"], "contains": "\n  merge_group:"}',
  last_verdict = 'rearmed: HIGH-ISSUE-PROBES-1 (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || ')', attempts = 0, max_attempts = 24, next_due_at = datetime('now'),
  module = 'measuring-probe-high-issues-1', precondition = 'HIGH-ISSUE-PROBES-1: issue 2830 definition of done (a change cannot reach main with a red full suite) measured by its workflow half',
  action = 'MEASURES half of the defect: .github/workflows/deploy-gate.yml runs on merge_group, where the gate takes its non-pull_request branch and runs the full suite set (scripts/run-suites.mjs --all). The other half, a ruleset that requires the status check, is contract issue-2830-required-check. Both must pass. Path B or C of the issue replaces this probe by a migration naming the text that proves it.'
WHERE class = 'issue-2830';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'external-https', verify_probe =
 '{"url": "https://api.github.com/repos/QNFO/qnfo-workers/rules/branches/main", "method": "GET", "check": "body-contains:required_status_checks", "expected": "present"}',
  last_verdict = 'rearmed: HIGH-ISSUE-PROBES-1 (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || ')', attempts = 0, max_attempts = 24, next_due_at = datetime('now'),
  module = 'measuring-probe-high-issues-1', precondition = 'HIGH-ISSUE-PROBES-1: issue 2927 definition of done (an active main ruleset with required checks) measured on the public GitHub API',
  action = 'MEASURES the first half of the definition of done: GET /repos/QNFO/qnfo-workers/rules/branches/main lists a required_status_checks rule (the active ruleset). The code-scanning half (high alerts on deployed worker.js = 0) is the definition of done of issue 2928, which owns it; the alerts API needs a security_events grant no probe transport carries. A ruleset must let the GitHub App bypass, so the code loop keeps merging.'
WHERE class = 'issue-2927';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query', verify_probe =
 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM remediation_verifications WHERE replace(substr(verified_at, 1, 19), ''T'', '' '') >= datetime(''now'', ''-1 day'')) < 50 THEN ''too-few: under 50 verifications in the last day, the share is not meaningful'' WHEN (SELECT 100.0 * SUM(CASE WHEN t.trusted = 1 AND t.independent = 1 AND t.runtime_observable = 1 THEN 1 ELSE 0 END) / COUNT(*) FROM remediation_verifications v LEFT JOIN transport_trust t ON t.transport = v.transport WHERE replace(substr(v.verified_at, 1, 19), ''T'', '' '') >= datetime(''now'', ''-1 day'')) >= 10 THEN ''ok'' ELSE ''monoculture: '' || (SELECT ROUND(100.0 * SUM(CASE WHEN t.trusted = 1 AND t.independent = 1 AND t.runtime_observable = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) FROM remediation_verifications v LEFT JOIN transport_trust t ON t.transport = v.transport WHERE replace(substr(v.verified_at, 1, 19), ''T'', '' '') >= datetime(''now'', ''-1 day'')) || '' percent of the last 24 h of verifications observed a running service from an independent vantage, the trigger needs at least 10'' END AS observed',
  last_verdict = 'rearmed: HIGH-ISSUE-PROBES-1 (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || ')', attempts = 0, max_attempts = 24, next_due_at = datetime('now'),
  module = 'measuring-probe-high-issues-1', precondition = 'HIGH-ISSUE-PROBES-1: issue 2081 (runtime_verified_share_24h under 10) measured from raw verifications',
  action = 'MEASURES the defect the trigger watches: the share of the last 24 h of remediation_verifications whose transport is trusted, independent and runtime-observable in transport_trust, computed exactly as scripts/remediation_consumer.py does, is at least 10 (trigger threshold; the registry target is 25). The lever is more runtime probes (runner-https, external-https, code-read of deployed text) or fewer redundant SQL probes per hour. TRIGGER-RECOVERY-1 closes the metric issue when the metric converges; this contract must read ok first.'
WHERE class = 'issue-2081';

-- 2. Second contract of issue 2830 (all contracts of an issue must pass before it can close).
INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to,
  expected_cadence_h, status, module, next_due_at, attempts)
VALUES ('issue-2830-required-check', 2830, 'HIGH-ISSUE-PROBES-1: issue 2830 enforcement half, the status check is required by a ruleset on main',
 'MEASURES the enforcement half of issue 2830: the active rules on main (GET /repos/QNFO/qnfo-workers/rules/branches/main, public, no credential) include a required_status_checks rule, so a red gate blocks the merge. Same fact as the first half of issue 2927; the two issues close on one ruleset change.',
 '{"url": "https://api.github.com/repos/QNFO/qnfo-workers/rules/branches/main", "method": "GET", "check": "body-contains:required_status_checks", "expected": "present"}', 'external-https', 24, 'qnfo-fleet-control', 1, 'active',
 'measuring-probe-high-issues-1', datetime('now'), 0);

-- 3. The decision, with its prediction and what it was measured against (decision_log is append-only; one row).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'an open high issue whose contract is superseded or probes only its own status can never close on evidence, so a probe that measures the defect it describes is the smallest complete fix, and it must fail while the defect stands',
  'HIGH-ISSUE-PROBES-1: contracts issue-2750, 2805, 2830, 2927 and 2081 re-pointed at measuring probes and set active, issue-2830-required-check added; thresholds chosen: 2750 the 10 USD daily cap on 3 UTC days, 2805 a work claim on prompt-stores/sync_system_prompt.py within 14 days, 2830 deploy-gate on merge_group plus a required status check ruleset (path A), 2927 a required_status_checks rule on main, 2081 runtime share at least 10 as the trigger states',
  'read 2026-10-19 13:0xZ, each probe run read-only: 2750 observed burn 97.03 USD (2026-10-18), 2805 no claim, 2927 and 2830 no required_status_checks rule (ruleset 25060446 holds deletion and non_fast_forward), 2830 no merge_group in deploy-gate.yml, 2081 share 8.3 of 8172 verifications; issues_without_next_action 70',
  'migration merged', 'five contract rows re-pointed and one added; no issue status, threshold, trigger, cap or hold changes', 'see the Rollback header: restore the five rows from bak_20261019_high_issue_probes and delete issue-2830-required-check',
  'five open high issues carry a probe that measures their defect, so each closes on evidence and none is a dead end',
  'issues_without_next_action <= 66 within 6 h',
  'the issue-2830 and 2927 probes also name the change the fleet must make, so the code loop and sessions have a definition of done to implement',
  'd1:qnfo-audit remediation_contracts, ai_spend_owner_local, work_claims, remediation_verifications, transport_trust; api.github.com rules/branches/main; .github/workflows/deploy-gate.yml'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'HIGH-ISSUE-PROBES-1:') = 1);
