-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status='open', close_channel=NULL WHERE id IN (1002688,1002687,1002650,1002649,1002639,1002638,1002636,1002635,1002634,1002633,1002632,1002631,1002620,1002619,1002618,1002617,1002616,1002614,1002613,1002611,1002602,1002601,1002600,1002597,1002595,1002594,1002544,1002543,1002593,1002615,1002612); UPDATE roadmap_implementation SET status='open', verified_at=NULL WHERE id IN (5263,4130);
-- spof-review: no new cron, trigger, binding, host or credential; UPDATEs of existing rows plus one new issue.
-- CAUSE-MAPPED: no metric is registered here.
-- DOC-ITEMS-SWEEP-2 (2026-11-09, charter pillar autonomy). Read against live D1 on 2026-11-09: every issue id the DOC-ITEMS extractions name is closed/resolved/wontfix
--  (925,926,957,1040,1049,1068,1073,1077,1079,1080,1081,1083,1084,1085,1086,1090,1092,1154,1616,1619,1620,1662,1663,1681-1684,100419,100454,100459,100613,100622-100624,100626,
--  1000007,1000018,1000029,1000034,1000036,1000038,1000043) except 1000035 (open, doer of 1002662) and 100625 (open, own doer). The other items are session-local run notes,
--  failure-mode self-critiques of a historical audit, or science follow-ups with no repository surface. Left open: 1002662 (1000035), 1002651 and 1002621 (UIA WBS number
--  unverified), 1002653 (KG desync and lifecycle /status unverified), 1002671 (owner credentials), 1002685 (file recoverability). 1002615 and 1002612 name real code
--  (stamp-block escalation in scripts/remediation_consumer.py, not on main) and are superseded by the consolidated issue inserted below.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'DOC-ITEMS-REMAINDER-1: remediation_consumer has no stamp-block escalation (attempts+1 >= max_attempts never reaches escalated); consume_code/consume_d1 return no verdict next_status',
'Pillar autonomy. Consolidates DOC-ITEMS 1002615 (2026-10-25 close-loop-autonomy-closeout) and 1002612 (v2). Evidence read 2026-11-09: grep escalat scripts/remediation_consumer.py matches only the escalate_to column lists (lines 96, 701); no branch sets status escalated.
Fix: at the stamp, when attempts + 1 >= max_attempts and status is active or holding, set status escalated and write escalate_to; make consume_code and consume_d1 return a verdict-derived next_status; exempt standing-detector classes (335 contracts) from bulk escalation by class filter. Add a test next to remediation_consumer_stamp_test.py.
code-task: repo=qnfo-workers path=scripts/remediation_consumer.py
code-anchor: max_attempts, escalate_to, expected_cadence_h, module, budget_ms,
code-probe: {"paths": ["scripts/remediation_consumer.py"], "contains": "escalated"}',
'doc-gate','code-change','medium','open', CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'DOC-ITEMS-REMAINDER-1:%' AND status='open');
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'doc-items-sweep-2026-11-09b', 'triaged', 'session:doc-items-sweep', datetime('now'),
  CASE
    WHEN a.id IN (1002615,1002612) THEN 'DOC-ITEMS-SWEEP-2: superseded by the DOC-ITEMS-REMAINDER-1 issue (stamp-block escalation in scripts/remediation_consumer.py, code-task and probe on that issue); read 2026-11-09 no escalated branch on main.'
    WHEN a.id = 1002593 THEN 'DOC-ITEMS-SWEEP-2: the 15 AUDIT documents are retired by key in docs/retired-r2-documents.txt (reason recorded); their open items are traced by DOC-ITEMS issues closed or kept per row in this sweep.'
    ELSE 'DOC-ITEMS-SWEEP-2: issue ids named by the extraction read in qnfo-audit.agent_issues on 2026-11-09 (all closed/resolved/wontfix except 1000035 and 100625, which have their own doers); remaining items are session-local run notes or failure-mode self-critique with no repository surface.'
  END
FROM agent_issues a WHERE a.id IN (1002688,1002687,1002650,1002649,1002639,1002638,1002636,1002635,1002634,1002633,1002632,1002631,1002620,1002619,1002618,1002617,1002616,1002614,1002613,1002611,1002602,1002601,1002600,1002597,1002595,1002594,1002544,1002543,1002593,1002615,1002612) AND a.status='open'
ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence;
UPDATE agent_issues SET status='closed', close_channel='session:doc-items-sweep', updated_at=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE id IN (1002688,1002687,1002650,1002649,1002639,1002638,1002636,1002635,1002634,1002633,1002632,1002631,1002620,1002619,1002618,1002617,1002616,1002614,1002613,1002611,1002602,1002601,1002600,1002597,1002595,1002594,1002544,1002543,1002593,1002615,1002612) AND status='open';
UPDATE roadmap_implementation SET status='verified', verified_at=datetime('now') WHERE id IN (5263,4130) AND status<>'verified';
