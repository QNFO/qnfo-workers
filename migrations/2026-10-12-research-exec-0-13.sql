-- RESEARCH-EXEC-0-13 (2026-10-12, pillar research; agent_issues 2221, 2247, 2206, 2207, 2252, 2292, 2262, 2052, 2211, 2170).
-- qnfo-research-exec 0.13.0 corrects the verify comparator (VERIFY-STATED-PRECISION-1), gives grounding a second source
-- (GROUND-SECOND-SOURCE-1) and adds three controls. This file does the data side:
--  1. Re-arms the research_queue rows that parked on the two defects, once each (terminal_rearms = 0 only), with the prior
--     state kept in bak_20261012_research_rearm. Measured 2026-10-12: 32 rows created since 2026-10-01 (5 for a thin
--     bibliography with arXiv refusing, 27 for "verify: unresolved after revision - mismatch=true"). Row a2033fc2's
--     verification printed "computed=4.28001e-21 expected=4.28e-21 match=no" for six of eight claims: correct values at the
--     paper's stated precision, refused by a 1e-6 comparison. A re-armed row that fails again under the corrected
--     comparator parks as before and is not re-armed a second time.
--  2. Registers the controls the worker adds or changes (control_registry, DOCTRINE-1).
--  3. Records the failure modes and their detectors (failure_modes, fm-<key> contracts, ANTIFRAGILE-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE research_queue SET status = (SELECT b.status FROM bak_20261012_research_rearm b WHERE b.id = research_queue.id), stage = (SELECT b.stage FROM bak_20261012_research_rearm b WHERE b.id = research_queue.id), error = (SELECT b.error FROM bak_20261012_research_rearm b WHERE b.id = research_queue.id), recover_count = (SELECT b.recover_count FROM bak_20261012_research_rearm b WHERE b.id = research_queue.id), terminal_rearms = (SELECT b.terminal_rearms FROM bak_20261012_research_rearm b WHERE b.id = research_queue.id), context = (SELECT b.context FROM bak_20261012_research_rearm b WHERE b.id = research_queue.id) WHERE status = 'queued' AND id IN (SELECT id FROM bak_20261012_research_rearm); DELETE FROM control_registry WHERE control IN ('research-review-hard-gate', 'research-gate-structure', 'research-citation-unverified-hold', 'research-verify-unrun-retry'); DELETE FROM remediation_contracts WHERE class IN ('fm-verify-comparator-stricter-than-stated', 'fm-grounding-single-source-refused', 'fm-unconfirmed-citation-published', 'fm-review-hard-findings-advanced'); DELETE FROM failure_modes WHERE fm_key IN ('verify-comparator-stricter-than-stated', 'grounding-single-source-refused', 'unconfirmed-citation-published', 'review-hard-findings-advanced', 'verification-unrun-read-as-pass');

CREATE TABLE IF NOT EXISTS bak_20261012_research_rearm AS
SELECT id, status, stage, error, recover_count, terminal_rearms, attempt, context, claimed_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at
FROM research_queue
WHERE status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0 AND created_at >= '2026-10-01'
  AND substr(error, 1, 16) = 'PARKED-POISON-1:'
  AND (instr(error, 'last error: ground: bibliography') > 0 OR instr(error, 'last error: verify: unresolved after revision - mismatch=true') > 0);

UPDATE research_queue
SET status = 'queued', stage = NULL, claimed_at = NULL, attempt = 0, recover_count = 0, terminal_rearms = terminal_rearms + 1, context = NULL,
    error = substr('REARMED 2026-10-12 (RESEARCH-EXEC-0-13: parked under the 1e-6 verify comparator or the single-source grounding; prior state in bak_20261012_research_rearm). Was: ' || COALESCE(error, ''), 1, 300)
WHERE status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0
  AND id IN (SELECT id FROM bak_20261012_research_rearm);

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
  ('research-review-hard-gate', 'qnfo-research-exec stageReview (REVIEW-HARD-GATE-1); ops_config research_review_gate', 'gate',
   'a paper published with HARD reviewer findings unresolved (truncated body, missing sections, unsupported statements)', 1, 'keep', 'applied',
   'ops_config research_review_gate = measure restores the advance to verify without a deploy; a withheld row re-drafts through the recover loop',
   NULL, 'cloud_ops_events 2026-10-09 to 2026-10-12: 158 of 421 review->verify steps carried hardLeft > 0; row 2d279690 went on with "paper ends mid-sentence" and three missing sections', 2211, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('research-gate-structure', 'qnfo-research-exec finalGates (GATE-STRUCTURE-1)', 'gate',
   'a new paper cut off at the model output cap whose mechanical reference list hid the cut', 1, 'keep', 'applied',
   'a failing first pass goes to revise; remediation papers are exempt (they keep their own structure)',
   NULL, 'R2 pipeline/2d279690/fixes.json 2026-10-12: sections 5 to 7 absent, body ends inside section 4.2', 2221, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('research-citation-unverified-hold', 'qnfo-research-exec publishStageV2 (CITATION-UNVERIFIED-HOLD-1); status held with the revert line', 'hold',
   'a paper published while a cited arXiv id, DOI or link could not be confirmed', 1, 'keep', 'applied',
   'second lookup at DataCite for arXiv ids; 30 minutes of retries in review; research_hold_expiry_tick releases the hold after 6 h; ops_config research_citation_gate = measure',
   NULL, 'cloud_ops_events 2026-10-09 to 2026-10-12: 7 of 77 citation-gate runs ended unverified and published', 2052, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('research-verify-unrun-retry', 'qnfo-research-exec stageVerify (VERIFY-UNRUN-1)', 'gate',
   'a paper sent to publish when its verification script printed no result', 1, 'keep', 'applied',
   'three attempts ten minutes apart, then the pass fails and the recover loop re-drafts',
   NULL, 'code on main before 0.13.0: mismatch was a regex over the output, so an empty or failed run read as no mismatch', 2221, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

UPDATE control_registry SET disposition_state = 'applied', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  evidence = 'qnfo-research-exec 0.10.0 runs research_parallel rows per tick (ops_config research_parallel = 4 on 2026-10-12, four rows researching); the lease now serialises invocations only'
WHERE control = 'research-single-flight-lease';

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('verify-comparator-stricter-than-stated', 'An integrity check compares a rounded stated value with an unrounded computed one at a fixed tight tolerance',
   'the VERIFY_GEN prompt told the script to use math.isclose(rel_tol=1e-6) and stageVerify read the script''s own match=no',
   'qnfo-research-exec 0.13.0 VERIFY-STATED-PRECISION-1: the worker decides each CLAIM line at the precision the paper states',
   'fewer than 3 done events with the exact text {"ok":false,"stage":"verify"} and status error in 24 h', 'fm-verify-comparator-stricter-than-stated', '2026-10-08', 2221,
   'any paper that states a computed number to fewer digits than a float carries', '45 verify failures in 24 h, about half of all second verify passes; each re-ran the whole pipeline from ground up to three times',
   'research throughput and the largest AI cost line of the fleet'),
  ('grounding-single-source-refused', 'Grounding depends on one literature host that rate-limits the fleet',
   'each parallel slot spaced only its own arXiv requests and retried a refusal once after the same pause',
   'qnfo-research-exec 0.13.0 GROUND-SECOND-SOURCE-1: one arXiv queue per isolate, backoff with Retry-After, DataCite arXiv records as a second host',
   'fewer than 3 ground done events with status error in 24 h', 'fm-grounding-single-source-refused', '2026-10-09', 2247,
   'two or more slots grounding in one tick, or arXiv refusing the account egress', 'ground-thin events with arxiv_http_errors >= 1; rows parked for a bibliography under five entries',
   'every queued idea whose queries meet a refusal'),
  ('unconfirmed-citation-published', 'A citation gate that fails open publishes what it could not check',
   'citationGateStep returned proceed for a lookup error so a refusing host could not block the queue head',
   'qnfo-research-exec 0.13.0 CITATION-UNVERIFIED-HOLD-1: second lookup, 30 minutes of retries, then a hold with a six-hour expiry',
   'no research row published within two minutes after its own citation-gate warn event in 24 h', 'fm-unconfirmed-citation-published', '2026-10-09', 2052,
   'arXiv or doi.org refusing at publish time', '7 of 77 gate runs in four days ended unverified and published', 'published papers'),
  ('review-hard-findings-advanced', 'A bounded review loop sends a paper on with its findings unresolved when the bound is reached',
   'stageReview advanced to verify at MAX_REVIEW_CYCLES with hardLeft recorded and never read again; stageRevise advanced when no edit applied',
   'qnfo-research-exec 0.13.0 REVIEW-HARD-GATE-1 and REVISE-NO-UNREVISED-1: the pass fails with the finding ids and the row re-drafts',
   'no review-unresolved event in measure mode in 24 h', 'fm-review-hard-findings-advanced', '2026-10-09', 2211,
   'a reviewer finding the patch reviser cannot resolve in two cycles, most often a draft cut off at the output cap', '158 of 421 review->verify steps carried HARD findings; 52 revise passes applied no edit and advanced',
   'published papers'),
  ('verification-unrun-read-as-pass', 'A check that did not run is read as a check that passed',
   'the verify stage looked for match=no in the output, so an empty output or a failed script had no mismatch',
   'qnfo-research-exec 0.13.0 VERIFY-UNRUN-1: no CLAIM line is a verification that did not run; retried, then failed',
   'remediation_contracts fm-verify-comparator-stricter-than-stated and the verify-unrun events', 'fm-verify-comparator-stricter-than-stated', '2026-10-12', 2221,
   'the pilot container not answering or the generated script raising', 'none measured: the event did not exist before 0.13.0', 'published papers with quantitative claims');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at) VALUES
  ('fm-verify-comparator-stricter-than-stated', NULL, 'VERIFY-STATED-PRECISION-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''done'' AND status = ''error'' AND text = ''{"ok":false,"stage":"verify"}'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') AND ts > COALESCE((SELECT MIN(ts) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''verify-adjudication''), ''9999'')) < 3 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now')),
  ('fm-grounding-single-source-refused', NULL, 'GROUND-SECOND-SOURCE-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''done'' AND status = ''error'' AND instr(text, ''"stage":"ground"'') > 0 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') AND ts > COALESCE((SELECT MIN(ts) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''verify-adjudication''), ''9999'')) < 3 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now')),
  ('fm-unconfirmed-citation-published', NULL, 'CITATION-UNVERIFIED-HOLD-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events e JOIN research_queue q ON substr(q.id, 1, 8) = substr(e.text, 1, 8) WHERE e.job = ''qnfo-research-exec'' AND e.kind = ''citation-gate'' AND e.status = ''warn'' AND e.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') AND e.ts > COALESCE((SELECT MIN(ts) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''verify-adjudication''), ''9999'') AND q.status = ''published'' AND julianday(q.published_at) - julianday(e.ts) BETWEEN 0 AND 0.0014) THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now')),
  ('fm-review-hard-findings-advanced', NULL, 'REVIEW-HARD-GATE-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''review-unresolved'' AND instr(text, ''mode=measure'') > 0 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'));
