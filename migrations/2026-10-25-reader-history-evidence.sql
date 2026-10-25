-- READER-HISTORY-1, charter pillars research/core, US-10 / RM-VISION-LIVING-PAPER-1.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status='superseded' WHERE class='fm-reader-history-navigation';

INSERT OR IGNORE INTO failure_modes
  (fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,issue_id,trigger_condition,symptom,blast_radius)
VALUES ('reader-history-navigation','Reader Versions omits stored same-slug snapshots',
  'The public reader enumerated current papers by normalized title rather than retained paper_version_history snapshots',
  'Read archived metadata only after current-paper public eligibility; retain snapshot identifiers and distinguish capture dates from revision dates',
  'Actual-handler SQLite regression and public reader-context runner probe',
  'fm-reader-history-navigation',datetime('now'),100575,
  'Stored historical revisions exist but the public reader context has no archived entry',
  'Current 1.1.1 listed alone despite stored 1.1.0 and 1.0.0 snapshots',
  'Public reader version navigation; no paper content or scientific assertion changes');

INSERT OR IGNORE INTO remediation_contracts
  (class,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,module)
VALUES ('fm-reader-history-navigation',
  'The sample published paper retains earlier snapshots in living-paper',
  'Inspect current-public eligibility and archived version metadata in the existing gateway; preserve snapshot text and capture-date semantics',
  '{"url":"https://papers.qnfo.org/api/paper-context/direction-of-epistemic-risk-as-a-criterion-distinguishing-science-from-numerolog","status":200,"contains":"\"archived\":true"}',
  'runner-https',3,'qnfo-gateway',1,'active','reader-history-v1');

INSERT INTO decision_log
  (actor,assumption,action,evidence,outcome,blast_radius,rollback_path,capability_gain,predicted_outcome,reach_gain,surfaces_tested)
VALUES ('copilot-af0ed947-us10',
  'Stored snapshot capture time is not historical publication time; public current-paper eligibility must precede historical metadata reads',
  'Repair the existing reader version-list integration without rewriting paper content or resurrecting retired Workers',
  'Read-only 2026-10-25 19:14Z:160 snapshots across88slugs; public context current-only while research version listing exposes two retained predecessors; actual-handler SQLite regression reproduces omission',
  'Canonical change requires live archived-navigation readback; this record is not whole-story acceptance',
  'One gateway reader-context and version-navigation surface; archive data remains unchanged',
  'Revert the version-navigation code through the canonical deploy workflow and supersede fm-reader-history-navigation',
  'Public readers can discover retained snapshots and distinguish capture dates from current revision dates',
  'The representative public context includes archived predecessors and unpublished-paper fixtures remain inaccessible',
  'Existing research history becomes discoverable without paid generation',
  'Research D1 aggregate, research version metadata endpoint, public reader-context endpoint, actual-handler SQLite fixture');
