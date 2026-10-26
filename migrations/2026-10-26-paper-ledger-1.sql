-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: registers, issues, contracts and the append-only decision records stay; the living-paper objects are removed by the DROP TRIGGER list in migrations/living-paper/2026-10-26-paper-change-ledger.sql.';
-- PAPER-LEDGER-1, PAPER-WITHDRAW-GUARD-1 and PAPERS-FTS-DRIFT-1 (2026-10-26, charter pillars research and reach; owner directive 2026-10-26: "papers should never disappear en masse; versioning needs to
-- preserve changes across multiple revisions for auditing and provenance; audit and remediate publication quality checks and gates; identify and remediate root causes of repeated failures").
-- The living-paper DDL is recorded in migrations/living-paper/ (applied live on 2026-10-26 after a 42-case test on a scratch D1: nested version bump under D1's trigger-depth limit, atomic
-- rollback of an over-cap batch, override rules, the floor path, FTS, slug rename, deletes, immutability). This file registers it: controls, capability, failure modes with live detectors,
-- decisions, the follow-up issues each with a doer and a probe, and the closure of an issue the work made moot.
--
-- Measured before the change (living-paper, 2026-10-26):
--   * paper_version_history keeps one prior body per (slug, version): 140 (slug, version) pairs were edited more than once in two days (up to 4 times), 134 papers revised since 1 October
--     have no history row, 68 papers claim more versions than were ever archived. paper_body_backups (since 2026-10-24) keeps every replaced body but no actor, reason, status or metadata.
--   * Nothing limited how many papers one writer could move out of public status: the publication gate withdrew 364 of 707 in eleven hours.
--   * papers_fts failed INSERT INTO papers_fts(papers_fts, rank) VALUES('integrity-check', 1) with SQLITE_CORRUPT_VTAB and held 1078 docsize rows for 1077 papers.
-- Measured after: the 07:21Z gate run restored 252 papers one by one (public total 709, 0 refused, 0 withdrawals) and the ledger recorded all 252; integrity-check passes; search found a paper the
-- drifted index had been missing.

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence)
VALUES (
  'paper-mass-withdrawal-guard',
  'living-paper triggers trg_papers_mass_withdraw_guard and trg_papers_mass_delete_guard; override table paper_withdrawal_override (migrations/living-paper/2026-10-26-paper-change-ledger.sql)',
  'guard',
  'any writer or rule moving most of the public corpus out of published, distributed or external_preprint (2026-10-25: 364 of 707 in eleven hours), or deleting paper rows in bulk',
  0,
  'keep',
  'applied',
  'an unexpired, reasoned row in paper_withdrawal_override (at most 500 papers, at most 24 hours, scope withdraw or delete) lifts the cap without a deploy; DROP TRIGGER removes the guard (the definitions are in the DDL record); a refused batch rolls back whole and the writer sees MASS-WITHDRAWAL-BLOCKED',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'Scratch-D1 suite 42 of 42 on 2026-10-26, including: a batch of 30 withdrawals refused whole at the 26th, a batch of 20 passing, a crossing batch leaving no partial rows, override rules (no reason, over 24 hours, over 500, bad scope), a delete cap of 5 an hour independent of the withdrawal override. Live: the 07:21Z restore of 252 papers raised no refusal because a restore is not a withdrawal. The caps (25 an hour, 80 a day, 5 deletes an hour) are set above the measured normal rate of single digits a day.'
);

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence)
VALUES (
  'paper-change-ledger',
  'living-paper paper_change_ledger, paper_change_bodies, paper_change_body_archive and triggers paper_ledger_ai, paper_ledger_au, paper_ledger_ad (migrations/living-paper/2026-10-26-paper-change-ledger.sql)',
  'guard',
  'a paper revision, status change or deletion that leaves no record of what it replaced, who made it and why (the legacy archive keeps one body per version)',
  0,
  'keep',
  'applied',
  'the legacy tables paper_version_history and paper_body_backups still fill; a writer that sets papers.change_actor and papers.change_reason is attributed, one that does not is recorded as unattributed; DROP TRIGGER paper_ledger_au stops the ledger without touching the data',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'Live 2026-10-26: 867 body revisions and 364 gate demotions backfilled; 252 restores and 14 in-place repairs recorded by the triggers (the 14 attributed to the session). Ledger and archive rows cannot be updated or deleted; a stored body can be removed only after paper_change_body_archive holds an off-database copy of the same size.'
);

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES (
  'append-only paper revision ledger with attributed writers',
  'PAPER-LEDGER-1, 2026-10-26 (living-paper triggers; qnfo-audit migration 2026-10-26-paper-ledger-1.sql)',
  'papers.change_actor and papers.change_reason set by the writer in the same UPDATE; living-paper D1',
  'scratch-D1 suite 42 of 42; live triggers exercised by 266 real changes within the hour of going live',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'SELECT * FROM v_paper_ledger_health; SELECT * FROM v_paper_revisions WHERE slug = ''<slug>'' ORDER BY seq; living-paper'
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'papers-fts-drift',
  'The full-text index of the papers table drifts from the table and eventually fails with SQLITE_CORRUPT_VTAB',
  'papers_au ran an FTS5 delete and insert on every update of any column, including the nested UPDATE inside papers_insert_meta. SQLite fires AFTER INSERT triggers newest first, so that nested update ran before papers_ai had indexed the new row: a delete for a row the index never held. In a populated index that leaves duplicate entries and a ghost docsize row, in an empty one the insert fails outright.',
  'papers_au now fires only when title or abstract change (the two indexed columns); the index was rebuilt and passes integrity-check. A new papers trigger must not run an FTS statement for an update that leaves title and abstract alone.',
  'fm-papers-fts-drift d1-query@living-paper: papers_fts_docsize rows equal papers rows',
  'fm-papers-fts-drift',
  '2026-10-26',
  NULL,
  'an AFTER INSERT or UPDATE trigger on papers issues an FTS5 delete for a row the index does not hold',
  'INSERT INTO papers_fts(papers_fts, rank) VALUES(''integrity-check'', 1) answers SQLITE_CORRUPT_VTAB; docsize rows differ from papers rows; search misses or repeats papers',
  'papers.qnfo.org search and the gateway MATCH queries; any new insert into papers on a database whose index had drifted'
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'paper-history-lossy',
  'A paper edited more than once at one version keeps only the first earlier body; status, metadata, actor and reason are never recorded',
  'papers_version_archive_upd and papers_version_archive_ver insert only WHERE NOT EXISTS (same slug and version), so later states at the same version are dropped; paper_body_backups (since 2026-10-24) records bodies only; nothing recorded a status change, a delete or who wrote a change.',
  'paper_change_ledger and paper_change_bodies (append-only, every tracked field, full prior body, actor and reason), triggers on insert, update and delete; the legacy archive triggers are left in place.',
  'fm-paper-history-lossy d1-query@living-paper: the ledger and guard triggers exist',
  'fm-paper-history-lossy',
  '2026-10-26',
  NULL,
  'a paper is revised twice at one version, or its status changes, or its row is deleted',
  'paper_version_history has fewer rows than version_count claims; a withdrawal cannot be attributed to a writer',
  'every audit of how a published paper came to read as it does'
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'paper-mass-withdrawal',
  'Many published papers leave public status within hours, by a rule change, a bug or a bulk statement',
  'No limit existed at the database: any writer could set status to quarantined, retracted or superseded on every public paper in one statement (2026-10-25: 364 of 707 in eleven hours by the publication gate).',
  'trg_papers_mass_withdraw_guard (25 an hour, 80 a day) and trg_papers_mass_delete_guard (5 an hour) refuse the statement whole and name the override; the publication gate no longer withdraws at all (pub-gate-v4-no-withdraw).',
  'fm-paper-mass-withdrawal d1-query@living-paper: fewer than 20 withdrawals in 24 hours in the ledger',
  'fm-paper-mass-withdrawal',
  '2026-10-25',
  NULL,
  'a writer moves more than a few papers out of public status in an hour',
  'papers.qnfo.org total and the papers sitemap fall; v_paper_withdrawals_24h lists the writer',
  'every public paper, the sitemap, the Substack and Bluesky roll-ups and the PDF queue'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-papers-fts-drift',
  NULL,
  'the papers_au title and abstract trigger is in place and papers_fts was rebuilt',
  'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM papers_fts_docsize) = (SELECT COUNT(*) FROM papers) THEN ''ok'' ELSE ''fts drift: docsize '' || (SELECT COUNT(*) FROM papers_fts_docsize) || '' vs papers '' || (SELECT COUNT(*) FROM papers) END AS observed',
  'd1-query@living-paper',
  1000,
  'qnfo-ops',
  1,
  'active',
  'failure-mode'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-paper-history-lossy',
  NULL,
  'the PAPER-LEDGER-1 triggers were applied to living-paper',
  'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name IN (''paper_ledger_ai'', ''paper_ledger_au'', ''paper_ledger_ad'', ''trg_papers_mass_withdraw_guard'', ''trg_papers_mass_delete_guard'')) = 5 THEN ''ok'' ELSE ''ledger or guard trigger missing'' END AS observed',
  'd1-query@living-paper',
  1000,
  'qnfo-ops',
  1,
  'active',
  'failure-mode'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-paper-mass-withdrawal',
  NULL,
  'the PAPER-LEDGER-1 triggers were applied to living-paper',
  'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM paper_change_ledger WHERE withdrawal = 1 AND ts >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-24 hours'')) < 20 THEN ''ok'' ELSE ''withdrawals in 24 hours: '' || (SELECT COUNT(*) FROM paper_change_ledger WHERE withdrawal = 1 AND ts >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-24 hours'')) END AS observed',
  'd1-query@living-paper',
  1000,
  'qnfo-cloud-ops',
  1,
  'active',
  'failure-mode'
);

-- PAPER-LEDGER-ATTRIBUTION-1 (the publication gate own writes) is fixed in this PR (qnfo-cloud-ops 1.37.0), so no issue is filed for it.

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PAPER-LEDGER-ATTRIBUTION-2: research-exec and errata writers set change_actor and change_reason on every papers update',
  'Charter pillar: research. Same convention as the one qnfo-cloud-ops 1.37.0 applies to the publication gate restore (change_actor "qnfo-cloud-ops:<run id>", change_reason naming the quarantine it undoes). qnfo-research-exec has 17 UPDATE papers sites (publish, revise, retract, doi, gate verdict, slug rename) and qnfo-errata-publish one; the reviser and errata members are folded into research-exec and bound by fold-pair parity suites, so the edit is made in the member source and the host together (a one-file code task ends needs_human: FOLD-PAIR-TASK-1).' || char(10) ||
  'Doer: a session (two-file change). Change: each UPDATE papers SET ... also sets change_actor = "<worker>:<stage>:<row id>" and change_reason = a sentence naming what the stage did to this paper. Sites are listed by: grep -n "UPDATE papers SET" qnfo-research-exec/worker.js qnfo-errata-publish/worker.js.' || char(10) ||
  'Definition of done: v_paper_ledger_health.unattributed_24h is under 10 percent of changes_24h for 24 hours of normal publishing.' || char(10) ||
  'Blocked now by live claims on qnfo-research-exec/worker.js (RESEARCH-PROVENANCE-1, until 08:59Z); take the claim when it lapses.',
  'session', 'research', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'PAPER-LEDGER-ATTRIBUTION-2: research-exec and errata writers set change_actor and change_reason on every papers update' AND status = 'open');

UPDATE remediation_contracts
SET precondition = 'PAPER-LEDGER-ATTRIBUTION-2: the research-exec and errata writers are the sources of unattributed ledger rows',
    action = 'a session edits each UPDATE papers site in the member source and the fold host together',
    verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM paper_change_ledger WHERE backfilled = 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-24 hours'')) < 20 OR (SELECT COUNT(*) FROM paper_change_ledger WHERE backfilled = 0 AND actor = ''unattributed'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-24 hours'')) * 10 < (SELECT COUNT(*) FROM paper_change_ledger WHERE backfilled = 0 AND ts >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-24 hours'')) THEN ''ok'' ELSE ''unattributed share above 10 percent in 24 hours'' END AS observed',
    verify_transport = 'd1-query@living-paper',
    max_attempts = 1000,
    expected_cadence_h = 1,
    status = 'active',
    attempts = 0,
    last_verdict = NULL,
    next_due_at = datetime('now'),
    module = 'paper-ledger-attribution'
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = 'PAPER-LEDGER-ATTRIBUTION-2: research-exec and errata writers set change_actor and change_reason on every papers update' AND status = 'open' ORDER BY id DESC LIMIT 1);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PAPER-LEDGER-ARCHIVE-1: move old stored bodies of the paper ledger to R2 before the table is large',
  'Charter pillar: research. paper_change_bodies keeps the full prior body of every revision (about 30 KB each; the legacy backup table grew 865 rows in 40 hours). A body may be removed only after paper_change_body_archive holds an off-database copy of the same size (a trigger enforces it), but nothing writes those copies yet, so the table only grows. PAPER-BODY-BACKUP-RETENTION-1 (code task on qnfo-research-exec) prunes the legacy paper_body_backups; the ledger is the permanent record and must be archived, not pruned.' || char(10) ||
  'Doer: qnfo-code-orchestrator. Change: an hourly job in qnfo-cloud-ops copies the oldest stored bodies beyond a 300 MB total to the RELEASES bucket (key paper-ledger/<seq>.md, content unchanged), reads the object back, inserts paper_change_body_archive (seq, r2_key, bytes, fingerprint) and only then deletes the body row. The ledger row stays; its body_len and fingerprint remain the check.' || char(10) ||
  'Definition of done: the probe stays below the threshold; a regression archives a body, restores it from R2 and matches the fingerprint.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-cloud-ops/worker.js' || char(10) ||
  'code-anchor: async function jobQualityScore(env) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-cloud-ops/worker.js"], "contains": "paper_change_body_archive"}',
  'session', 'research', 'low', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'PAPER-LEDGER-ARCHIVE-1: move old stored bodies of the paper ledger to R2 before the table is large' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PUB-ARTIFACT-LEFTOVERS-1: 38 published papers still carry the leaked Appendix A and B (owner papers, a non-trailing appendix, prose that cites it)',
  'Charter pillars: research and reach. After the gate restored every paper it had withdrawn (2026-10-26 07:21Z, no paper is withdrawn any more) and 126 pipeline papers had their trailing Appendix A and B removed, 38 published papers still carry the two internal sections: 6 owner papers (qnfo-2025-00-*, never rewritten by the fleet), 9 whose appendix is not the last section (a References, Conclusion, Provenance or single-source appendix follows) and 23 whose Abstract, Introduction or Methods say the divergences are "documented in Appendix A" or name the source drafts. They are flagged release_gate_pass 0 with reason quality:internal-artifact, which sends them to the revision loop first.' || char(10) ||
  'Order: PUB-ARTIFACT-SOURCE-1 first (the RECONCILE prompt would write the appendices again into a regenerated paper). Then the paper reviser rewrites the 32 pipeline papers without the appendices and without sentences that cite them; the 6 owner papers are compared against paper_version_history and the owner text from before the pipeline revision is republished if one exists, otherwise a human_actions card with an IDENTITY-BOUND line is opened (the owner''s own authored text).' || char(10) ||
  'Definition of done: none of the 38 still holds a Divergence report heading. Backups of the originals: living-paper.papers_artifact_repair_bak_20261026.',
  'session', 'research', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'PUB-ARTIFACT-LEFTOVERS-1: 38 published papers still carry the leaked Appendix A and B (owner papers, a non-trailing appendix, prose that cites it)' AND status = 'open');

UPDATE remediation_contracts
SET precondition = 'PUB-ARTIFACT-LEFTOVERS-1: the 38 papers are those of papers_artifact_repair_bak_20261026 that still hold a Divergence report heading',
    action = 'the paper reviser regenerates the pipeline papers after PUB-ARTIFACT-SOURCE-1; owner papers follow the issue text',
    verify_probe = 'SELECT ''clear'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM papers p WHERE p.slug IN (SELECT slug FROM papers_artifact_repair_bak_20261026) AND p.status IN (''published'', ''distributed'', ''external_preprint'') AND (instr(lower(p.body_md), ''## appendix a. divergence report'') > 0 OR instr(lower(p.body_md), ''## appendix b. claim attribution'') > 0)) THEN ''pending: leaked appendices remain'' ELSE ''clear'' END AS observed',
    verify_transport = 'd1-query@living-paper',
    max_attempts = 1000,
    expected_cadence_h = 1,
    status = 'active',
    attempts = 0,
    last_verdict = NULL,
    next_due_at = datetime('now'),
    module = 'publication-artifact-leftovers'
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = 'PUB-ARTIFACT-LEFTOVERS-1: 38 published papers still carry the leaked Appendix A and B (owner papers, a non-trailing appendix, prose that cites it)' AND status = 'open' ORDER BY id DESC LIMIT 1);

UPDATE remediation_contracts
SET status = 'superseded', last_verdict = 'superseded:closure-superseded (PAPER-LEDGER-1)', last_attempt_at = datetime('now')
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = 'PUB-GATE-BREAKER-1: a deterministic gate rule change must not quarantine the published corpus in bulk' AND status = 'open' ORDER BY id DESC LIMIT 1);

UPDATE issue_triage
SET triage_state = 'closed', triaged_at = datetime('now'),
    close_evidence = 'superseded: the breaker asked for a cap on deterministic quarantines; the gate no longer quarantines at all (qnfo-cloud-ops 1.36.0 pub-gate-v4-no-withdraw, PR 4298 merged 2026-10-26T06:45:57Z, control_registry pub-gate-withdraw = remove) and living-paper now refuses any writer more than 25 withdrawals an hour or 80 a day (trg_papers_mass_withdraw_guard, control paper-mass-withdrawal-guard, scratch suite 42 of 42). Read 2026-10-26 07:22Z: publication_gate_audit holds 252 decision restore rows from the 07:21Z run and no demote; paper_change_ledger holds 0 withdrawal rows since the guard went live.'
WHERE issue_id IN (SELECT id FROM agent_issues WHERE title = 'PUB-GATE-BREAKER-1: a deterministic gate rule change must not quarantine the published corpus in bulk' AND status = 'open');

UPDATE agent_issues
SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE status = 'open' AND title = 'PUB-GATE-BREAKER-1: a deterministic gate rule change must not quarantine the published corpus in bulk'
  AND id IN (SELECT issue_id FROM issue_triage WHERE triage_state = 'closed' AND close_evidence IS NOT NULL);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session_017ikgFYTJ6HPpquENrmyWHJ',
  'Papers must not disappear en masse and every revision must stay auditable; a database-level guard and an append-only ledger give both whichever worker or session writes, and cost one small row per change.',
  'PAPER-LEDGER-1 + PAPER-WITHDRAW-GUARD-1: add papers.change_actor and change_reason, the append-only paper_change_ledger, paper_change_bodies and paper_change_body_archive, the insert, update and delete triggers, the mass-withdrawal guard (25 an hour, 80 a day) and mass-delete guard (5 an hour) with an expiring override table, three views, and backfill from paper_body_backups (867), the gate demotions (364) and the 2026-10-26 repair (158).',
  'Measured the flaw first (140 pairs edited more than once, 134 papers without history, 68 with fewer archived versions than claimed); built the DDL; ran it locally on SQLite, then on a scratch D1 built from production DDL: 42 of 42 cases, including the nested version bump under D1''s trigger-depth limit and the atomic rollback of an over-cap batch; applied live as one atomic call; then the 07:21Z gate run restored 252 papers and the ledger recorded 252 live rows with no refusal.',
  'live: triggers exercised by 266 real changes in the first hour, 0 refusals, 0 withdrawals',
  'every write to living-paper.papers (one ledger row per tracked change; AFTER UPDATE triggers add the nested depth of one level), the 25 an hour and 80 a day cap on withdrawals',
  'DROP TRIGGER IF EXISTS paper_ledger_ai; paper_ledger_au; paper_ledger_ad; trg_papers_mass_withdraw_guard; trg_papers_mass_delete_guard (the tables and the data stay; the legacy archive triggers were never touched)',
  'append-only paper revision ledger with attributed writers',
  'indexed_surface >= 455 within 24 h',
  'a revision, status change or deletion of any published paper can be reconstructed and attributed; a repeat of the 2026-10-25 withdrawal is refused after 25 papers',
  'scratch D1 built from production DDL (42 cases), local SQLite replica (39 cases), live ledger after the 07:21Z gate run, live FTS integrity-check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PAPER-LEDGER-1 + PAPER-WITHDRAW-GUARD-1: add papers.change_actor') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session_017ikgFYTJ6HPpquENrmyWHJ',
  'The papers_fts index is a derived structure: maintaining it only for the two columns it indexes is correct, and a rebuild from the content table restores it exactly.',
  'PAPERS-FTS-DRIFT-1: restrict papers_au to AFTER UPDATE OF title, abstract with a WHEN on the two columns, and rebuild papers_fts.',
  'integrity-check answered SQLITE_CORRUPT_VTAB on production; papers_fts_docsize held 1078 rows for 1077 papers; a scratch database built from production DDL failed its first INSERT INTO papers for the same reason; after the change integrity-check passes, docsize equals papers (1077), search for ultrametric went from 76 to 77 papers.',
  'live: integrity-check ok, docsize 1077 = papers 1077',
  'papers.qnfo.org search (gateway MATCH queries) and every insert into papers',
  'Restore the previous papers_au text from trigger_bak_20261026 (name papers_au), then INSERT INTO papers_fts(papers_fts) VALUES(''rebuild'').',
  NULL,
  'indexed_surface >= 455 within 24 h',
  'search returns every published paper once',
  'living-paper FTS integrity-check before and after, scratch D1 with production triggers, live search probes'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PAPERS-FTS-DRIFT-1: restrict papers_au') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session_017ikgFYTJ6HPpquENrmyWHJ',
  'A paper the gate has returned to published can be repaired in place when its trailing Appendix A and B are the only artifact sections, its prose never cites them or the source drafts, and the publish floor refuses only a write that shortens a published paper below 8,000 characters or by half.',
  'PUB-ARTIFACT-LEFTOVERS-1 (part): strip the trailing Appendix A and B in place from 14 pipeline papers that fell under the 20,000-character floor once stripped and could not be restored before; clear their pdf_path so qnfo-pdf renders them again; attributed to the session in the ledger.',
  'Dry run over the 61 published papers of the repair set that still hold the text: 6 owner, 9 not trailing, 23 with prose that cites the appendices or the drafts, 14 eligible (shortest 18,167 characters after the strip); 14 applied, 0 errors, all still published; 14 attributed ledger rows; originals in papers_artifact_repair_bak_20261026 and pdf_path in papers_artifact_repair_pdf_bak2_20261026.',
  'live: 14 of 14 applied',
  'the 14 papers (pages, markdown mirror, PDF until re-rendered)',
  'Per paper from papers_artifact_repair_bak_20261026 (body_md) and papers_artifact_repair_pdf_bak2_20261026 (pdf_path); the earlier body is also in paper_change_bodies.',
  NULL,
  'indexed_surface >= 455 within 24 h',
  '14 papers public without internal pipeline sections',
  'living-paper bodies before and after, ledger rows, the dry-run classification'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PUB-ARTIFACT-LEFTOVERS-1 (part): strip the trailing Appendix A and B in place') = 1);
