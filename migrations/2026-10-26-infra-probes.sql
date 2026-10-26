-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback INFRA-PROBES-1' WHERE module = 'infra-probes-1';
-- INFRA-PROBES-1 (2026-10-26, charter pillars reliability, autonomy and security; session rem-a6, infrastructure cluster of the 2026-10-26 issue remediation).
-- Eight open issues of the infrastructure cluster carry a placeholder contract (VACUOUS-PROBE-V3-1: it observes the issue's own status, so it measures nothing) or a probe whose window still holds rows
-- from before the fix. Each gets a probe that measures the condition its fix changes, so the closing machinery closes the issue on evidence:
--   * 1000018 BRANCH-HYGIENE-SUPERSEDED-PR-1   code-read: the merged-successor close is on main (qnfo-fleet-control 0.56.0, PR 4796, deployed)
--   * 1000036 OPS-ENDPOINT-BRANCH-CLOSE-GAP-1  code-read: the tool dispatch of github_pr_close is on main (qnfo-ops 2.59.0, PR 4764). The 2.58.1 function of the first tool was never declared or dispatched.
--   * 1000043 cf_analytics under-reports cost  code-read: the ledger cross-check (qnfo-ops 2.59.0). Live check 2026-10-26: the same GraphQL query returns 447 groups, 304.97 USD at list price, 301.56 USD
--                                              after the daily free neurons, against 312.73 USD in cost_daily for the same window (old reading 37.76 USD).
--   * 1000178 OPS-DASHBOARD-FEED-ERROR-BLIND-1 code-read: the fix of 2.57.4 (PR 4545). The old probe counted seven days of rows that predate it; no dashboard_feed row exists after the fix deployed.
--   * 1000162 provider_error after long turns  OUTCOME probe: long incomplete streamed turns in 7 days (4 on 2026-10-26). The instrumentation (ops_stream_abort, qnfo-ops 2.59.1) is the first step, the root cause is
--                                              not known, so the issue stays open until those turns stop; the old probe compared event counts with a count of turns that predate the instrumentation.
--   * 1000157 HEALTH-AUDIT-COVERAGE-1          d1-query: every live or retired registry worker has a worker_live_audit row from the last day (one is missing today: qnfo-workers).
--   * 1000275 GITHUB-STUCK-RUNS-1              re-armed on external-https (the runner transport refuses api.github.com, which is why the contract was set to superseded) and read with json:total_count (the API answers pretty-printed JSON, so a contains check on the compact text could never pass); a second contract covers the in-progress run; the issue is the
--                                              repository owner's to finish (GitHub answers delete 403 and cancel 409 for six wedged runs), so the probe fails until they are gone.
--   * fm-ops-capped-reply-logged-ok            refined: a capped turn that now answers with the honest line (qnfo-ops 2.59.1) is not the defect; a capped turn that returns anything else still is.
-- Two failure modes are registered with detectors: the 5.40.2 swallow of Workers AI capacity errors in qnfo-ai (code-read, absent) and the later-pass free-text sink of authored probes.
-- Nothing is deleted. decision_log is only inserted into.

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'code-read',
  verify_probe = '{"paths": ["qnfo-fleet-control/worker.js"], "contains": "BH-MERGED-SUCCESSOR-1"}',
  last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'infra-probes-1',
  precondition = 'INFRA-PROBES-1: issue 1000018 defect (a code-agent pull request superseded by a merged successor never closes) is a code defect of the hygiene tick',
  action = 'MEASURES the defect: qnfo-fleet-control/worker.js on main carries BH-MERGED-SUCCESSOR-1, the supersession rule that closes a code-agent pull request whose [issue #N] tag a merged pull request also carries. Behaviour is covered by the branch-hygiene suite scenario of that name; the old pinned pull request (3669) closed on 2026-10-25.'
WHERE class = 'issue-1000018';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'code-read',
  verify_probe = '{"paths": ["qnfo-ops/worker.js"], "contains": "res = await githubPrClose(env, args)"}',
  last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'infra-probes-1',
  precondition = 'INFRA-PROBES-1: issue 1000036 defect (qnfo-ops can neither delete a branch nor close a pull request) means a tool the endpoint can call, not a function nobody calls',
  action = 'MEASURES the defect: qnfo-ops/worker.js on main dispatches the tool github_pr_close (the dispatch line is the proof that the tool is reachable; the 2.58.1 function of the same family was merged with no declaration and no dispatch). github_branch_delete is declared and dispatched beside it (branch-close.test.mjs checks both, the guards and the branch_hygiene_log columns).'
WHERE class = 'issue-1000036';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'code-read',
  verify_probe = '{"paths": ["qnfo-ops/worker.js"], "contains": "OPS-CF-ANALYTICS-LEDGER-1"}',
  last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'infra-probes-1',
  precondition = 'INFRA-PROBES-1: issue 1000043 defect (cf_analytics under-reports Workers AI cost by 7.4x) was the 100 group limit, fixed in 2.58.2; what remained was a feed nobody could cross-check',
  action = 'MEASURES the defect: qnfo-ops/worker.js on main carries OPS-CF-ANALYTICS-LEDGER-1, the cross-check of cf_analytics against the cost_daily ledger (groups, truncated flag, billable cost, ledger ratio and mismatch flag, an audit row when they disagree, a GraphQL error is an error). The DoD figure was read live: est_cost_usd 304.97 and billable 301.56 against the ledger 312.73 for the same window.'
WHERE class = 'issue-1000043';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'code-read',
  verify_probe = '{"paths": ["qnfo-ops/worker.js"], "contains": "OPS-DASHBOARD-FEED-ERROR-BLIND-1"}',
  last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'infra-probes-1',
  precondition = 'INFRA-PROBES-1: issue 1000178 defect (dashboard_feed logs a non-2xx answer as ok false with an empty error) is fixed in qnfo-ops 2.57.4 (PR 4545)',
  action = 'MEASURES the defect: qnfo-ops/worker.js on main carries OPS-DASHBOARD-FEED-ERROR-BLIND-1, the branch that names status, path and the endpoint reason in error. full-plane-access.test.mjs asserts error HTTP 405 for /api/cmd: method_not_allowed. cloud_ops_events holds 0 dashboard_feed rows after the fix deployed (last row 2026-10-26T09:46Z), so a window probe would have measured the old rows.'
WHERE class = 'issue-1000178';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query',
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ops_ai_log WHERE streamed = 1 AND ok = 0 AND latency_ms >= 230000 AND instr(response, ''no final answer within this turn'') > 0 AND replace(substr(ts, 1, 19), ''T'', '' '') >= datetime(''now'', ''-7 days'')) AS TEXT) AS observed',
  last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'infra-probes-1',
  precondition = 'INFRA-PROBES-1: issue 1000162 defect (client sessions end in provider_error after 234 to 410 s agent turns) measured by its outcome, not by the instrumentation',
  action = 'MEASURES the defect: streamed agent turns of 230 s or more that ended without a final answer (ops_ai_log ok 0, the no-final-answer line), over 7 days; 4 on 2026-10-26. qnfo-ops 2.59.1 writes one ops_stream_abort cloud_ops_events row per stream that ends without its done frame (phase, elapsed, tool calls, last tool, the newest ops_upstream_error); the cause is not known yet, the rows are what the next step reads. Passes when no such turn occurs for 7 days.'
WHERE class = 'issue-1000162';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query',
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM service_registry s WHERE s.kind = ''worker'' AND s.state IN (''live'', ''retired'') AND NOT EXISTS (SELECT 1 FROM worker_live_audit w WHERE w.worker = s.service AND w.probed_at > datetime(''now'', ''-1 day''))) AS TEXT) AS observed',
  last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'infra-probes-1',
  precondition = 'INFRA-PROBES-1: issue 1000157 defect (worker_live_audit omits live workers, so the health metric reads them as absent, not as failing) measured as registry workers without a fresh audit row',
  action = 'MEASURES the defect: registry workers (live or retired) with no worker_live_audit row from the last day; 1 on 2026-10-26 (qnfo-workers, the 410 tombstone). The state pass of qnfo-fleet-control 0.56.1 fills a missing row (INSERT OR IGNORE; its old plain INSERT failed on the first existing row every pass, live_audit_write_error in every snapshot) and classifies the tombstone TOMBSTONE_410.'
WHERE class = 'issue-1000157';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'external-https',
  verify_probe = '{"url": "https://api.github.com/repos/QNFO/qnfo-workers/actions/runs?status=queued&created=%3C2026-10-20&per_page=1", "method": "GET", "check": "json:total_count", "expected": "0"}',
  last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'infra-probes-1',
  action = 'MEASURES the defect: queued workflow runs of QNFO/qnfo-workers older than 2026-10-20 (5 on 2026-10-26; a sixth run, 39698201166, is in_progress since 2026-10-22). GitHub answers delete 403 (Could not delete the workflow run) and cancel and force-cancel 409 for all six with two credentials, so the repository owner finishes it in the Actions UI or with GitHub Support (card github-wedged-runs-six); the probe passes when the queued ones are gone.'
WHERE class = 'issue-1000275';

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at, attempts)
VALUES ('issue-1000275-in-progress', 1000275, 'INFRA-PROBES-1: issue 1000275 second half, the workflow run stuck in progress since 2026-10-22',
 'MEASURES the second half of the defect: in_progress workflow runs of QNFO/qnfo-workers created before 2026-10-23 (1 on 2026-10-26: deploy-gate run 39698201166, whose only job concluded failure). Delete answers 403 and cancel answers 409 for it as for the five queued ones; the issue closes only when both contracts pass.',
 '{"url": "https://api.github.com/repos/QNFO/qnfo-workers/actions/runs?status=in_progress&created=%3C2026-10-23&per_page=1", "method": "GET", "check": "json:total_count", "expected": "0"}', 'external-https', 24, 'qnfo-fleet-control', 1, 'active',
 'infra-probes-1', datetime('now'), 0);

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', last_verdict = NULL, attempts = 0, next_due_at = datetime('now'),
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ops_ai_log WHERE ok = 1 AND completion_tokens IN (8000, 8192) AND instr(response, ''The reply was cut at the output cap'') <> 1 AND ts > strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-7 days'')) AS TEXT) AS observed',
  action = 'failure-mode detector, refined by INFRA-PROBES-1: a turn that spends its whole output cap (completion_tokens exactly 8000 or 8192) and is logged ok 1 with anything except the honest capped line (qnfo-ops 2.59.1) is the defect of issue 1000446: the chain of thought returned as the answer. The honest line is the fix, not the defect.'
WHERE class = 'fm-ops-capped-reply-logged-ok';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'ai-binding-swallow-capacity-error',
  'A code-loop change made the qnfo-ai Workers AI binding wrapper return an empty success for any error whose text matches spend, budget or cap, so a Workers AI capacity error (3040, Capacity temporarily exceeded) reached every caller as an empty reply',
  'qnfo-ai 5.40.2 (PR 4695, code task ct_im1000440) put the swallow in __aiAttrEnv, the wrapper every Workers AI call of the router passes, instead of in the ensemble context fallback the issue named; the marker the issue asked for was never added, the merge runner verified the version arrival only, and the regex cap matches Capacity.',
  'qnfo-ai 5.40.3 rethrows again and serves the refused paid route from its Workers AI twin in the two places the issue named (stream branch, ensemble context fallback); spend-twin-paths.test.mjs fails 30 of 42 checks on 5.40.2.',
  'fm-ai-binding-swallow-capacity-error code-read: the empty-success return is absent from qnfo-ai/worker.js',
  'fm-ai-binding-swallow-capacity-error',
  '2026-10-26',
  NULL,
  'a repair of a spend-twin issue is merged in the shared binding wrapper and a capacity error is thrown by Workers AI',
  'empty replies from the router with no thrown error, fallback chains that key on the error do not run',
  'every caller of the qnfo-ai router (chat clients, ensembles, the fleet command line)'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-ai-binding-swallow-capacity-error',
  NULL,
  'qnfo-ai 5.40.3 or later is deployed (2026-10-26)',
  'failure-mode detector',
  '{"paths": ["qnfo-ai/worker.js"], "absent": "return { text: \"\", usage: {} };"}',
  'code-read',
  1000,
  'qnfo-ai',
  1,
  'active',
  'failure-mode'
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'probe-author-later-pass-free-text',
  'A probe written by the live-path author is gated at birth to a number or one short token, but every later pass re-ran the stored SQL and copied the first row untruncated into remediation_verifications and, through the consumer run log, into main of the public repository',
  'The value gate ran once, on the birth dry run; rtRemediationTick and scripts/remediation_consumer.py consume_d1 recorded expected and observed as read. A branch not taken at birth, or a free-text column passed through hex() or substr(), reached the sinks.',
  'qnfo-fleet-control 0.56.0 (rtSinkGuard) and scripts/remediation_consumer.py: for a contract of module probe-author-1 a pass whose expected or observed is not one short token is a probe-error with the reason free-text-value and nothing is recorded; probe-author-sink.test.mjs (40 checks) and consumer-sink-guard.test.mjs fail on 0.55.4.',
  'fm-probe-author-later-pass-free-text d1-query: non-token verification values of probe-author-1 contracts in 24 hours',
  'fm-probe-author-later-pass-free-text',
  '2026-10-26',
  1000421,
  'a contract with module probe-author-1 exists and its probe selects a free-text column in a branch the birth dry run did not take',
  'remediation_verifications.observed or expected longer than 64 characters or with characters outside letters, digits and _ . : + -',
  'the public QNFO/qnfo-workers repository (ci-status/remediation-consumer.json) and the verification ledger: text from a private table, not recallable from git history'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-probe-author-later-pass-free-text',
  NULL,
  'qnfo-fleet-control 0.56.0 or later is deployed (2026-10-26)',
  'failure-mode detector',
  'SELECT 0 AS expected, COUNT(*) AS observed FROM remediation_verifications v JOIN remediation_contracts c ON c.class = v.class WHERE c.module = ''probe-author-1'' AND v.verified_at > datetime(''now'', ''-1 day'') AND (length(v.observed) > 64 OR length(v.expected) > 64 OR v.observed GLOB ''*[^A-Za-z0-9_.:+-]*'' OR v.expected GLOB ''*[^A-Za-z0-9_.:+-]*'')',
  'd1-query',
  1000,
  'qnfo-fleet-control',
  1,
  'active',
  'failure-mode'
);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a6',
  'an open issue whose contract observes only its own status, or reads rows from before the fix, can never close on evidence, so a probe that measures the condition the fix changes is the smallest complete closure; where the root cause is not found yet the probe measures the outcome and the issue stays open',
  'INFRA-PROBES-1: contracts of issues 1000018, 1000036, 1000043, 1000178 re-pointed at code-read probes, 1000162 at a seven day outcome probe, 1000157 at registry workers without a fresh audit row, 1000275 re-armed, fm-ops-capped-reply-logged-ok refined; failure modes ai-binding-swallow-capacity-error and probe-author-later-pass-free-text registered with detectors',
  'qnfo-ai 5.40.3 (PR 4738) and qnfo-infra 1.9.2 (PR 4747) live; qnfo-ops 2.59.0 (PR 4764) and 2.59.1 (PR 4798) and qnfo-fleet-control 0.56.0 (PR 4796) merged and deployed; cf_analytics query read live 447 groups, 304.97 USD list price, 301.56 USD billable, ledger 312.73 USD; /cmd answered at 18:14:05Z (cmd_log cmd-23c8e9b72fee21a8bdf3); worker_live_audit lacks exactly one registry worker; ops_ai_log holds 4 long incomplete streamed turns in 7 days',
  'applied by migration',
  'nine contracts changed, two failure modes and two detector contracts inserted; no worker change',
  'the Rollback line (the contracts go back to superseded); the failure-mode rows are append-only registers',
  'issues of the infrastructure cluster close on a probe that measures what the fix changed',
  'issues 1000018, 1000036, 1000043 and 1000178 close on their next consumer pass; 1000157 closes after the qnfo-fleet-control 0.56.1 state pass fills the missing row; 1000162 and 1000275 stay open on their outcome and on GitHub',
  'infrastructure defects are closed on evidence rather than left on placeholders',
  'code-read probes replay against the file on main; the d1 probes were run read-only on live qnfo-audit before this file'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE instr(d.action, 'INFRA-PROBES-1: contracts of issues 1000018') = 1);
