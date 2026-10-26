-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: the issues, failure mode, contracts and the append-only decision and session records stay; the living-paper data rollback is the SQL in decision_log.rollback_path for PUB-GATE-BULK-DEMOTION-1.';
-- PUB-GATE-BULK-DEMOTION-1 (2026-10-26, charter pillars research and reach; PUB-GATE-RESTORE-1 is PR 4298, written by another session).
--
-- What happened. qnfo-cloud-ops 1.34.0 (PUB-STRUCTURE-GATE-1, gate pub-gate-v2-structure, mode enforce) made its structure and internal-artifact
-- verdicts deterministic, which exempts them from PUB_GATE_MAX_DEMOTES (that cap bounds score-only demotions). Only PUB_GATE_MAX_CHANGES = 100 a run
-- limited them. The hourly sweep quarantined 100 published papers at 2026-10-25 17:21Z, 100 at 18:20Z, 100 at 19:21Z, 56 at 20:20Z and 8 more up to
-- 04:20Z on 10-26: 364 papers, public total 707 -> 343 (papers.qnfo.org /papers total). Read from living-paper.publication_gate_audit.
--   200 demoted for structure. The checker reads level-2 headings only, so an H1 section with H2 subsections, "1.0 Introduction" numbering and a
--     heading wrapped over two lines read as defects (offline replay of the live function: 45 of the 200 pass once N.0 numbering is read as a section).
--   164 demoted for internal-artifact: the RECONCILE prompt in qnfo-research-exec requires "## Appendix A. Divergence report" and
--     "## Appendix B. Claim attribution" as the last headings of the paper and nothing removes them before publication. Those are real leaks.
--
-- What this session changed in living-paper (data only; the gate code is PR 4298 and is untouched here). Backups: papers_artifact_repair_bak_20261026
--   (164 rows, body_md and gate fields before the change) and papers_artifact_repair_pdf_bak_20261026 (135 rows, pdf_path). papers_body_history_upd
--   also archived every replaced body in paper_body_backups.
--   1. Of the 164 internal-artifact papers: 6 are owner papers (qnfo-2025-*, never rewritten by the fleet) and stayed as they were; 9 have a non-appendix
--      heading after the appendix (References, Conclusion, Provenance) and need a person-sized edit; 14 fall to 18,166-19,845 characters once the
--      appendices go and trg_papers_pub_floor_upd3 refuses to publish them; 135 were cut at the first appendix heading (everything after it was an
--      artifact heading) and set to published with the verdict the live gate computes (ok, release_gate_pass 1).
--   2. Re-checking the 135 with the repo's real pubGateScore: 135 pass. Reading their text then showed 23 whose Abstract, Introduction or Methods say
--      "documented in Appendix A" or "divergences among the source drafts": a reference to a section that no longer exists. Those 23 were put back to
--      their exact pre-repair state (body, status, gate reason equal to the backup). 112 stay published; 9 of them name the appendices only in the
--      generated Version History block.
--   3. The 135 stored PDFs were built from the old bodies, so their pdf_path was cleared; qnfo-pdf renders 6 every 10 minutes (log: "backlog 135 -> 129"
--      at 06:41Z). That lifts the scholar_pdf_backlog metric over its threshold of 50 for about two hours; the metric issue closes itself on recovery.
-- Result read at about 2026-10-26 06:45Z: papers.qnfo.org /papers total 455 (343 + 112), sitemap 460, a repaired page 200 without the appendices.

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PUB-GATE-BREAKER-1: a deterministic gate rule change must not quarantine the published corpus in bulk',
  'Charter pillar: research and reach. Root cause: in qnfo-cloud-ops 1.34.0 the deterministic structure and internal-artifact verdicts bypass PUB_GATE_MAX_DEMOTES, so a new rule ran against every published paper and was limited only by PUB_GATE_MAX_CHANGES = 100 a run. It quarantined 364 papers in nine hourly runs (2026-10-25 17:21Z to 10-26 04:20Z) and the public total fell from 707 to 343 before any person looked.' || char(10) ||
  'Doer: qnfo-code-orchestrator, after PR 4298 (PUB-GATE-RESTORE-1) merges: both edit jobQualityScore. Change: a run that would newly quarantine more than 20 published papers by a deterministic rule quarantines none of them, writes each as decision demote-held in publication_gate_audit (shadow evidence), reports degraded with the count and the dominant reason, and leaves one open issue; a paper first published after the rule version shipped is exempt, so the new-paper flow is not slowed. A rule change therefore shows its effect on the corpus before it acts on it.' || char(10) ||
  'Definition of done: a regression with 25 structurally failing published papers quarantines none, reports degraded and writes 25 demote-held rows; a regression with 5 quarantines all 5; the canonical deploy is verified live.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-cloud-ops/worker.js' || char(10) ||
  'code-anchor: const tooMany = scoreDemotes.length > PUB_GATE_MAX_DEMOTES;' || char(10) ||
  'code-probe: {"paths": ["qnfo-cloud-ops/worker.js"], "contains": "PUB-GATE-BREAKER-1"}',
  'session', 'research', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title = 'PUB-GATE-BREAKER-1: a deterministic gate rule change must not quarantine the published corpus in bulk'
    AND status = 'open'
);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PUB-ARTIFACT-SOURCE-1: the RECONCILE prompt makes the model write Appendix A and B into the paper, and 164 published papers leaked them',
  'Charter pillar: research. Root cause: qnfo-research-exec TASK RECONCILE (steps 2, 3 and 7) lists "## Appendix A. Divergence report" and "## Appendix B. Claim attribution" as required final headings after References, and the same run already writes the divergence report to R2 as divergence-report.json. Nothing removes the two headings before publishV2. Papers revised in 2026-10 carried them; the hourly gate withdrew 164 of them on 2026-10-25 and eight more arrived between 01:20Z and 04:20Z on 10-26.' || char(10) ||
  'Second effect found while repairing them: 23 of 135 repaired papers say in the Abstract, Introduction or Methods that divergences between the source drafts are "documented in Appendix A", and nine more name the appendices in the generated Version History block. Reader-facing text must not describe the drafts (SOURCE-VOICE-1) or point at a section that is not there.' || char(10) ||
  'Doer: qnfo-code-orchestrator after the live claim on qnfo-research-exec/worker.js lapses. Change: end the required heading list at References, tell the reconciling editor to name no appendix and no source draft in the paper (the report stays in R2), remove any Appendix A or B section from the reconciled body before publication, and stop the Version History generator listing them as new sections. PUB-STRUCTURE-ORDER-1 covers heading order and duplicates and is a different change.' || char(10) ||
  'Definition of done: no paper published after the deploy has a Divergence report or Claim attribution heading or a sentence pointing at Appendix A or B; the sweep stops reporting quality:internal-artifact for new papers.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: "7. Appendix B: the claim table (C1..Cn, source drafts, agreement status).",' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "PUB-ARTIFACT-SOURCE-1"}',
  'session', 'research', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title = 'PUB-ARTIFACT-SOURCE-1: the RECONCILE prompt makes the model write Appendix A and B into the paper, and 164 published papers leaked them'
    AND status = 'open'
);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PDF-STALE-AFTER-BODY-EDIT-1: qnfo-pdf never re-renders a stored PDF when the paper body is corrected',
  'Charter pillar: reach. Found by reading qnfo-pdf 1.7.2 while repairing 135 paper bodies on 2026-10-26: pdfBacklogRows has two refresh paths, a renderer-stamp check (staleStamps) and a body-changed-after-upload check (pdfNeedsRefresh on updated_at). The cron and the relay always pass rendererVersion, so only the first runs and the second is unreachable. A corrected body keeps its old public PDF (here the old PDF still contained the leaked appendices after the page was fixed) until someone clears pdf_path by hand.' || char(10) ||
  'Doer: qnfo-code-orchestrator. Change: run the body-changed check in both branches, bounded by the existing two-day lookback and the batch size, keeping the failure-skip logic. A paper republished from quarantine with a pdf_path left over from before the quarantine is covered by the same check.' || char(10) ||
  'Definition of done: a regression where updated_at is newer than the stored PDF and the renderer stamp is current renders the PDF; the canonical deploy is verified.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-pdf/worker.js' || char(10) ||
  'code-anchor: async function pdfBacklogRows(env, batch, skip, opts) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-pdf/worker.js"], "contains": "PDF-STALE-AFTER-BODY-EDIT-1"}',
  'session', 'reach', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title = 'PDF-STALE-AFTER-BODY-EDIT-1: qnfo-pdf never re-renders a stored PDF when the paper body is corrected'
    AND status = 'open'
);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PUB-GATE-LEFTOVERS-1: 62 papers the gate withdrew cannot return on their own (publish floor, hand edits, owner papers)',
  'Charter pillars: research and reach. After the 2026-10-26 repair and before PR 4298 restores the heading-style cases, 62 withdrawn papers need a decision or an edit. List: the 52 rows of living-paper.papers_artifact_repair_bak_20261026 that are still quarantined, plus the ten slugs in the probe.' || char(10) ||
  '(a) 10 structure-class papers of 10,903 to 19,648 characters: trg_papers_pub_floor_upd3 aborts quarantined -> published under 20,000 characters (its only exception is a retracted row that passed the gate), so no restore can return them; three are owner papers (commercial-pathways-to-room-temperature-topological-quantum-computation, chapter-4, 9-are-we-following-the-right-path). Recommended default: extend the reinstatement exception of that living-paper trigger from retracted rows to rows the publication gate quarantined (release_gate_reason LIKE quality:%) with a body of 8000 characters or more, with a backup row and a negative test, because these papers were public before the floor existed. A restore run must also skip any paper the floor refuses, so one of them cannot roll back a batch (hold comment on PR 4298).' || char(10) ||
  '(b) 14 internal-artifact papers of 18,166 to 19,845 characters once the appendices are removed: they passed the floor only because the leaked appendices counted. Recommended default: send them through the paper reviser to reach 20,000 characters on their own content; do not lower the floor.' || char(10) ||
  '(c) 9 internal-artifact papers whose appendix is not the last section (a References, Conclusion, Provenance or single-source appendix follows): remove the two appendices by hand, then let the gate judge them.' || char(10) ||
  '(d) 23 internal-artifact papers whose Abstract, Introduction or Methods refer to Appendix A or the source drafts: edit those sentences, remove the appendices, clear pdf_path so qnfo-pdf renders them again, then let the gate judge them.' || char(10) ||
  '(e) 6 owner papers (qnfo-2025-00-*: 12-emergence-of-spacetime, 9-information-re-founded, close-slobphase1drafting-v10, chapter-1, chapter-2, so-what-of-knowledge) carry the appendices together with Version History and Provenance and AI Involvement sections and versions up to 2.3.0. The fleet does not rewrite or withdraw owner papers. Recommended default: compare paper_version_history and republish the owner text from before the pipeline revision if one exists; otherwise leave them quarantined and open a human_actions card whose why carries an IDENTITY-BOUND line (the owner''s own authored text).' || char(10) ||
  'Doer: the paper reviser and qnfo-ops for the trigger. Definition of done: none of the 62 is quarantined (published, or moved to another status by a recorded decision).',
  'session', 'research', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title = 'PUB-GATE-LEFTOVERS-1: 62 papers the gate withdrew cannot return on their own (publish floor, hand edits, owner papers)'
    AND status = 'open'
);

UPDATE remediation_contracts
SET precondition = 'PUB-GATE-LEFTOVERS-1: the withdrawn papers are listed in the issue',
    action = 'paper reviser edits or republishes each paper; qnfo-ops amends the living-paper publish-floor reinstatement exception; owner papers follow the issue text',
    verify_probe = 'SELECT ''clear'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM papers p WHERE p.status = ''quarantined'' AND (p.slug IN (SELECT slug FROM papers_artifact_repair_bak_20261026) OR p.slug IN (''syntactic-token-calculus'', ''zbw-majorana-tqc-p7-grand-synthesis'', ''spectral-dynamics-and-thermodynamic-stability-in-the-arithmetic-quantum-framework'', ''rosetta-fractal-math'', ''nonlinear-tree-based-numeration-systems-a-consolidated-synthesis'', ''commercial-pathways-to-room-temperature-topological-quantum-computation'', ''monna-map-generation-and-hallucination'', ''qwav-decade'', ''chapter-4'', ''9-are-we-following-the-right-path''))) THEN ''pending: withdrawn papers remain quarantined'' ELSE ''clear'' END AS observed',
    verify_transport = 'd1-query@living-paper',
    max_attempts = 1000,
    expected_cadence_h = 1,
    status = 'active',
    attempts = 0,
    last_verdict = NULL,
    next_due_at = datetime('now'),
    module = 'publication-gate-leftovers'
WHERE class = 'issue-' || (
  SELECT id FROM agent_issues
  WHERE title = 'PUB-GATE-LEFTOVERS-1: 62 papers the gate withdrew cannot return on their own (publish floor, hand edits, owner papers)'
    AND status = 'open'
  ORDER BY id DESC LIMIT 1
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'pub-gate-bulk-demotion',
  'The publication gate withdraws a large share of the published corpus in a few hourly runs',
  'qnfo-cloud-ops 1.34.0 made structure and internal-artifact verdicts deterministic and exempt from the score-only demotion cap, the structure checker read only level-2 headings (H1 sections, N.0 numbering and wrapped headings read as defects), and no shadow pass showed the rule''s effect on the corpus first. Result: 364 of 707 public papers quarantined from 2026-10-25 17:21Z to 10-26 04:20Z.',
  'PUB-GATE-RESTORE-1 (PR 4298) makes heading style soft and restores what it withdrew; PUB-GATE-BREAKER-1 caps deterministic quarantines a run; 112 leaked-appendix papers were repaired and restored by hand on 2026-10-26 with backups; PUB-GATE-LEFTOVERS-1 carries the 62 that cannot return unaided.',
  'fm-pub-gate-bulk-demotion d1-query@living-paper: more than 40 publication_gate_audit demotions in the last 24 hours (counted from 2026-10-26 08:00Z so the known incident does not keep it red).',
  'fm-pub-gate-bulk-demotion',
  '2026-10-25',
  (SELECT id FROM agent_issues WHERE title = 'PUB-GATE-BREAKER-1: a deterministic gate rule change must not quarantine the published corpus in bulk' AND status = 'open' ORDER BY id DESC LIMIT 1),
  'a gate rule is added or changed and the next hourly enforce run finds it failing many already-published papers',
  'papers.qnfo.org /papers total and the papers sitemap drop by tens of papers an hour; publication_gate_audit fills with demote rows from one run_id',
  'every published paper, the sitemap, the Substack and Bluesky roll-ups and the PDF queue'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-pub-gate-bulk-demotion',
  NULL,
  'PUB-GATE-BREAKER-1 is implemented in qnfo-cloud-ops',
  'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM publication_gate_audit WHERE decision = ''demote'' AND status = ''quarantined'' AND run_at >= MAX(datetime(''now'', ''-24 hours''), ''2026-10-26 08:00:00'')) > 40 THEN ''bulk-demotion'' ELSE ''ok'' END AS observed',
  'd1-query@living-paper',
  1000,
  'qnfo-cloud-ops',
  1,
  'active',
  'failure-mode'
);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session_017ikgFYTJ6HPpquENrmyWHJ',
  'The 164 internal-artifact withdrawals were correct (the appendices are pipeline sections); removing the trailing appendices from a pipeline paper whose text does not point at them leaves a paper the live gate passes, and returning it to readers is the state the owner had before the 2026-10-25 sweep.',
  'PUB-GATE-BULK-DEMOTION-1: cut the trailing Appendix A and B from 135 pipeline papers, set them to published with the live gate verdict, clear their pdf_path so qnfo-pdf re-renders, then put 23 back to quarantine because their prose points at the removed appendices. Owner papers, under-floor papers and non-trailing appendices were not touched. File PUB-GATE-BREAKER-1, PUB-ARTIFACT-SOURCE-1, PDF-STALE-AFTER-BODY-EDIT-1 and PUB-GATE-LEFTOVERS-1.',
  'Dry run over all 164 with the live function copied verbatim (6 owner, 9 not trailing, 14 under the floor, 135 eligible, all pass); per-row UPDATE guarded on status, reason and body length, 135 applied, 0 errors; independent re-score of 135 downloaded bodies with the repo''s real pubGateScore: 135 pass; text check found 23 with prose references to Appendix A or B, reverted and compared with the backup (body, status, reason equal for 23 of 23); live /papers total 343 -> 455, sitemap 460, a repaired page 200 without the appendices, qnfo-pdf cron log backlog 135 -> 129.',
  'living-paper: 112 papers published again (public total 455), 23 back in quarantine, 62 withdrawn papers carried by PUB-GATE-LEFTOVERS-1; the next gate run is 07:20Z and its verdict is the one already written',
  'papers.qnfo.org, its sitemap and search index, the PDF queue (112 re-renders, scholar_pdf_backlog above 50 for about two hours), the Substack and Bluesky roll-ups; the stored PDFs of the 112 are absent until re-rendered',
  'Per paper, from the backups in living-paper: UPDATE papers SET body_md = (SELECT b.body_md FROM papers_artifact_repair_bak_20261026 b WHERE b.slug = papers.slug), status = ''quarantined'', release_gate_pass = (SELECT b.release_gate_pass FROM papers_artifact_repair_bak_20261026 b WHERE b.slug = papers.slug), release_gate_at = (SELECT b.release_gate_at FROM papers_artifact_repair_bak_20261026 b WHERE b.slug = papers.slug), release_gate_reason = (SELECT b.release_gate_reason FROM papers_artifact_repair_bak_20261026 b WHERE b.slug = papers.slug), updated_at = (SELECT b.updated_at FROM papers_artifact_repair_bak_20261026 b WHERE b.slug = papers.slug), pdf_path = (SELECT x.pdf_path FROM papers_artifact_repair_pdf_bak_20261026 x WHERE x.slug = papers.slug) WHERE slug IN (SELECT slug FROM papers_artifact_repair_pdf_bak_20261026) AND status = ''published''. Earlier bodies are also in paper_body_backups (reason auto: body_md replaced).',
  'tail-appendix repair of leaked pipeline sections with a per-paper backup, a live-gate re-score and a text check for dangling references',
  'indexed_surface >= 455 within 3 h',
  '112 papers back on papers.qnfo.org and in the sitemap',
  'living-paper D1 (counts, bodies, backups, audit rows), papers.qnfo.org /papers, /papers/<slug>, /papers/<slug>.md and sitemap.xml, qnfo-pdf cron events, the repo''s publication-gate functions, the live publish-floor trigger text'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log WHERE instr(action, 'PUB-GATE-BULK-DEMOTION-1: cut the trailing Appendix A and B') = 1
);

INSERT OR IGNORE INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
) VALUES (
  'session_017ikgFYTJ6HPpquENrmyWHJ',
  'research/publication-gate',
  'Claude Code',
  'Owner asked why 600+ papers fell to 343. Traced it to the hourly publication gate (pub-gate-v2-structure, enforce) quarantining 364 published papers between 2026-10-25 17:21Z and 10-26 04:20Z; found PR 4298 already open for the heading-style half, reviewed it and held it for a batch-rollback defect against the publish-floor trigger; repaired the leaked-appendix half by hand (112 papers back, public total 343 -> 455) and filed the follow-ups.',
  'Reviewed rather than duplicated PR 4298. Left owner papers, under-floor papers and non-trailing appendices alone. Reverted 23 repaired papers after finding prose references to the removed appendices. Did not bypass or edit the publish-floor trigger.',
  'migrations/2026-10-26-pub-gate-bulk-demotion-1.sql',
  'HOLD comment on QNFO/qnfo-workers PR 4298; the migration PR from branch claude/admiring-ramanujan-bv333h',
  'living-paper: papers_artifact_repair_bak_20261026 and papers_artifact_repair_pdf_bak_20261026 created; 135 papers repaired and published, 23 reverted, pdf_path cleared for 112 so qnfo-pdf re-renders.',
  'Open items each carry a doer and a probe: PUB-GATE-BREAKER-1, PUB-ARTIFACT-SOURCE-1, PDF-STALE-AFTER-BODY-EDIT-1, PUB-GATE-LEFTOVERS-1 (62 papers), fm-pub-gate-bulk-demotion. PR 4298 stays on hold until its restore skips papers the publish floor refuses. The PDF re-render finishes in about two hours at 6 per 10 minutes.',
  0.83, 6, 5,
  '2026-10-26T06:20:00Z',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%d %H:%M:%S', 'now')
);
