-- EXTRACT-FAIL-PROBE-1 (2026-10-19, pillar research; agent_issues 2877, LOOP-BREAKER-1 qnfo-research-exec verify extractFailed).
-- Companion to qnfo-research-exec 0.28.5 (RESEARCH-EXEC-STAGE-FIXES-1, PAIR-AWARE-ESCAPE-1). The issue closed twice (05:42Z and
-- 11:46Z on 2026-10-19) and reopened twice because the first fix (EXTRACT-JSON-ROBUST-1, 0.19.1) was judged by a code-probe on the
-- marker text alone, which passes whether or not the defect is present. The contract that now stands (class issue-2877, d1-query)
-- reads v_loop_breaker_signatures: it measures the defect, but only at the third failed attempt of a row (an error-level done
-- event). Since RETRY-NOT-ERROR-1 the first two failed attempts are warn events, so a parse failure that costs every row two
-- retries (66 verify-extract-fail events in 24 h, 55 of them parse failures, 4 rows exhausted all three attempts) leaves the
-- signature quiet for hours and the contract could pass with the defect still present.
-- The probe now counts, over the last 300 minutes, the failures of the extraction itself: a verify-extract-fail event whose reason
-- is "unparseable" (the reply held JSON that did not parse: the backslash and 'after JSON' causes, whatever their wording after
-- 0.28.5 reports the first failing try's reason), and any exhausted extraction (an error-level done event carrying extractFailed,
-- any cause). It is not satisfied by silence: fewer than 15 verify done events in the window read 'no-activity' (the former floor
-- of 6 in 120 minutes scaled to the window; live 2026-10-19: 82 in the 300 minutes to 18:40Z). It does not read a marker, a version
-- or the new event fields, so the fix changing the wording of a reason cannot make it pass. An empty reply on its own (a gateway
-- outcome, 8 in 24 h) and a reply with no JSON at all (the model rewrote the paper, 3 in 24 h) are retried by the stage and do not
-- count until they exhaust it.
-- Why 300 minutes (the window must be longer than the gaps between bursts). Counting events alone says nothing about which code
-- made them, and the failures arrive in bursts. From 2026-10-17T21:46Z to 2026-10-19T23:14Z the old code was live and logged 87
-- unparseable and 71 exhausted extractions; the longest gaps between two of them were 219 minutes (15:02Z to 18:41Z on 10-19), 178,
-- 171 and 157. A 120-minute window is shorter than all of those: replayed over those real times with the deploy gate open and 20
-- verify done events an hour, a 120-minute window with a 6-event floor reads ok at 43 of 421 five-minute points between
-- 2026-10-18T12:00Z and 2026-10-19T23:00Z (for example at 17:15Z, 18:15Z and 18:40Z on 10-19, with 36, 22 and 20 verify done events
-- and no failure), so a pass there says almost nothing about the fix. The 300-minute window with the 15-event floor reads ok at
-- 0 of the same 421 points and defect at every one (migrations/extract-fail-probe.test.mjs replays them), 81 minutes longer than the
-- longest gap seen. A residual cause that survives the release at the same cadence therefore keeps the contract at defect.
-- The window is a measurement horizon stated in minutes, not a queue SLA. SLA-120M-1 bounds how long an item may sit stuck before
-- action starts and does not limit how long a probe must observe before a pass means something: closing probes written the same
-- day measure over 24 hours (fm-empty-reply-glm-instr), 7 days (issue-triage-state-normalise) and 14 days (code-loop-anchor-probes),
-- and 40 migrations since 2026-10-15 that write a verify_probe also carry hour or day window literals. The cost is stated, not hidden: the issue
-- cannot close sooner than 300 minutes after the deploy plus one more hourly read (it was reopened, so the autoclose trigger needs
-- two consecutive passes), so it stays past the 120-minute issue target (ISSUE-SLA-2H-1) by design; meanwhile the contract reads
-- 'not-live-300m', 'no-activity' or 'defect' every hour instead of passing on a quiet gap, and the stuck views and the 120-minute
-- escalation keep the issue in sight.
-- The probe is tied to the deploy (a deploy gate is its first branch), because the same counts over the old code in a quiet gap read
-- ok: at past instants of 2026-10-19, while the defect was live, the 120-minute counts gave verify done events and failures of 61/0
-- at 07:45Z, 33/0 at 10:45Z, 36/0 at 17:15Z, 26/0 at 17:45Z, 22/0 at 18:15Z and 20/0 at 18:40Z. The first branch reads
-- deployment_history: a successful deploy (action deploy, or deploy-direct from DEPLOY-SECOND-PATH-1) of qnfo-research-exec whose
-- version_id is the release or past it, whose deployed_at is at least 300 minutes old (the window's length, so every event it counts
-- postdates the deploy), with no later successful deploy below the release (a revert shuts the gate again); else 'not-live-300m'
-- (not 'pending...', which the consumer reads as a deferral). "The release or past it" is either path: the leading x.y.z of
-- version_id is at least 0.28.5, parsed in SQL (CAST of the three parts, GLOB-guarded, compared as a number, so 0.9.10 is below
-- 0.28.5 and 0.28.10 above it, which a string compare gets wrong both ways), or the version_id carries the tag extract-xref-fixes
-- (0.28.5-extract-xref-fixes) for a version_id the parser cannot read. The numeric rule is the first path because
-- qnfo-research-exec is the hottest worker (at least 25 successful deploys on 2026-10-19) and a re-bump (VERSION-AHEAD-1) by another
-- PR or the stale-PR lane need not keep the suffix; the gate no longer depends on one string reaching the ledger. A ledger row of the
-- release is history, so a later bump past it keeps the gate open. deployed_at is compared through datetime() because the column
-- holds four formats ('2026-10-19T22:06:18.570Z', '2026-10-17T14:39:29Z', '2026-09-26 09:16:01', microsecond Z). With the gate open
-- the whole 300-minute event window lies after the deploy, so ok means 300 minutes of verify activity on the fixed code with no
-- unparseable or exhausted extraction. Limit: a cause that fails less often than once in 300 minutes of 15 or more verify passes is
-- not seen by one read; the fm-research-extract-parse detector (3 in 120 minutes) and LOOP-BREAKER-1 stay on it afterwards.
-- Live now (2026-10-19, read-only): expected ok, observed not-live-300m (0.28.1-proportionate-notice, deployed 22:06Z, is the live
-- release; no ledger row is at or past 0.28.5 or carries the tag). Before the gate the same probe read defect on 4 unparseable
-- failures in 120 minutes.
-- Guarded on the signature probe it replaces, so a replay, or a probe someone else already changed, is left alone.
-- Also here: the failure_modes rows and fm-<key> detectors for the two failures the release fixes (ANTIFRAGILE-1): the extraction
-- that cannot parse its reply (issue 2877) and the complete stage that stalls on a dangling "Section N" (issue 2671, whose standing
-- signature contract already measures the defect and is left as it is).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM v_loop_breaker_signatures WHERE producer = ''qnfo-research-exec'' AND sig = ''{"ok":false,"stage":"verify","extractFailed":,"c'' AND datetime(last_ts) > datetime(''now'', ''-6 hours'')) THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-2877' AND instr(verify_probe, 'verify-extract-fail') > 0; DELETE FROM remediation_contracts WHERE class IN ('fm-research-extract-parse', 'fm-research-complete-xref-stall'); DELETE FROM failure_modes WHERE fm_key IN ('research-extract-parse', 'research-complete-dangling-xref-stall'); decision_log is append-only and keeps its row.

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM deployment_history d WHERE d.resource_name = ''qnfo-research-exec'' AND d.action IN (''deploy'', ''deploy-direct'') AND d.status = ''success'' AND datetime(d.deployed_at) <= datetime(''now'', ''-300 minutes'') AND (d.version_id LIKE ''%extract-xref-fixes%'' OR (d.version_id GLOB ''[0-9]*.[0-9]*.[0-9]*'' AND CAST(d.version_id AS INTEGER) * 1000000 + CAST(substr(d.version_id, instr(d.version_id, ''.'') + 1) AS INTEGER) * 1000 + CAST(substr(d.version_id, instr(d.version_id, ''.'') + instr(substr(d.version_id, instr(d.version_id, ''.'') + 1), ''.'') + 1) AS INTEGER) >= 28005)) AND NOT EXISTS (SELECT 1 FROM deployment_history g WHERE g.resource_name = ''qnfo-research-exec'' AND g.action IN (''deploy'', ''deploy-direct'') AND g.status = ''success'' AND datetime(g.deployed_at) > datetime(d.deployed_at) AND NOT (g.version_id LIKE ''%extract-xref-fixes%'' OR (g.version_id GLOB ''[0-9]*.[0-9]*.[0-9]*'' AND CAST(g.version_id AS INTEGER) * 1000000 + CAST(substr(g.version_id, instr(g.version_id, ''.'') + 1) AS INTEGER) * 1000 + CAST(substr(g.version_id, instr(g.version_id, ''.'') + instr(substr(g.version_id, instr(g.version_id, ''.'') + 1), ''.'') + 1) AS INTEGER) >= 28005)))) THEN ''not-live-300m'' WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''done'' AND instr(text, ''"stage":"verify'') > 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-300 minutes'')) < 15 THEN ''no-activity'' WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-300 minutes'') AND ((kind = ''verify-extract-fail'' AND instr(text, ''reason=unparseable'') > 0) OR (kind = ''done'' AND status = ''error'' AND instr(text, ''extractFailed'') > 0))) = 0 THEN ''ok'' ELSE ''defect'' END AS observed',
    next_due_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE class = 'issue-2877'
  AND instr(verify_probe, 'v_loop_breaker_signatures') > 0
  AND instr(verify_probe, 'extractFailed') > 0;


-- The two failure modes the worker release fixes (ANTIFRAGILE-1: a failure_modes row and an fm-<key> detector in the PR that fixes
-- it). INSERT OR IGNORE keeps a replay a no-op. Detector windows are 120 minutes; '1' reads healthy, '0' reads recurring.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('research-extract-parse', 'A verify claim extraction returns JSON that the worker cannot parse, so the row waits and re-extracts, and after three failures is re-queued at ground',
   'escapeLoneBackslashes judged each backslash by the character after it, so the second backslash of an already escaped pair was escaped again and a reply mixing "\\sqrt" with a lone "\Gamma" parsed in neither form; the greedy first-to-last-brace slice, tried last, then overwrote the real failure with "Unexpected non-whitespace character after JSON"',
   'qnfo-research-exec 0.28.5 PAIR-AWARE-ESCAPE-1: a valid JSON escape is consumed as one token and only a backslash that starts none is doubled; the reason is the first failing try''s; the verify-extract-fail event adds tail= and near=',
   'fewer than 3 verify-extract-fail events with reason=unparseable in 120 minutes', 'fm-research-extract-parse', '2026-10-19', 2877,
   'a claim statement written as LaTeX in a reply where some backslashes are doubled and some are not, or a pretty-printed list whose later object holds one',
   '66 verify-extract-fail events in 24 h on 2026-10-19 (55 parse failures), 4 rows exhausted all three attempts; LOOP-BREAKER-1 issue 2877 closed twice and reopened twice',
   'research throughput: every verify pass that meets such a reply costs two extra extraction model calls and a wait of VERIFY_UNRUN_WAIT_MS'),
  ('research-complete-dangling-xref-stall', 'The complete stage stalls on a paper that has every section and a clean ending but cites a Section N above its last heading, and the row is re-queued at ground with its draft discarded',
   'paperCompleteness set truncated for a dangling reference alone, so stageComplete asked a model to continue a finished paper; the continuation added under 300 chars three rounds running (COMPLETE_STALL_MAX) and markError re-queued the row',
   'qnfo-research-exec 0.28.5 XREF-REPAIR-1: danglingSectionRefs is the one definition shared by the completeness check and repairDanglingSectionRefs, which rewords exactly those spans to "the relevant section(s)" with no model call (event xref-repair); a dangling reference alone no longer sets truncated',
   'no rerun-route event "rounds added nothing; still cites missing section" in 120 minutes', 'fm-research-complete-xref-stall', '2026-10-19', 2671,
   'a writer or floor-extend section that refers to a Section N the paper does not have, in a paper that is otherwise complete',
   '3 complete-stage stalls on 2026-10-19 (12:44Z, 17:11Z, 21:22Z), each re-queued at ground; LOOP-BREAKER-1 issue 2671 reopened three times',
   'research throughput: a whole draft discarded per stall, and review, revise and verify bounce a dangling-reference paper back to complete');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at) VALUES
  ('fm-research-extract-parse', NULL, 'PAIR-AWARE-ESCAPE-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''verify-extract-fail'' AND instr(text, ''reason=unparseable'') > 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) < 3 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now')),
  ('fm-research-complete-xref-stall', NULL, 'XREF-REPAIR-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''rerun-route'' AND instr(text, ''rounds added nothing'') > 0 AND instr(text, ''still cites missing section'') > 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) < 1 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
 'an issue about a live parse failure closes on a measurement of that failure over a window longer than the gaps between its bursts and tied to the deploy that carries the fix, not on a marker in the source, not on a signal that only fires at the third retry and not on a quiet gap of the old code; a probe window is a measurement horizon stated in minutes, not a queue SLA',
 'EXTRACT-FAIL-PROBE-1: remediation_contracts class issue-2877 reads verify-extract-fail (reason unparseable) and exhausted extractions in the last 300 minutes with a 15-event activity floor, behind a deploy gate on deployment_history (a deploy at or past 0.28.5, or the tag extract-xref-fixes, at least 300 minutes old, with no lower deploy after it); migrations/2026-10-19-extract-fail-probe.sql, companion of qnfo-research-exec 0.28.5',
 'cloud_ops_events 2026-10-17 to 10-19: 87 unparseable verify-extract-fail and 71 exhausted extractions, the longest gaps between two of them 219, 178, 171 and 157 minutes (219 from 15:02Z to 18:41Z on 10-19); the issue closed at 05:42Z and 11:46Z on the marker code-probe and reopened at 05:45Z and 20:14Z; the standing signature probe failed 25 times; the 120-minute counts read at 07:45Z, 10:45Z, 17:15Z, 17:45Z, 18:15Z and 18:40Z (defect live) gave 61/0, 33/0, 36/0, 26/0, 22/0 and 20/0 (verify done events/failures); replayed over the real failure times with the gate open, a 120-minute window reads ok at 43 of 421 five-minute points between 10-18T12:00Z and 10-19T23:00Z and the 300-minute window at 0; the new probe reads not-live-300m now (0.28.1 live, no ledger row at or past 0.28.5 or with the tag)',
 'applied through the canonical path on merge; the contract is evaluated at its next tick', 'one remediation_contracts row (issue-2877); no worker, queue or cron',
 'the migration Rollback line restores the signature probe text; the issue and its other contract fields are unchanged',
 'the fleet can tell a parse failure that is retried from one that is gone',
 'the contract reads not-live-300m until a successful deploy of qnfo-research-exec at or past 0.28.5 (leading x.y.z at least 0.28.5, or version_id tag extract-xref-fixes), with no lower deploy after it, is at least 300 minutes old, so it cannot read ok sooner than that; then ok only if verify shows 15 or more done events and no unparseable or exhausted extraction in the 300 minutes since the deploy, otherwise defect and the next cause shows in the tail= and near= fields of the event; the issue closes no sooner than 300 minutes after the deploy plus one hourly read, past the 120-minute issue target by design, because a pass inside 120 minutes cannot tell a fix from a quiet gap', 'none',
 'migrations/extract-fail-probe.test.mjs: the migration and the probe on node:sqlite fixtures (deploy gate: no row, young row, failed deploy, other worker, lower release, numeric compare 0.9.10 and 0.28.10, a version past the release without the tag, the tag without a parseable version, a revert after the release, old row; defect, ok, no-activity, window edges, empty-reply and no-json-list not counted, exhausted extraction counted, replay, guard, rollback) and a replay of the real failure times of 2026-10-17 to 10-19 with the gate open: ok at 0 of 421 five-minute points, the 120-minute window ok at 43'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'EXTRACT-FAIL-PROBE-1:') = 1);
