-- RESEARCH-PROVENANCE-1 (2026-10-26, pillar research; owner question: "WHY ARE THERE 2 RESEARCH REPOS? ARE ALL RESEARCH ARTIFACTS BEING PRESERVED FOR
-- PROVENANCE AND REPRODUCIBILITY? ... ALIGN/INTEGRATE WITH QNFO PAPERS/PUBLICATIONS FOR AUDITING/TRACEABILITY/PROVENANCE/REPRODUCIBILITY").
--
-- WHAT WAS MEASURED (qnfo-audit and living-paper read-only, the two repositories cloned, 2026-10-26)
--   cloud_ops_events job=qnfo-research-exec kind=github: 400 deposit events 2026-10-10..26, every one status 'ok', 97 of them containing an HTTP 409.
--   pushArtifactsToGitHub made one contents-API PUT per file on one branch and returned { ok: true } whatever each status was. Result in git: 154
--   manifest-listed files absent from 47 runs, 48 runs with no MANIFEST.json, no reconciled paper in any run, 201 of 292 pipeline paper slugs with no
--   papers/<slug>/paper.md. depositToGithub (publishV2) PUT without `sha`, which GitHub refuses (422) for an existing file, so 95 of 121 papers have
--   exactly one commit while 193 published papers are at a revised version in living-paper. Its two ledger inserts (publication_artifacts,
--   cloud_ops_events) had unquoted SQL (datetime(now), artifact-deposit) inside empty catch blocks: publication_artifacts holds 0 GitHub rows.
-- WHAT THIS CHANGES
--   1. research_run_ledger: one row per pipeline run with the repository, run path, paper version and sha256, manifest sha256, commit and a status
--      (ok | landed-unverified | error | deferred). It is the join that did not exist: research_queue.id <-> slug <-> repository path <-> commit,
--      kept outside git so the hashes can be compared with git's. Written by qnfo-research-exec 0.35.0 (repo-deposit.mjs).
--   2. v_research_run_deposit_failures: a deposit that stayed error/deferred for an hour, and a run published after the ledger began that has no
--      ledger row at all. Detector fm-research-run-deposit (expected 0). No new metric_registry row: the detector contract files its own issue on a hit.
--   3. ops_config switches (all reversible without a deploy): research_repo_target (auto | legacy | consolidated), research_repo_sync (on | off),
--      research_repo_restore (on | off), research_repo_archive (on | off), research_repo_sync_batch, research_repo_sync_cursor, research_repo_catchup_at.
--   4. failure_modes rows for the two defects, with root cause and remediation.
-- Closing measure: the detector reads 0 for 24 hours after the deploy and `SELECT COUNT(*) FROM research_run_ledger WHERE status = 'ok'` grows with
-- each published paper. The repository side is checked by `python3 tools/provenance.py verify` in QNFO/qnfo-research (CI workflow provenance.yml).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_research_run_deposit_failures; DROP TABLE IF EXISTS research_run_ledger; DELETE FROM ops_config WHERE key IN ('research_repo_target', 'research_repo_sync', 'research_repo_restore', 'research_repo_sync_batch', 'research_repo_sync_cursor', 'research_repo_catchup_at', 'research_repo_archive'); DELETE FROM remediation_contracts WHERE class = 'fm-research-run-deposit'; DELETE FROM failure_modes WHERE fm_key IN ('research-run-deposit-partial', 'research-paper-text-stale-in-git');

CREATE TABLE IF NOT EXISTS research_run_ledger (
  run_id          TEXT PRIMARY KEY,                -- research_queue.id
  slug            TEXT NOT NULL,
  repo            TEXT,                            -- QNFO/qnfo-research | QNFO/qnfo-ensemble-research (legacy layout)
  run_path        TEXT,                            -- runs/cycle-N/<slug> (cycle-N/<slug> in the legacy layout)
  cycle           TEXT,
  paper_path      TEXT,                            -- papers/<slug>/paper.md or <program>/<slug>/paper.md; NULL when the run was deposited without its paper
  paper_version   TEXT,
  paper_sha256    TEXT,
  manifest_sha256 TEXT,
  commit_sha      TEXT,
  status          TEXT NOT NULL,                   -- ok | landed-unverified | error | deferred
  error           TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,      -- deposit tries across ticks (a failed deposit is retried by the sync tick)
  worker_version  TEXT,
  deposited_at    TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_run_ledger_status ON research_run_ledger(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_research_run_ledger_slug ON research_run_ledger(slug);

CREATE VIEW IF NOT EXISTS v_research_run_deposit_failures AS
SELECT run_id, slug, status AS state, COALESCE(error, '') AS detail, attempts, updated_at
FROM research_run_ledger
WHERE status IN ('error', 'deferred') AND updated_at < datetime('now', '-60 minutes')
UNION ALL
SELECT q.id, q.paper_slug, 'missing', 'published without a ledger row', 0, q.published_at
FROM research_queue q
WHERE q.status = 'published' AND q.paper_slug IS NOT NULL
  AND replace(substr(q.published_at, 1, 19), 'T', ' ') > (SELECT COALESCE(MIN(updated_at), '9999-12-31') FROM research_run_ledger)
  AND replace(substr(q.published_at, 1, 19), 'T', ' ') < datetime('now', '-60 minutes')
  AND NOT EXISTS (SELECT 1 FROM research_run_ledger l WHERE l.run_id = q.id);

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('research_repo_target', 'auto', 'RESEARCH-PROVENANCE-1: where qnfo-research-exec deposits a run. auto = QNFO/qnfo-research once it carries provenance/IMPORT.json (the consolidation marker), else the legacy QNFO/qnfo-ensemble-research. legacy | consolidated pins it. Paper text is written only in the consolidated layout.'),
 ('research_repo_sync', 'on', 'RESEARCH-PROVENANCE-1: off stops the paper-text sync (published living-paper text -> papers/<slug>/ in the research repository, research_repo_sync_batch papers per tick).'),
 ('research_repo_restore', 'on', 'RESEARCH-PROVENANCE-1: off stops the restore of the gaps listed in provenance/known-gaps.json (run files from R2 by hash, paper text from living-paper).'),
 ('research_repo_sync_batch', '6', 'RESEARCH-PROVENANCE-1: papers compared with their git copy per tick (a few GitHub reads each, one commit for the ones that differ).'),
 ('research_repo_sync_cursor', '', 'RESEARCH-PROVENANCE-1: last slug the paper-text sync compared; empty = start of the list. Maintained by the worker.'),
 ('research_repo_catchup_at', '0', 'REPO-CONSOLIDATION-1: epoch ms of the last dispatch of QNFO/qnfo-research ensemble-catchup.yml (at most one per 6 hours). Maintained by the worker.'),
 ('research_repo_archive', 'on', 'REPO-CONSOLIDATION-1: off stops the worker from filing the archive request (portfolio_actions, PORTFOLIO-ARCHIVE-1) for QNFO/qnfo-ensemble-research once every cycle is in qnfo-research runs/ and 3 consolidated deposits are ledgered.');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('research-run-deposit-partial',
  'a pipeline run is reported deposited in git while files are missing: 154 manifest-listed files absent from 47 runs, 48 runs without a manifest, no reconciled paper in any run',
  'pushArtifactsToGitHub wrote one file per contents-API PUT on one branch; parallel stage slots collided (HTTP 409), the per-file status was ignored and the result was { ok: true }; the manifest, the last file, is therefore the one most often missing; the manifest was built before the push and listed files that never arrived; the cycle number was read before the writes',
  'RESEARCH-PROVENANCE-1: repo-deposit.mjs writes the run and its paper as one Git Data API commit (blobs, tree, commit, a ref update without force), retried on the new head after a refused update, with a blob-integrity check and a manifest read-back; the result is ok only after both; every attempt is a research_run_ledger row; a failed deposit is retried by the sync tick; provenance/known-gaps.json in QNFO/qnfo-research lists the historical gaps and the restore tick fills them from R2 only when the hash equals the manifest''s',
  'v_research_run_deposit_failures has no row (fm-research-run-deposit) and `python3 tools/provenance.py verify` in QNFO/qnfo-research reports 0 errors', 'fm-research-run-deposit', '2026-10-26', NULL,
  'two or more stage slots publish in the same minute, or GitHub answers 5xx/429 while a run is being written',
  'a run directory in git lacks files its MANIFEST.json lists, or has no manifest; research_queue rows are published with no research_run_ledger row',
  'the audit trail of every pipeline paper; reproducibility of its verification; the owner reading the repository as the record'),
 ('research-paper-text-stale-in-git',
  'the text of a published paper in git is older than the published text, or absent: 95 of 121 papers have one commit while 193 published papers are at a revised version; 201 pipeline papers have no papers/<slug>/paper.md',
  'depositToGithub PUT papers/<slug>/paper.md without the file sha, which GitHub refuses with 422 for an existing file, and the result was ignored (the ledger inserts that would have shown it had unquoted SQL in empty catch blocks); the active publish path (publishStageV2) never wrote papers/<slug>/ at all; claim-integrity was the only writer that passed a sha',
  'RESEARCH-PROVENANCE-1: every paper write goes through depositPapers (read the current file, commit the new text, append a snapshot to papers/<slug>/provenance.json); a sync tick compares research_repo_sync_batch published papers per tick with living-paper and commits the ones that differ; unchanged text makes no commit',
  'every published pipeline paper has papers/<slug>/paper.md whose sha256 is the latest snapshot in its provenance.json (verify warns PAPER_REVISED_UNRECORDED otherwise)', 'fm-research-run-deposit', '2026-10-26', NULL,
  'a paper is revised and republished after its first deposit, or published through the 0.8 pipeline',
  'papers.qnfo.org shows a version that git does not hold',
  'anyone auditing a paper against the repository; hash comparisons between the published text and git');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-research-run-deposit', NULL, 'RESEARCH-PROVENANCE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_research_run_deposit_failures) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-research-exec', 1, 'active', 'failure-mode');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-code-session_01LZjc7uUB8m8Nz9UBDuVGUY',
  'the two research repositories hold one record that was split by accident, not by design: qnfo-research the published papers, qnfo-ensemble-research the process artifacts of each run, with the slug as the only (implicit) key',
  'fold qnfo-ensemble-research into qnfo-research/runs with git subtree (history kept), add the provenance layer (RO-Crate per run, provenance.json per paper, a known-gaps ledger, tools/provenance.py, CI), and change qnfo-research-exec 0.35.0 to deposit atomically into the one repository with a D1 ledger',
  'audit 2026-10-26: 400 deposit events all ok with 97 containing a 409; 154 manifest-listed files absent from 47 runs; 48 runs without a manifest; 201 of 292 pipeline slugs with no paper text; 95 of 121 papers with one commit while 193 published papers are revised; 2,338 present files all hash-match; 373 of 375 verification scripts with a record reproduce; no secrets in either repository',
  'qnfo-research PR (draft) with the import and the provenance layer; qnfo-workers PR (draft) with repo-deposit.mjs, the worker wiring, this migration and offline suites in both repositories; qnfo-ensemble-research notice',
  'qnfo-research main (additive paths only; the live pipeline keeps writing the old repository until 0.35.0 deploys and the marker exists); the research deposit path of qnfo-research-exec; one new D1 table, one view, five ops_config keys',
  'set ops_config research_repo_target = legacy and research_repo_sync = off, research_repo_restore = off (no deploy); revert the qnfo-workers PR; the qnfo-research import is a merge commit that can be reverted and the old repository is archived, not deleted; the migration Rollback line drops the ledger objects',
  'a verified single-commit deposit with read-back, a per-run D1 ledger and a repository that the verifier can fail; the research record is complete or lists exactly what is missing',
  'fm-research-run-deposit observed = 0 within 24 h of the deploy; research_run_ledger has an ok row for every paper published after it',
  'every pipeline paper has a path from papers.qnfo.org to its run, sources and verification, and back',
  'git (subtree import, 3,324 commits), GitHub Git Data API (fake in the suite), D1 qnfo-audit and living-paper (read), R2 (read by key, in the restore path), Python 3.13 re-execution of all 388 verification scripts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'claude-code-session_01LZjc7uUB8m8Nz9UBDuVGUY' AND instr(action, 'fold qnfo-ensemble-research') = 1);
