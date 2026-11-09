-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status='open', close_channel=NULL WHERE id IN (1002662,1002653,1002651,1002650); DELETE FROM agent_issues WHERE title LIKE 'DOC-ITEMS-REMAINDER-2:%';
-- spof-review: no new cron, trigger, binding, host or credential; UPDATEs of existing rows plus two new issues.
-- CAUSE-MAPPED: no metric is registered here.
-- DOC-ITEMS-SWEEP-3 (2026-11-09, pillar autonomy). Read live 2026-11-09: qnfo-lifecycle /status returns 200 {"status":"ok","projects":24} (1002653 I-02 gone);
-- 1000035 is the open doer of 1002662; 1002650 was disposed in doc-items-drain-2 but its GitHub mirror 9638 stayed open. Two items with real code surface get issues below.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'DOC-ITEMS-REMAINDER-2: kg_curate has no Paper-node vs D1 papers drift check (KG 1,226 Paper nodes vs 616 papers, 2026-07-20)',
'Pillar research. From DOC-ITEMS 1002653 (I-01). Add a phase to scripts/kg_curate.mjs that counts Paper nodes against papers rows and reports paper_count_drift in /kg/health, with a test in scripts/kg_curate.test.mjs.
code-task: repo=qnfo-workers path=scripts/kg_curate.mjs
code-anchor: export async function ensureSchema(
code-probe: {"paths": ["scripts/kg_curate.mjs"], "contains": "paper_count_drift"}',
'doc-gate','code-change','low','open', CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'DOC-ITEMS-REMAINDER-2: kg_curate%' AND status='open');
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'DOC-ITEMS-REMAINDER-2: no check that WBS RES numbers in branch and commit labels match the registry (RES.030 vs RES.031 drift)',
'Pillar research. From DOC-ITEMS 1002651 (O1, item 3). Add res_number_drift to the fleet-control portfolio sync: list program_registry RES codes used by two projects or by a repo label that disagrees with the registry, and name the next free RES number.
code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js
code-anchor: async function portfolioSync(env, force) {
code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "res_number_drift"}',
'doc-gate','code-change','low','open', CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'DOC-ITEMS-REMAINDER-2: no check that WBS%' AND status='open');
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'doc-items-sweep-2026-11-09c', 'triaged', 'session:doc-items-sweep', datetime('now'),
  CASE a.id
    WHEN 1002662 THEN 'DOC-ITEMS-SWEEP-3: each listed item is owned: 1000035 (open, code-task doer), 100613 and 100622-100626 (closed except 100625, own doer), 589 parked rows are policy; no item lacks a doer.'
    WHEN 1002653 THEN 'DOC-ITEMS-SWEEP-3: B1-B5 are skill-file guidance outside this repository; I-02 read live 2026-11-09: GET qnfo-lifecycle /status = 200 ok, 24 projects; I-01 filed as DOC-ITEMS-REMAINDER-2 (kg_curate paper_count_drift) with a code-probe.'
    WHEN 1002651 THEN 'DOC-ITEMS-SWEEP-3: O1 and item 3 filed as DOC-ITEMS-REMAINDER-2 (res_number_drift, code-probe); N4 is a DeepChat client check with no repository surface.'
    ELSE 'DOC-ITEMS-SWEEP-3: disposed in doc-items-drain-2 (session-local notes, owners named); GitHub mirror reconciled.'
  END
FROM agent_issues a WHERE a.id IN (1002662,1002653,1002651,1002650) AND a.status='open'
ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence;
UPDATE agent_issues SET status='closed', close_channel='session:doc-items-sweep', updated_at=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE id IN (1002662,1002653,1002651,1002650) AND status='open';
