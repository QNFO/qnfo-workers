-- STALE-PR-CONFLICT-REPAIR-1 (2026-10-11, pillar autonomy). PR 870 (qnfo-ai ACCURACY-GROUND-1) had every check green and sat 26h
-- because main moved under it (mergeable_state dirty); no lane merges or repairs a conflicting PR, so CYCLE-TIME-1 closed it
-- unmerged and nobody was told. qnfo-fleet-control 0.14.0 files one repair issue per such PR. This entry registers the failure
-- mode and a detector that reads the closer's own log: a PR closed with "mergeable_state dirty" in its reason and no
-- conflict-repair-issue row for the same PR. Closures before 2026-10-11T10:00Z are excluded (PR 870 was re-applied as PR 905).
-- Not registered on purpose: workflow (.github/) PRs are never auto-merged by design (security precedence, CLAUDE.md); that is a
-- limit, not a failure, and D1 cannot see an open PR, so a detector for it would pass while the wait happens.
-- Idempotent (INSERT OR IGNORE).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-pr-conflict-silent-close'; DELETE FROM failure_modes WHERE fm_key = 'pr-conflict-silent-close';
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('pr-conflict-silent-close', 'a green session pull request that conflicts with main is closed unmerged with no repair issue', 'STALE-PR-MERGE-FIRST-1 merges only mergeable_state clean and STALE-PR-CHECK-REPAIR-1 repairs only a failing non-required check, so a dirty PR matched no lane and CYCLE-TIME-1 closed it at 24h', 'qnfo-fleet-control 0.14.0 STALE-PR-CONFLICT-REPAIR-1 files a deduped high-priority issue with the re-apply procedure when a quiet PR is dirty', 'no close-stale-pr row with mergeable_state dirty lacks a conflict-repair-issue row for the same PR', 'fm-pr-conflict-silent-close', '2026-10-10', NULL, 'main changes a file a quiet session PR also changes', 'a branch_hygiene_log close-stale-pr row whose reason says mergeable_state dirty', 'every session PR that is open when main moves under it; its work leaves the merge queue');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-pr-conflict-silent-close', NULL, 'STALE-PR-CONFLICT-REPAIR-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM branch_hygiene_log c WHERE c.action = ''close-stale-pr'' AND c.dry = 0 AND c.ok = 1 AND c.why LIKE ''%mergeable_state dirty%'' AND c.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-48 hours'') AND c.ts > ''2026-10-11T10:00:00Z'' AND NOT EXISTS (SELECT 1 FROM branch_hygiene_log r WHERE r.action = ''conflict-repair-issue'' AND r.pr = c.pr)) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'holding', 'failure-mode', 45000, 5, 0);
