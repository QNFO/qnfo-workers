-- RESEARCH-FLOOR-1 data side (2026-10-19, pillar research; agent_issues 99913 RESEARCH-REVISE-LOOP-1, clusters
-- research-pipeline-1/research-short-drafts-blind-reviewer-terminal-parks and research-pipeline-2/research-terminal-length-floor).
-- qnfo-research-exec 0.24.0 stops a revise patch from shrinking a paper under the publish floor (REVISE-SHRINK-GUARD-1), makes the
-- complete stage extend a short paper to the floor (COMPLETE-TO-FLOOR-1) and routes gate-length / gate-refcount findings there
-- instead of to the find/replace reviser, which cannot add text. Measured 2026-10-19 on cloud_ops_events: 113 of 255 complete events
-- in 24 h were under 20,000 chars; 21 gate-length / gate-refcount / HARD-unresolved RESEARCH-TERMINAL issues in 24 h; 15 poison-parks
-- in one day. Single-patch shrink on 60 applied revise-patch events was at most 16% (20369 -> 18060, 40392 -> 34061).
--
-- WHY THIS FILE RE-QUEUES NOTHING. apply-migrations runs a file once, at merge, before the deploy is live. A re-arm UPDATE guarded on
-- "the fixed worker is live" would therefore never fire, and an unguarded one would queue 31 rows into the code that parked them.
-- Chosen instead: this file only FREEZES the candidates in bak_20261019_research_parked (rows parked as PARKED-POISON-1 with
-- gate-length, gate-refcount, HARD findings unresolved or no applicable edit, terminal_rearms = 0). The re-arm itself is
-- floorRearmTick in the corrected worker (FLOOR-REARM-1), which runs in its hourly sweep: it exists only in 0.24.0, reads the
-- frozen list (no table, no re-arm), returns 5 rows per run to stage complete (the draft is in R2), once each (terminal_rearms
-- 0 -> 1), and stops with ops_config park_rearm = off. No row can be queued before the fix is live, and the queue is metered
-- (31 rows in about 7 hours), not flooded. Rows that park again are not re-armed a second time.
--
-- Also here: (1) control_registry rows for the gate, the guard and the cap the worker adds (DOCTRINE-1), (2) the failure modes with
-- their fm-<key> detectors (ANTIFRAGILE-1), (3) a closing probe for issue 99913 that measures the defect (its own was a vacuous
-- 'closed' check) as a statement of its own, (4) the decision_log row.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_research_parked
-- Rollback: UPDATE research_queue SET status = (SELECT b.status FROM bak_20261019_research_parked b WHERE b.id = research_queue.id), stage = (SELECT b.stage FROM bak_20261019_research_parked b WHERE b.id = research_queue.id), error = (SELECT b.error FROM bak_20261019_research_parked b WHERE b.id = research_queue.id), recover_count = (SELECT b.recover_count FROM bak_20261019_research_parked b WHERE b.id = research_queue.id), terminal_rearms = (SELECT b.terminal_rearms FROM bak_20261019_research_parked b WHERE b.id = research_queue.id), attempt = (SELECT b.attempt FROM bak_20261019_research_parked b WHERE b.id = research_queue.id), context = (SELECT b.context FROM bak_20261019_research_parked b WHERE b.id = research_queue.id) WHERE status = 'queued' AND instr(error, 'FLOOR-REARM-1') = 1 AND id IN (SELECT id FROM bak_20261019_research_parked); DELETE FROM control_registry WHERE control IN ('research-floor-extend', 'research-revise-shrink-guard', 'research-floor-rearm'); DELETE FROM remediation_contracts WHERE class IN ('fm-research-draft-below-floor', 'fm-research-revise-shrink'); DELETE FROM failure_modes WHERE fm_key IN ('research-draft-below-floor', 'research-revise-shrink'); UPDATE remediation_contracts SET verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = 99913) AS observed', status = 'superseded' WHERE class = 'issue-99913'; decision_log is append-only and keeps its row.
-- spof-review: no new single point of failure. The extension is one more writer call on the complete stage (the stage already calls the same writers);
-- its second paths are the round budget (6) and the stall rule (3), after which verify decides as before, and ops_config research_floor_extend = off.

CREATE TABLE IF NOT EXISTS bak_20261019_research_parked AS
SELECT id, status, stage, error, recover_count, terminal_rearms, attempt, context, claimed_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at
FROM research_queue
WHERE status = 'wontfix' AND stage = 'parked' AND terminal_rearms = 0
  AND substr(error, 1, 16) = 'PARKED-POISON-1:'
  AND (instr(error, 'gate-length') > 0 OR instr(error, 'gate-refcount') > 0 OR instr(error, 'HARD findings unresolved') > 0 OR instr(error, 'no applicable edit') > 0);

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
  ('research-floor-extend', 'qnfo-research-exec stageComplete (COMPLETE-TO-FLOOR-1), routeVerifyToFloor and the floor route in stageRevise; ops_config research_floor_extend', 'gate',
   'a complete paper under the 20,000-char publish floor or under the reference floor reaching review and verify, failing gate-length / gate-refcount and parking', 1, 'keep', 'applied',
   'ops_config research_floor_extend = off restores the old exit (the paper goes to review and verify decides); the extension gives up after 6 rounds or 3 stalled rounds and verify decides as before; the second verify pass stays terminal (verifyPass)',
   NULL, 'cloud_ops_events 2026-10-19: 113 of 255 complete events under 20,000 chars in 24 h, 21 floor/HARD RESEARCH-TERMINAL issues in 24 h, 15 poison-parks in a day; the patch reviser (find/replace) cannot add text', 99913, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('research-revise-shrink-guard', 'qnfo-research-exec stageRevise (REVISE-SHRINK-GUARD-1); ops_config research_revise_shrink_guard', 'guard',
   'a revise patch that takes a paper from at or above the publish floor to below it, cuts more than 20% of it in one pass, or drops its cited references under the reference floor', 1, 'keep', 'applied',
   'a refused answer falls into the existing second-model path with the limit stated; ops_config research_revise_shrink_guard = measure logs the refusal and applies the patch; the 20% bound is above the largest of 60 measured single-patch shrinks (16%)',
   NULL, 'cloud_ops_events revise-patch 2026-10-19: 60 applied patches, out_chars versus the preceding complete chars, shrink 0-16%; a 41k paper was cut to 17k by one patch before the guard', 99913, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('research-floor-rearm', 'qnfo-research-exec floorRearmTick (FLOOR-REARM-1), hourly sweep; bak_20261019_research_parked', 'cap',
   'queueing the rows parked on the floor defects into the code that parked them, or all at once', 0, 'keep', 'applied',
   'ops_config park_rearm = off stops it; 5 rows per run, once each (terminal_rearms 0 -> 1); a missing backup table is a no-op; the Rollback line restores each row from the backup',
   NULL, 'research_queue 2026-10-19: 31 PARKED-POISON-1 rows with gate-length, gate-refcount, HARD findings unresolved or no applicable edit and terminal_rearms = 0', 99913, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('research-draft-below-floor', 'A stage that can only edit is asked to add text, so a draft under the length or reference floor cycles until it parks',
   'a complete draft landed at 14.6k-19.9k chars under the 20,000-char publish floor; verify failed gate-length / gate-refcount and the only tool for it was the find/replace patch reviser, whose strict retry even asked to replace sentences with an empty string',
   'qnfo-research-exec 0.24.0 COMPLETE-TO-FLOOR-1: complete extends a complete paper to 1.2x the floor with grounded sections that cite the uncited bibliography entries; verify and revise route floor-only findings to complete; the rows already parked are returned by FLOOR-REARM-1',
   'fewer than 3 complete events with floor=gave-up in 24 h after the first event of the fixed worker', 'fm-research-draft-below-floor', '2026-10-19', 99913,
   'a writer reply shorter than the floor, or a bibliography with entries the paper does not cite', '113 of 255 complete events in 24 h under 20,000 chars; gate-length / gate-refcount RESEARCH-TERMINAL issues filed every day',
   'research throughput: about 45% of terminal rows lost to the length gates'),
  ('research-revise-shrink', 'A revise patch deletes text to resolve a finding and takes the paper under the floor it must keep',
   'applyRevisePatch accepted any result of at least 10,000 chars while verify requires 20,000, and the strict retry told the model to replace the offending sentence with an empty string; a 41k paper was cut to 17k',
   'qnfo-research-exec 0.24.0 REVISE-SHRINK-GUARD-1: a patch under the floor, over 20% shorter or with fewer cited references than the floor is refused (revise-shrink-refused) and the second model runs with the limit and the allowed removal stated',
   'fewer than 3 revise-noop events naming a refused shrink in 24 h after the first event of the fixed worker', 'fm-research-revise-shrink', '2026-10-19', 99913,
   'a HARD finding whose only fix in the model reply is deleting a long block', 'revise-patch out_chars below the floor after a 41k draft; poison-parks on gate-length after revise',
   'papers in revise: each refused patch is one more model call, bounded by the second-model path and the recover loop');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at) VALUES
  ('fm-research-draft-below-floor', NULL, 'COMPLETE-TO-FLOOR-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''complete'' AND instr(text, '' floor=gave-up'') > 0 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') AND ts > COALESCE((SELECT MIN(ts) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''complete'' AND instr(text, '' floor_rounds='') > 0), ''9999'')) < 3 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now')),
  ('fm-research-revise-shrink', NULL, 'REVISE-SHRINK-GUARD-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''revise-noop'' AND instr(text, ''shrink refused:'') > 0 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') AND ts > COALESCE((SELECT MIN(ts) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''complete'' AND instr(text, '' floor_rounds='') > 0), ''9999'')) < 3 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'));

UPDATE remediation_contracts SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''complete'' AND instr(text, '' floor_rounds='') > 0 AND instr(text, '' complete=true'') > 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) >= 20 AND (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''complete'' AND instr(text, '' floor_rounds='') > 0 AND instr(text, '' floor=gave-up'') > 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) * 20 < (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''complete'' AND instr(text, '' floor_rounds='') > 0 AND instr(text, '' complete=true'') > 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AND (SELECT COUNT(*) FROM agent_issues WHERE title LIKE ''RESEARCH-TERMINAL%'' AND (title LIKE ''%gate-length%'' OR title LIKE ''%gate-refcount%'' OR title LIKE ''%HARD findings unresolved%'') AND created_at > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 86400) * 1000) = 0 THEN ''ok'' ELSE ''defect'' END AS observed'
WHERE class = 'issue-99913';

UPDATE remediation_contracts SET status = 'active', last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-99913' AND status = 'superseded';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766', 'a paper under the publish floor is extended by a writer, not edited by a find/replace reviser, and a revise patch must not take a paper under the floor it was above',
 'RESEARCH-FLOOR-1: qnfo-research-exec 0.24.0 REVISE-SHRINK-GUARD-1, COMPLETE-TO-FLOOR-1 and FLOOR-REARM-1; migrations/2026-10-19-research-rearm-after-repair.sql freezes the 31 parked candidates, adds the controls, the failure modes with fm-<key> detectors and a closing probe for issue 99913',
 'cloud_ops_events 2026-10-19: 113 of 255 complete events under 20,000 chars in 24 h, 21 floor/HARD RESEARCH-TERMINAL issues in 24 h, 15 poison-parks in a day; 60 applied revise patches shrank a paper by at most 16%; the auditors and verifiers upheld the diagnosis',
 'applied through the canonical path on merge; the re-arm runs in the deployed worker', 'research_queue rows in complete, revise and verify; model calls on the complete stage (about one writer call per short paper, 6 at most); the 31 parked rows return one at a time',
 'revert qnfo-research-exec; ops_config research_floor_extend = off, research_revise_shrink_guard = measure, park_rearm = off; the migration rollback line restores the re-armed rows from bak_20261019_research_parked',
 'the complete stage writes the missing length and citations; the fleet re-arms papers its own earlier code parked',
 'complete events with floor=gave-up under 5% of 20 or more in 24 h and no gate-length / gate-refcount RESEARCH-TERMINAL issue in 24 h', 'none',
 'real stageComplete, stageVerify, stageRevise, floorRearmTick and the migration against in-memory mocks and node:sqlite (complete-to-floor.test.mjs, revise-shrink-guard.test.mjs)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'RESEARCH-FLOOR-1:') = 1);
