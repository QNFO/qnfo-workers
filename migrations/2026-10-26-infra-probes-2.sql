-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261026_rem_a6_probes2 b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261026_rem_a6_probes2 b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261026_rem_a6_probes2 b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_rem_a6_probes2 b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261026_rem_a6_probes2 b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261026_rem_a6_probes2 b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261026_rem_a6_probes2 b WHERE b.class = remediation_contracts.class) WHERE class IN ('issue-1000162', 'fm-ops-capped-reply-logged-ok') AND EXISTS (SELECT 1 FROM bak_20261026_rem_a6_probes2 b WHERE b.class = remediation_contracts.class); UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback INFRA-PROBES-2' WHERE class = 'fm-ops-stream-incomplete-long'; UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_rem_a6_probes2_desc b WHERE b.id = agent_issues.id) WHERE id = 1000162 AND EXISTS (SELECT 1 FROM bak_20261026_rem_a6_probes2_desc b WHERE b.id = agent_issues.id);
-- BACKUP: bak_20261026_rem_a6_probes2
-- INFRA-PROBES-2 (2026-10-26, pillar reliability; session rem-a6, infrastructure cluster of the 2026-10-26 issue remediation). Corrects two probes of INFRA-PROBES-1 that read the live tables after the merge.
-- (1) issue 1000162: the outcome probe (long incomplete streamed turns over 7 days, 3 today) was refused by the probe review at 19:30Z as self-confirming (it passes without the instrumentation the issue asks for), and a
--     refused contract is parked (status probe-review-refused), so the issue had no live closing contract. The issue text asks for instrumentation first and no speculative fix: issue-1000162 now reads qnfo-ops/worker.js for
--     OPS-STREAM-ABORT-1 (code-read, qnfo-ops 2.59.1, PR 4798, stream-abort.test.mjs 22 checks). The recurrence of a long incomplete streamed turn becomes a failure mode with a detector, fm-ops-stream-incomplete-long, that counts turns
--     after the instrumented deploy (0 at registration), so the first recurrence fails it with the ops_stream_abort row of that turn to read.
-- (2) fm-ops-capped-reply-logged-ok: the window of 7 days still holds 12 turns from before the fix (2026-10-20 to 2026-10-25), so the detector failed for a week for rows the fix cannot change; it now counts turns after the
--     deploy of qnfo-ops 2.59.1 (2026-10-26T19:00Z) or the last 7 days, whichever is later.
-- Previous contract rows are kept in bak_20261026_rem_a6_probes2 and the description of 1000162 in bak_20261026_rem_a6_probes2_desc (both created first, read by the Rollback line). Nothing is deleted. decision_log is only inserted into.

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_probes2 AS
SELECT class, status, verify_transport, verify_probe, last_verdict, module, precondition, action FROM remediation_contracts WHERE class IN ('issue-1000162', 'fm-ops-capped-reply-logged-ok');

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_probes2_desc AS
SELECT id, description FROM agent_issues WHERE id = 1000162;

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'code-read',
  verify_probe = '{"paths": ["qnfo-ops/worker.js"], "contains": "OPS-STREAM-ABORT-1"}',
  last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'infra-probes-2',
  precondition = 'INFRA-PROBES-2: issue 1000162 asks for instrumentation first and no speculative fix: a stream-terminal cloud_ops_events row (kind ops_stream_abort) when the SSE producer throws or ends without a finish chunk, correlated with ops_upstream_error',
  action = 'MEASURES the defect the issue states: qnfo-ops/worker.js on main carries OPS-STREAM-ABORT-1, the recorder that writes one ops_stream_abort row per stream that ends without its done frame (phase client-cancel, runner-throw, heartbeat-write-failed or done-write-failed; elapsed, tool calls, last tool, the newest ops_upstream_error of the previous ten minutes). stream-abort.test.mjs runs it (22 checks). The outcome probe (long incomplete streamed turns over 7 days) was refused by the probe review as self-confirming; the recurrence is measured by the detector fm-ops-stream-incomplete-long.'
WHERE class = 'issue-1000162';

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', last_verdict = NULL, attempts = 0, next_due_at = datetime('now'), module = 'failure-mode',
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ops_ai_log WHERE ok = 1 AND completion_tokens IN (8000, 8192) AND instr(response, ''The reply was cut at the output cap'') <> 1 AND ts > max(strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-7 days''), ''2026-10-26T19:00:00.000Z'')) AS TEXT) AS observed',
  action = 'failure-mode detector, bounded by INFRA-PROBES-2 to turns after the deploy of qnfo-ops 2.59.1 (2026-10-26T19:00Z): a turn that spends its whole output cap (completion_tokens exactly 8000 or 8192) and is logged ok 1 with anything except the honest capped line is the defect of issue 1000446 (the chain of thought returned as the answer). Twelve turns from 2026-10-20 to 2026-10-25 predate the fix and cannot be changed by it.'
WHERE class = 'fm-ops-capped-reply-logged-ok';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'ops-stream-incomplete-long',
  'A streamed qnfo-ops agent turn of 230 seconds or more ends without a final answer, so the client session ends in provider_error after minutes of waiting',
  'Not found. qnfo-ops 2.59.1 records one ops_stream_abort row per stream that ends without its done frame (phase, elapsed, tool calls, last tool, the newest ops_upstream_error); the rows are the evidence the cause is read from (agent_issues 1000162, instrumentation first and no speculative fix).',
  'Instrumentation shipped in qnfo-ops 2.59.1. When the detector fails, read the ops_stream_abort row of that turn before any change: client-cancel at a constant elapsed time names a client or proxy limit, runner-throw names a server cause.',
  'fm-ops-stream-incomplete-long d1-query: streamed agent turns of 230 s or more with ok 0 and the no-final-answer line after the instrumented deploy',
  'fm-ops-stream-incomplete-long',
  '2026-10-26',
  1000162,
  'a streamed agent turn runs 230 seconds or more and the log row ends ok 0 with the no-final-answer line',
  'ops_ai_log streamed 1, ok 0, latency_ms of 230000 or more; the client shows provider_error',
  'chat clients of the ops endpoint on long agent turns (3 turns between 2026-10-21 and 2026-10-24, before the instrumentation)'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-ops-stream-incomplete-long',
  NULL,
  'qnfo-ops 2.59.1 or later is deployed (2026-10-26T19:00Z)',
  'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ops_ai_log WHERE streamed = 1 AND ok = 0 AND latency_ms >= 230000 AND instr(response, ''no final answer within this turn'') > 0 AND ts > max(strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-7 days''), ''2026-10-26T19:00:00.000Z'')) AS TEXT) AS observed',
  'd1-query',
  1000,
  'qnfo-ops',
  1,
  'active',
  'failure-mode'
);

UPDATE agent_issues SET updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, description = description || char(10) || char(10) ||
 'REM-A6 2026-10-26 (update to the note above, which named an outcome probe as the closing contract): the probe review refused that probe as self-confirming, because it passes without the instrumentation this issue asks for, and a refused contract is parked. The closing contract now reads what the issue asks for: qnfo-ops/worker.js carries OPS-STREAM-ABORT-1 (qnfo-ops 2.59.1, the ops_stream_abort recorder). The root cause is still not found and is not speculated about: the failure mode ops-stream-incomplete-long with the detector fm-ops-stream-incomplete-long counts streamed agent turns of 230 s or more that ended without a final answer after the instrumented deploy (0 at registration; 3 before it, on 2026-10-21 and 2026-10-24). Next, when that detector fails: read the ops_stream_abort row of the turn (phase, elapsed_ms, last tool, the newest ops_upstream_error) before any change.'
WHERE id = 1000162 AND instr(description, 'REM-A6 2026-10-26 (update to the note above, which named an outcome probe') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a6',
  'a probe that a reviewer refuses as self-confirming leaves the issue with no live contract, and a detector whose window holds rows from before its fix fails for a week for a reason the fix cannot change; the smallest complete correction reads what the issue states and bounds a regression detector at the fix',
  'INFRA-PROBES-2: issue-1000162 re-pointed at a code-read probe on OPS-STREAM-ABORT-1, failure mode ops-stream-incomplete-long registered with a detector bounded at the instrumented deploy, fm-ops-capped-reply-logged-ok bounded at the deploy of qnfo-ops 2.59.1, one dated update on issue 1000162',
  'read in this session: cloud_ops_events probe-review row of 2026-10-26T19:30:55Z (verdict self-confirming, refused) and contract issue-1000162 status probe-review-refused; ops_ai_log holds 12 capped turns logged ok from 2026-10-20 to 2026-10-25 and none after the fix; 3 long incomplete streamed turns, none after 2026-10-24; qnfo-ops/worker.js carries OPS-STREAM-ABORT-1 three times',
  'applied by migration',
  'two contracts re-pointed or bounded, one failure mode and one detector added, one issue description extended once; no worker change',
  'the Rollback line restores the two contract rows from bak_20261026_rem_a6_probes2, supersedes the new detector and restores the description',
  'a refused probe is replaced by one that reads what the issue states',
  'issue-1000162 passes on its next consumer run; fm-ops-capped-reply-logged-ok reads 0',
  'no closing contract of this run is parked or fails for rows the fix cannot change',
  'the probe SQL was run against crafted rows (before and after the bound) in migrations/infra-probes-2.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE instr(d.action, 'INFRA-PROBES-2: issue-1000162 re-pointed') = 1);
