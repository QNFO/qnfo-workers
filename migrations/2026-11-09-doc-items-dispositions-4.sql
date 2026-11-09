-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status='open', close_channel=NULL WHERE id IN (1002621,1002638,1002639,1002649);
-- spof-review: no new cron, trigger, binding, host or credential; UPDATEs of existing rows only.
-- CAUSE-MAPPED: no metric is registered here.
-- DOC-ITEMS-SWEEP-4 (2026-11-09, pillar autonomy). Dispositions read from the repository on 2026-11-09.
-- 1002636 (audit-closeout-2026-07-29) stays open: its Turnstile key-scope item is IDENTITY-BOUND (dashboard keys and token scope).
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'doc-items-sweep-2026-11-09d', 'triaged', 'session:doc-items-sweep', datetime('now'),
  CASE a.id
    WHEN 1002621 THEN 'DOC-ITEMS-SWEEP-4: O1 (WBS registry check-then-insert) is covered by DOC-ITEMS-REMAINDER-2 res_number_drift (filed in 2026-11-09-doc-items-dispositions-3.sql, code-probe on qnfo-fleet-control/worker.js); item 2 v0.4.1-vs-v0.5 decision is superseded by the shipped v0.4.1 closeout (uia-v041-closeout-2026-08-29.md); item 3 is a DeepChat client restart check with no repository surface.'
    WHEN 1002638 THEN 'DOC-ITEMS-SWEEP-4: (1) deploy-gate suite attribution is now strict-vs-base through scripts/regression_gate.py and pr_fast_guards (PR-FAST-GUARDS-1); (2) backlog drain is owned by ISSUE-THROUGHPUT-1 (v_issue_family_throughput); (3) ops_research_kick exists in qnfo-ops (OPS-RESEARCH-KICK-1, 2.51.0, sync and deferred modes); (4) probation metrics are NULL-by-design below 10 ratings, owner metric author; (5) scripts/model-floor-guard.mjs skips RETIRED directories by design (FOLDED-AND-RETIRED-MODEL-COVERAGE-1). Failure-mode bullets are audit-session lessons, already corrected in-thread, no code surface.'
    WHEN 1002639 THEN 'DOC-ITEMS-SWEEP-4: failures and fixes were corrected in-session; open items cite 2026-10 issue ids (100281.. 100398, 99920/99921) now owned by the remediation-contract loop and issue-age ladder (ISSUE-THROUGHPUT-1); the 345-issue backlog they depend on has since drained under v_issue_age_ladder; no item lacks a doer.'
    WHEN 1002649 THEN 'DOC-ITEMS-SWEEP-4: the five bullets are failure-mode observations of a 2026-09-30 sweep (rows-absence is not death, snapshot not stream, undeclared staleness thresholds, healthy dashboard, no producer source read); declared cadences are carried by metric_registry and LOOP-WATCH-1; no repository change applies.'
  END
FROM agent_issues a WHERE a.id IN (1002621,1002638,1002639,1002649) AND a.status='open'
ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence;
UPDATE agent_issues SET status='closed', close_channel='session:doc-items-sweep', updated_at=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE id IN (1002621,1002638,1002639,1002649) AND status='open';
