-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261020_cluster_b_contracts b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261020_cluster_b_contracts b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261020_cluster_b_contracts b WHERE b.class = remediation_contracts.class), last_verdict = NULL WHERE class IN (SELECT class FROM bak_20261020_cluster_b_contracts); DELETE FROM internal_errata WHERE id IN ('render-automorphisms-and-scaling-1', 'render-wheeler-dewitt-zero-mode-1'); UPDATE internal_errata SET status = 'closed' WHERE id = 'render-scale-invariant-physics-math-1'; DELETE FROM goals WHERE goal_key = 'OWNER-PAPERS-THIN-GATE-1'; DELETE FROM capability_ledger WHERE provenance LIKE 'migrations/2026-10-20-research-cluster-b.sql%'; DELETE FROM blocker_redteam WHERE target = 'issue:100274' AND actor = 'session_01MQYeWxrMd4mVYPCphyaYes'
-- BACKUP: bak_20261020_cluster_b_contracts
-- RESEARCH CLUSTER B (2026-10-20, charter pillar: research and autonomy; owner directive 2026-10-20 "The system shall always clear all open issues server-side automatically within 24 hours";
-- agent_issues 99913, 2792, 2158, 100274). Companion to qnfo-research-exec 0.29.0. Read-only measurements taken 2026-10-20 06:xxZ on qnfo-audit and living-paper.
--
-- 99913 RESEARCH-REVISE-LOOP-1. Its definition of done is that revise and verify exit instead of looping (a row reaches published or a named terminal park without 5 or more recoveries), that
--   research_parallel widens in-flight concurrency, and that the publication ETA falls under 100 h. Measured: v_backlog_burndown publication rate 4.58/h against 2.65/h required, ETA 57.8 h
--   (verdict ON-TRACK; on 10-18 it read 0.5/h, ETA 1130 h); 71 papers published on 10-19 and 39 so far on 10-20; 23 rows in flight; the highest recover_count of a live row is 3; 201 complete
--   events with complete=true in 24 h and none that gave up. The contract still failed because its last clause counts every RESEARCH-TERMINAL issue titled HARD findings unresolved as a defect,
--   which is the integrity gate withholding a paper (a named terminal park, accepted by the definition of done and self-closing since qnfo-research-exec 0.28.7). The probe now measures the
--   definition of done: ETA under 100 h, no live row at 5 or more recoveries, concurrency above the old constant of 12 whenever work waits, the floor holding, and no new gate-length or
--   gate-refcount terminal issue in 24 h (the length floor is the defect 0.24.0 fixed; the two issues of 10-19 age out of the window by 13:15Z).
-- 2792 release_gate_pass = 0. The thin cohort is 131 published papers (quality:thin, no reference list, no prior-work section, no table or code); 0 of them is a pipeline paper (identifier qnf-):
--   62 are owner imports (qnfo-2025-*), 48 owner papers (qnfo-2026-*), 21 other hand-written papers. The gate is advisory by design; the repair sweep (THIN-PRIOR-WORK-1, REVISION-LOOP-1) acts
--   on pipeline papers by policy (REVISION-ELIGIBLE-2, PROPORTIONATE-NOTICE-1: owner writing is not rewritten by a loop) and THIN-PRIOR-WORK-1 yields 6 queued of 37 attempts in 4 days, so the
--   cohort cannot drain by a rule and should not be rewritten against the owner directive of 2026-10-19. The decision is recorded (keep advisory plus repair sweep for pipeline papers); the probe
--   measures the part the fleet owns (pipeline papers failing the gate: 0 now); the owner papers become the goal OWNER-PAPERS-THIN-GATE-1 (owner decision, never a loop rewrite).
-- 2158 METRIC-FIX-RELAPSED-1 paper_render_defect_pages. GET papers.qnfo.org/api/render-health on 2026-10-20 lists three pages: automorphisms-and-scaling-transformations... (3, pipeline paper qnf-6bc7...),
--   wheeler-dewitt-zero-mode... (1, pipeline paper qnf-0321...) and scale-invariant-physics (1, owner import, 747 KB). The first two get an internal_errata row each (owner qnfo-research-exec, read by the
--   revision loop through REVISION-ERRATA-1, which also wraps formulas deterministically: MATH-LATEX-AUTOFIX-1); the erratum for scale-invariant-physics was closed implemented on 10-18 while the
--   paper still reads updated_at 10-12 with the defect, so it is reopened for its owner (errata-hub). The existing contract (the improvement loop no longer finds the metric breach) stays.
-- 100274 NOTICE-REPAIR-DRAIN-1. Banners on published papers read 0. 20 owner papers were still retracted: 7 of them restore (backup text of 21k to 37k chars) once qnfo-research-exec 0.29.0 makes the
--   repair count repairs rather than attempts (eight papers the living-paper publish floor refuses held the batch of 8 for ever); the other 13 are refused by trg_papers_pub_floor_upd3 (retracted ->
--   published needs 20,000 chars; their backups are 8.3k to 19k): see the blocker_redteam row below. The contract is left as it is: it reads the truth.
CREATE TABLE IF NOT EXISTS bak_20261020_cluster_b_contracts AS SELECT * FROM remediation_contracts WHERE class IN ('issue-99913', 'issue-2792');

UPDATE remediation_contracts SET status = 'active', last_verdict = NULL, next_due_at = datetime('now'), verify_transport = 'd1-query',
  action = 'RESEARCH-REVISE-LOOP-1 definition of done: publication ETA under 100 h, no live row at 5 or more recoveries, concurrency above 12 while work waits, the length floor holding, no new gate-length or gate-refcount terminal issue in 24 h. A HARD-review terminal issue is a named park and does not count.',
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''complete'' AND instr(text, '' floor_rounds='') > 0 AND instr(text, '' complete=true'') > 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) >= 20 AND (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''complete'' AND instr(text, '' floor_rounds='') > 0 AND instr(text, '' floor=gave-up'') > 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) * 20 < (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''complete'' AND instr(text, '' floor_rounds='') > 0 AND instr(text, '' complete=true'') > 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AND COALESCE((SELECT CASE WHEN eta_h < 100 THEN 1 ELSE 0 END FROM v_backlog_burndown WHERE stream = ''publication''), 0) = 1 AND (SELECT COUNT(*) FROM research_queue WHERE recover_count >= 5 AND status IN (''researching'', ''queued'', ''deferred'')) = 0 AND ((SELECT COUNT(*) FROM research_queue WHERE status = ''researching'') >= 13 OR (SELECT COUNT(*) FROM research_queue WHERE status IN (''queued'', ''deferred'')) = 0) AND (SELECT COUNT(*) FROM agent_issues WHERE title LIKE ''RESEARCH-TERMINAL%'' AND (title LIKE ''%gate-length%'' OR title LIKE ''%gate-refcount%'') AND created_at > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 86400) * 1000) = 0 THEN ''ok'' ELSE ''defect'' END AS observed'
WHERE class = 'issue-99913';

UPDATE remediation_contracts SET status = 'active', last_verdict = NULL, next_due_at = datetime('now'), verify_transport = 'd1-query@living-paper',
  action = 'RELEASE-GATE-DECISION-1: the gate stays advisory; the repair sweep (THIN-PRIOR-WORK-1, REVISION-LOOP-1) acts on pipeline papers (identifier qnf-). Observed = pipeline papers failing the release gate. The owner-authored thin cohort is the goal OWNER-PAPERS-THIN-GATE-1, never a loop rewrite.',
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM papers WHERE status = ''published'' AND COALESCE(release_gate_pass, 0) = 0 AND identifier LIKE ''qnf-%'') AS TEXT) AS observed'
WHERE class = 'issue-2792';

INSERT OR IGNORE INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, priority, status, dod, owner, program_code)
VALUES ('OWNER-PAPERS-THIN-GATE-1',
  'The 131 published owner-authored papers that score quality:thin on the advisory release gate (no reference list, no prior-work section, no table or code; 62 qnfo-2025 imports, 48 qnfo-2026 papers, 21 other hand-written ones, none a pipeline paper) are the owner''s text: no loop rewrites them. Each is repaired by the owner''s own edit (add references and a prior-work section) or stays flagged as advisory.',
  'instrumental', NULL, 'owner directive 2026-10-19 PROPORTIONATE-NOTICE-1 (loops do not rewrite owner papers); moved from agent_issues 2792', 'RESEARCH-CLUSTER-B-1', 2, 'proposed',
  'Done when owner-authored thin papers are zero or each is marked as an accepted advisory: SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM papers WHERE status = ''published'' AND COALESCE(release_gate_pass, 0) = 0 AND release_gate_reason LIKE ''quality:thin%'' AND identifier NOT LIKE ''qnf-%'') AS TEXT) AS observed (query living-paper)',
  'qnfo-research-exec', 'QNFO.RSCH');

-- 2158: errata for the two pipeline pages (the revision loop reads open errata first) and the reopened erratum of the owner import.
INSERT OR IGNORE INTO internal_errata (id, target_kind, target_ref, detected_at, detected_by, severity, claim_text, falsification, evidence, remediation, status, owner)
VALUES
  ('render-automorphisms-and-scaling-1', 'paper', 'automorphisms-and-scaling-transformations-a-re-entry-analysis-across-algebraic-g', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'RENDER-HEALTH-1 render sweep (session triage 2026-10-20)', 'medium',
   'The published text writes mathematical expressions as plain text outside $...$ delimiters, so the page renders raw symbols (render-health reports 3 defects for this page since 2026-10-14).',
   'GET https://papers.qnfo.org/api/render-health lists this slug with 0 defects after a corrected version is published.',
   '{"source":"GET https://papers.qnfo.org/api/render-health 2026-10-20","defects":3,"paper":"qnf-6bc7e138b80b1f7b524c00bf937e8ade 2.0.0","metric":"paper_render_defect_pages"}',
   'Publish a corrected version in which every formula is wrapped in $...$ (inline) or $$...$$ (display); do not change any claim, number or reference.', 'open', 'qnfo-research-exec'),
  ('render-wheeler-dewitt-zero-mode-1', 'paper', 'wheeler-dewitt-zero-mode-a-structural-test-of-the-majorana-analogy-in-minisupers', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'RENDER-HEALTH-1 render sweep (session triage 2026-10-20)', 'medium',
   'The published text writes a mathematical expression as plain text outside $...$ delimiters, so the page renders raw symbols (render-health reports 1 defect for this page on 2026-10-20).',
   'GET https://papers.qnfo.org/api/render-health lists this slug with 0 defects after a corrected version is published.',
   '{"source":"GET https://papers.qnfo.org/api/render-health 2026-10-20","defects":1,"paper":"qnf-0321b8bf-3e73-4edc-8590-84e0c4b21934 1.0.0","metric":"paper_render_defect_pages"}',
   'Publish a corrected version in which every formula is wrapped in $...$ (inline) or $$...$$ (display); do not change any claim, number or reference.', 'open', 'qnfo-research-exec');

UPDATE internal_errata SET status = 'open', updated_at = datetime('now'),
  evidence = COALESCE(evidence, '') || ' | REOPENED 2026-10-20 (session triage): closed implemented on 2026-10-18 but papers.updated_at is still 2026-10-12 and render-health lists the slug with 1 defect on 2026-10-20'
WHERE id = 'render-scale-invariant-physics-math-1' AND status = 'closed';

-- 100274: the red team of the blocker (BLOCKER-REDTEAM-1: every surface, recorded; one row for the part that was a workaround, one for the part that is confirmed).
INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor)
SELECT 'issue:100274', 'NOTICE-REPAIR-DRAIN-1: 20 owner papers still retracted although every one has a paper_integrity_backups row',
  'read the 10-minute notice-repair events of 2026-10-19 18:00Z to 2026-10-20 05:40Z (candidates 20, restored none, one refused paper named per tick) and replayed the batch in the repository suite',
  'workaround-built',
  'the batch counted attempts: the first 8 candidates were refused on every tick, so the other 12 were never tried. qnfo-research-exec 0.29.0 counts repairs and goes on to the next candidate; the 7 papers whose backup text is 21k-37k chars restore. | surfaces: notice-repair cloud_ops_events, paper_integrity_backups, living-paper papers, the qnfo-research-exec worker code, the repository suite terminal-rearmed.test.mjs',
  'session_01MQYeWxrMd4mVYPCphyaYes'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:100274' AND actor = 'session_01MQYeWxrMd4mVYPCphyaYes' AND verdict = 'workaround-built');
INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor)
SELECT 'issue:100274', 'NOTICE-REPAIR-DRAIN-1: 13 owner papers whose backup text is under 20,000 chars cannot go back to published',
  'replayed the restore of the paper against living-paper through the worker binding (UPDATE papers SET title, abstract, body_md, version, status from the backup)',
  'confirmed-with-evidence',
  'refused by trg_papers_pub_floor_upd3 (retracted -> published needs 20,000 chars; backups are 8.3k-19k): PUBLISH-FLOOR-BLOCKED MIN-PAPER-LENGTH-3 (update): cannot publish below 20000 chars or as a non-paper artifact type. A registered fleet guard, not an owner secret; it is not bypassed (no other status is substituted, no trigger is dropped) and stays for a recorded guard decision. | surfaces: living-paper D1 UPDATE through the worker binding (refused by the trigger), the CI migration path (apply_migrations.py takes DB qnfo-audit only, so no living-paper DDL), the cf-ops-actions allowlist (no living-paper SQL action), guard_registry and scripts/guard-registry-ddl-2026-10-05.json (the trigger is a registered guard with a checksum), a worker-side DROP or CREATE TRIGGER (the worker lifting its own guard)',
  'session_01MQYeWxrMd4mVYPCphyaYes'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:100274' AND actor = 'session_01MQYeWxrMd4mVYPCphyaYes' AND verdict = 'confirmed-with-evidence');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence) VALUES
  ('terminal-issue-self-resolution', 'migrations/2026-10-20-research-cluster-b.sql (RESEARCH-TERMINAL-REARMED-1, qnfo-research-exec 0.29.0; backfill in migrations/2026-10-20-research-terminal-rearmed.sql)',
   'qnfo-research-exec 0.29.0 deployed; the remediation tick reading remediation_contracts research-terminal-<prefix>; ops_config park_rearm not off',
   'every RESEARCH-TERMINAL issue carries a probe that measures the row (back in the pipeline, published, or both recoveries spent), the row and its events stay as the signal, a row that goes terminal again files or reopens its issue; PARKED-REGROUND-1 returns two parked content failures an hour to ground',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'migrations/research-terminal-rearmed.test.mjs, qnfo-research-exec/terminal-rearmed.test.mjs; 6 open notices read on 2026-10-20: 4 rows already re-armed, 2 parked after one re-arm'),
  ('paper-learning-triage', 'migrations/2026-10-20-research-cluster-b.sql (PAPER-LEARN-TRIAGE-1, qnfo-lifecycle 1.14.0; catalogue in migrations/2026-10-20-paper-learn-triage.sql)',
   'qnfo-lifecycle 1.14.0 deployed, paper_learning_mechanisms seeded, Workers AI binding for the two-family reject; ops_config paper_learn_triage not off',
   'a learning is settled in place only against a mechanism whose evidence probe reads ok at that moment, rejected only when two model families agree, an apply stays proposed with its proposal; the reader strips the fleet''s own notices',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'qnfo-lifecycle/paper-learn-triage.test.mjs, migrations/paper-learn-triage.test.mjs; 18 proposed direct learnings on five issues at the PL_ISSUE_OPEN_MAX cap'),
  ('notice-repair-skips-refused', 'migrations/2026-10-20-research-cluster-b.sql (NOTICE-REPAIR-SKIP-BLOCKED-1, qnfo-research-exec 0.29.0)',
   'qnfo-research-exec 0.29.0 deployed; paper_integrity_backups rows', 'the owner-paper restore counts repairs, reports papers the living-paper publish floor refuses as blocked, and goes on to the next candidate',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'qnfo-research-exec/terminal-rearmed.test.mjs (10 refused papers ahead of 3 restorable ones); 20 retracted owner papers, 8 refused every tick since 2026-10-19 18:00Z');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'a closing probe measures the defect of the definition of done, not a count that includes the integrity gate working; the release gate stays advisory because 131 of 131 thin papers are owner-authored and no loop rewrites owner text',
  'RESEARCH-CLUSTER-B-1: issue-99913 probe replaced by the definition of done (ETA, recoveries, concurrency, floor); issue-2792 decision recorded (keep advisory, repair sweep for pipeline papers) and probe scoped to pipeline papers with the owner cohort as goal OWNER-PAPERS-THIN-GATE-1; errata filed for the two pipeline render defects and the owner-import erratum reopened; blocker red team for 100274 recorded',
  'qnfo-audit and living-paper 2026-10-20 read-only: publication 4.58/h against 2.65/h required (ETA 57.8 h); thin cohort 131 all owner-authored; THIN-PRIOR-WORK-1 6 queued of 37 in 4 days; render-health 3 pages; 20 retracted owner papers of which 13 are refused by the publish-floor trigger',
  'migration merged',
  'two remediation_contracts rows (copied to bak_20261020_cluster_b_contracts), one goal, three internal_errata rows, one blocker_redteam row, three capability_ledger rows',
  'the Rollback header of migrations/2026-10-20-research-cluster-b.sql',
  'issues 99913, 2792 and 2158 close when their probes read the definition of done; 100274 reads its true remainder',
  'the research issue cluster drains on its own evidence within the contract cadence',
  'none',
  'd1:qnfo-audit and living-paper read-only counts, node:sqlite replay in migrations/research-cluster-b.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'RESEARCH-CLUSTER-B-1:%');
