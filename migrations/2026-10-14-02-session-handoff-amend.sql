-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-companion-edit-drops-analysis-line', 'fm-companion-century-ordinal-flagged'); DELETE FROM failure_modes WHERE fm_key IN ('companion-edit-drops-analysis-line', 'companion-century-ordinal-flagged'); INSERT OR REPLACE INTO session_records SELECT * FROM bak_20261014_session_records_01kdd
-- COMPANION-REFRAME-REMARK-1 (2026-10-14, pillar personal; agent_issues 2222). personal-companion 1.23.4 (same pull request) fixes two defects the
-- 00:00 UTC run exposed; their failure modes get code-read detectors, and the session handoff written by 2026-10-14-01 is amended to say the first
-- lever it named is shipped.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-edit-drops-analysis-line', 'the reframe editor dropped the analysis line, so three of four edits were refused and the drafts were judged without them',
  'the editor returns the whole draft and omits the invisible line; reframePiece refused any edit whose line state differed from the draft',
  'REFRAME-REMARK-1 (personal-companion 1.23.4): a dropped line is placed again by the auto-mark rule; the edit is refused only when no paragraph holds the rails',
  'personal-companion/worker.js on main places a dropped analysis line again', 'fm-companion-edit-drops-analysis-line', '2026-10-14', 2222,
  'a reframe edit of a marked draft', 'companion_runs 5806, 5811, 5816: reframe kept the draft: edit dropped the analysis line', 'every companion piece the critic rejects'),
 ('companion-century-ordinal-flagged', 'a century ordinal ("early-21st-century") was flagged as a figure not in the source',
  'the figure check read the digits of an ordinal as a number',
  'CENTURY-ORDINAL-1 (personal-companion 1.23.4): a one- or two-digit ordinal followed by "century" is no figure; a plain number is still checked',
  'personal-companion/worker.js on main skips century ordinals in the figure check', 'fm-companion-century-ordinal-flagged', '2026-10-14', 2222,
  'a companion draft that names a century', 'companion_runs 5821: grounding: figure not in the source: 21', 'every companion piece on a historical subject');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-companion-edit-drops-analysis-line', NULL, 'REFRAME-REMARK-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "note = \", analysis line placed again\";"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-century-ordinal-flagged', NULL, 'CENTURY-ORDINAL-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "CENTURY-ORDINAL-1 (1.23.4"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
UPDATE session_records SET
  handoff_notes = replace(handoff_notes, 'Next levers, in order: re-insert a dropped analysis line at its paragraph instead of refusing the edit; when',
    'The rest of that run (5808-5824) failed: three of four edits were refused for a dropped analysis line and one draft for "21" read from "21st-century"; personal-companion 1.23.4 (REFRAME-REMARK-1, CENTURY-ORDINAL-1, merged with this closeout) places a dropped line again and reads century ordinals as words. Next lever: when'),
  total_tasks = 54, completed_tasks = 49
WHERE session_id = 'session_01Kddqwk5gQT5qSSHVKjT2EA-20261013' AND instr(handoff_notes, 'Next levers, in order:') > 0;
