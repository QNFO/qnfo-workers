-- CLAIM-INTEGRITY-1 (pillar research; qnfo-research-exec 0.22.0, qnfo-gateway 3.28.0). Owner directive 2026-10-19: the research
-- pipeline published experimental designs and human reviews that never happened; stop it, correct or retract every published
-- paper that carries such a claim, and revise post-publication automatically.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS paper_claim_audits; DELETE FROM ops_config WHERE key IN ('claim_integrity_mode', 'claim_integrity_batch'); DELETE FROM analytics_metric_triggers WHERE metric_key IN ('papers_fabricated_claims_open', 'papers_claim_unaudited'); DELETE FROM metric_registry WHERE metric IN ('papers_fabricated_claims_open', 'papers_claim_unaudited'); DELETE FROM remediation_contracts WHERE class = 'fm-paper-fabricated-empirical-claim'; DELETE FROM failure_modes WHERE fm_key = 'paper-fabricated-empirical-claim'; DELETE FROM control_registry WHERE control = 'claim-integrity-gate'; DELETE FROM capability_ledger WHERE capability = 'post-publication-claim-correction';
-- Rollback note: paper_integrity_backups is kept on rollback; it holds the original text of every corrected or retracted paper
-- (restore one: UPDATE living-paper papers SET title, abstract, body_md, version, status from its newest backup row).
--
-- Measured 2026-10-19 12:20Z on living-paper (661 published papers): the paper published 11:31Z states "All measurements are
-- pre-registered, and data are deposited in an open repository", "pilot measurements on a representative derivation task give
-- t_P = 1800 s" and "blind expert reviewers assign a score"; 55 published papers carry an "experimental design" or "experimental
-- setup", 47 mention participants, 40 ethics approval, IRB or informed consent. The pipeline performs none of these acts.
--
-- claim_integrity_mode starts at 'enforce' (owner closeout 2026-10-19: no session stays to flip a measure phase): a statement is
-- changed only when a second model family confirms it, every original is backed up first, and 'measure' or 'off' stops public
-- changes without a deploy (decision_log row below).

CREATE TABLE IF NOT EXISTS paper_claim_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version TEXT,
  body_sha TEXT,
  rules TEXT NOT NULL,
  mode TEXT NOT NULL,
  verdict TEXT NOT NULL,
  candidates INTEGER DEFAULT 0,
  confirmed INTEGER DEFAULT 0,
  version_to TEXT,
  hits_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_paper_claim_audits_slug ON paper_claim_audits (slug, version);
CREATE INDEX IF NOT EXISTS idx_paper_claim_audits_rules ON paper_claim_audits (rules, verdict);

CREATE TABLE IF NOT EXISTS paper_integrity_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version TEXT,
  status TEXT,
  title TEXT,
  abstract TEXT,
  body_md TEXT,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_paper_integrity_backups_slug ON paper_integrity_backups (slug);

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('claim_integrity_mode', 'enforce', 'CLAIM-INTEGRITY-1 (qnfo-research-exec 0.22.0): enforce = gate + correct/retract published papers; measure = gate + audit only, no public change; off = neither.'),
 ('claim_integrity_batch', '6', 'CLAIM-INTEGRITY-1: published papers audited per 10-minute tick (1..12), three at a time.');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES
 ('papers_fabricated_claims_open', 'outcome', 'lagging', 'published papers whose latest paper_claim_audits row (rules claim-integrity-1) is verdict flagged: a confirmed fabricated empirical claim that is still public', 'qnfo-audit.paper_claim_audits', 'unmeasured before 2026-10-19', '0', 'qnfo-research-exec', 'analytics_metric_triggers papers_fabricated_claims_open -> agent_issues', '10m', '> 0', '> 10', 'PENDING', 'computed'),
 ('papers_claim_unaudited', 'operational', 'lagging', 'published papers whose current version has no paper_claim_audits row under rules claim-integrity-1 (the sweep backlog), written by claimIntegritySweep each tick', 'qnfo-audit.paper_claim_audits + living-paper.papers', '661 at 2026-10-19 12:20Z', '0', 'qnfo-research-exec', 'analytics_metric_triggers papers_claim_unaudited -> agent_issues', '10m', '> 36', '> 120', 'PENDING', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
 ('papers_fabricated_claims_open', 'Published papers still carry confirmed fabricated empirical claims', 'registry', 'gt', 0, 1,
 'Pillar research (CLAIM-INTEGRITY-1). A published paper''s latest audit is verdict flagged: SELECT slug, version, hits_json FROM paper_claim_audits WHERE verdict = ''flagged'' ORDER BY id DESC. Flagged means the audit ran in measure mode. Read the quoted statements; when they are fabricated, set ops_config claim_integrity_mode = ''enforce'' and the next sweep corrects or retracts them (the flagged rows are audited again under enforce). When a statement is a false positive, narrow CI_PATTERNS or the confirmation prompt in qnfo-research-exec/worker.js with a claim-integrity.test.mjs case. Done: papers_fabricated_claims_open = 0 at two refreshes.',
 'qnfo-research-exec', 'agent_issues', 1, 1, 'CLAIM-INTEGRITY-1 (migrations/2026-10-19-claim-integrity.sql)'),
 ('papers_claim_unaudited', 'Published papers wait more than 120 minutes for their claim-integrity audit', 'registry', 'gt', 36, 2,
 'Pillar research (CLAIM-INTEGRITY-1, SLA-120M-1). claimIntegritySweep audits claim_integrity_batch papers per 10-minute tick, so 36 papers is 120 minutes of backlog at the default 6. Read the latest claim-integrity events in cloud_ops_events (job qnfo-research-exec, kind claim-integrity): unconfirmed or error verdicts = the confirming model or the extraction failed (AI-RATE-FALLBACK-1 territory); no events = the tick is not running the sweep (RESEARCH_HALT, mode off). Raise ops_config claim_integrity_batch (max 12) when the backlog is only throughput. Done: papers_claim_unaudited <= 36 at two refreshes.',
 'qnfo-research-exec', 'agent_issues', 2, 1, 'CLAIM-INTEGRITY-1 (migrations/2026-10-19-claim-integrity.sql)');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('claim-integrity-gate', 'qnfo-research-exec/worker.js claimGate (stageVerify), publishV2 claim gate, claimIntegritySweep', 'gate',
 'a paper that states experiments, measurements, surveys, human or expert reviews, pilots, pre-registrations, ethics approvals or data deposits that never happened, published or revised under the owner''s name',
 1, 'keep', 'applied',
 'a held paper is not dropped: it returns to revise with the quoted statements as a HARD fix and is published once they read as proposals or assumptions; a published paper is corrected as a new version, and only retracted when 5 or more statements are confirmed or a correction cannot clear them; every change is backed up in paper_integrity_backups and ops_config claim_integrity_mode = off removes the gate without a deploy',
 NULL,
 'CLAIM-INTEGRITY-1 2026-10-19: live paper evaluating-the-productivity-gains-of-a-five-phase-human-llm-orchestration-protoc (published 11:31Z) states pre-registration, an open data deposit and pilot measurements; qnfo-research-exec/claim-integrity.test.mjs holds those sentences and the honest proposal, cited and negated forms that must pass.',
 NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius) VALUES
 ('paper-fabricated-empirical-claim', 'a published AI-generated paper states empirical work as done that never happened (experiment, pilot measurements, blind expert review, pre-registration, data deposit)', 'the required section list asks every paper for a Methods section and a next experiment, the writers filled Methods with a study design in the present or past tense, and no prompt rule, review dimension or gate named fabricated empirical acts', 'qnfo-research-exec 0.22.0: EMPIRICAL_ACT_RULE in the writer, reconcile and revise prompts, review dimension 10, claimGate before publication and in publishV2, and claimIntegritySweep correcting or retracting published papers', 'remediation_contracts fm-paper-fabricated-empirical-claim (d1-query, hourly)', 'fm-paper-fabricated-empirical-claim', '2026-10-19', 'a draft whose Methods section describes a study', 'readers and the corpus grounding of later papers take invented data and reviews as real', 'every published paper, the papers.qnfo.org library, the corpus that grounds new papers, dissemination posts');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-paper-fabricated-empirical-claim', NULL, 'a published paper whose latest claim audit is flagged, or a sweep that has not run for 30 minutes', 'qnfo-research-exec claimIntegritySweep corrects or retracts it on its next tick under claim_integrity_mode enforce', 'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT MAX(created_at) FROM paper_claim_audits WHERE rules = ''claim-integrity-1''), '''') < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'') THEN ''sweep-stale'' WHEN (SELECT COUNT(*) FROM paper_claim_audits a JOIN (SELECT slug, MAX(id) AS id FROM paper_claim_audits WHERE rules = ''claim-integrity-1'' GROUP BY slug) l ON l.id = a.id WHERE a.verdict = ''flagged'') > 0 THEN ''flagged-open'' ELSE ''ok'' END AS observed', 'd1-query', 3, 'qnfo-research-exec', 1, 'active', 'failure-mode');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('post-publication-claim-correction', 'migrations/2026-10-19-claim-integrity.sql (CLAIM-INTEGRITY-1, qnfo-research-exec 0.22.0, qnfo-gateway 3.28.0)', 'qnfo-research-exec 10-minute cron, Workers AI gpt-oss-120b (extraction, rewrite) and glm-5.3-flash (confirmation), living-paper papers, MIRROR R2, GITHUB_TOKEN for the deposited copy',
 'measured every 10 minutes: papers_claim_unaudited, papers_fabricated_claims_open; hourly detector fm-paper-fabricated-empirical-claim',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'every published paper is audited for fabricated empirical claims at each version; confirmed statements are rewritten with a Correction Notice or the paper is retracted with its address kept (GET https://qnfo-research-exec.q08.workers.dev/claim-integrity)');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
VALUES ('session CLAIM-INTEGRITY-1', 'The pipeline performs no empirical act, so any sentence stating one as done is false; two model families plus a deterministic scan separate such statements from proposals and cited work well enough to correct automatically, and 5 or more confirmed statements mean the findings rest on them',
 'Gate fabricated empirical claims before publication and in revisions; audit all published papers newest first; correct (new version with a Correction Notice) or retract (status retracted, notice served at the same address); enforce from the first tick (two-family confirmation, backup before every change)',
 'owner directive 2026-10-19; live paper evaluating-the-productivity-gains-... states pre-registration, an open data deposit and pilot measurements; 55 published papers carry an experimental design or setup',
 'pending', 'public papers on papers.qnfo.org (bodies, versions, status), the research corpus, dissemination queue rows of retracted papers',
 'ops_config claim_integrity_mode = off stops new changes; restore a paper from paper_integrity_backups (title, abstract, body_md, version, status); revert the PR for the code',
 'post-publication-claim-correction', 'papers_fabricated_claims_open reaches 0 within 120 minutes of enforce and stays 0; no new paper publishes with a fabricated empirical claim (claim-gate events)', 'trust in the library: no reader meets an invented experiment or review', 'prompt rules, review dimension, deterministic scan, two-family model audit, publishV2 gate, post-publication sweep');
