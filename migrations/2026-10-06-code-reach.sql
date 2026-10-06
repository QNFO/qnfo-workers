-- CODE-REACH-1 (2026-10-06, pillars research and reach; docs/CODE-REACH-PROGRAM.md). Owner directive 2026-10-06: reach
-- more people with working, tested, practical code libraries (paper companions and standalone), across AI, systems and
-- mathematics (formal verification), not only quantum. Measured 2026-10-06 in qnfo-audit: 0 of 575 Zenodo records has a
-- code companion; the 35 graded public QNFO repositories hold 3 stars in total (portfolio_repos), none is installable
-- (no PyPI or npm package); AI and epistemics papers average 232 downloads and 83 views each against 151 and 45 for
-- quantum (zenodo_stats, title keyword split). Three libraries are staged and tested in research-code/ (CI:
-- .github/workflows/research-code.yml): agentic-collapse (companion to 10.5281/zenodo.18133065), ignorance-audit
-- (10.5281/zenodo.21901984 and 10.5281/zenodo.22026592) and ultrametric-lean (Lean 4 proofs for 10.5281/zenodo.22073477).
-- The session that built them could not create repositories in the organisation (GitHub: 403 Resource not accessible by
-- integration), so creating the three public repositories is an owner card; everything else is measured here.
--   research_code_libraries        register: one row per library (kind, field, companion DOI, staged path, repository)
--   research_code_public           libraries whose repository is public in portfolio_repos (target >= 3; trigger)
--   research_code_stars_total      stars on those repositories (trend; exemption below)
-- Both are refreshed by a new step on the hourly fleet_tasks metric-refresh task (no new cron, worker or model call).
-- Exemption (METRIC-CLOSED-LOOP-1): research_code_stars_total has no trigger until 30 days after the first library is
-- public; a star threshold set before there is any baseline would be a guess.
-- Idempotent: CREATE IF NOT EXISTS, INSERT OR IGNORE, guarded UPDATE and INSERT ... WHERE NOT EXISTS.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS research_code_libraries; DELETE FROM remediation_contracts WHERE class = 'agentic-collapse-repro-1'; DELETE FROM internal_errata WHERE id = 'repro-18133065-v1-trajectory' AND status = 'open'; DELETE FROM errata_queue WHERE subject = 'repro-18133065-v1-trajectory' AND status = 'internal-open'; DELETE FROM metric_registry WHERE metric IN ('research_code_public', 'research_code_stars_total'); DELETE FROM analytics_metric_triggers WHERE metric_key = 'research_code_public'; DELETE FROM human_actions WHERE slug IN ('code-repos-create', 'code-release-pypi-zenodo', 'ula-v2-1-post') AND status = 'open'; UPDATE fleet_tasks SET definition = json_remove(definition, '$.steps[' || (json_array_length(definition, '$.steps') - 1) || ']') WHERE id = 'metric-refresh' AND instr(json_extract(definition, '$.steps[' || (json_array_length(definition, '$.steps') - 1) || '].sql'), 'research_code_public') > 0;

CREATE TABLE IF NOT EXISTS research_code_libraries (
  name TEXT PRIMARY KEY,
  kind TEXT NOT NULL,            -- companion | standalone | formalization
  field TEXT NOT NULL,           -- ai | math | systems | quantum | metascience
  pillar TEXT NOT NULL,
  companion_doi TEXT,
  staged_path TEXT NOT NULL,
  repo TEXT,
  language TEXT,
  tests TEXT,
  status TEXT NOT NULL DEFAULT 'staged',   -- staged | public | archived
  note TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

INSERT OR IGNORE INTO research_code_libraries (name, kind, field, pillar, companion_doi, staged_path, repo, language, tests, status, note) VALUES
 ('agentic-collapse', 'companion', 'ai', 'research', '10.5281/zenodo.18133065', 'research-code/agentic-collapse', 'QNFO/agentic-collapse', 'Python', '16 unittest', 'staged',
  'Reference implementation. Findings: the v1 trajectory is off the phi nullcline of the stated equations (drift -0.28 at t=10); under the assumed beta, lam, kappa, mu a longer lag lowers collapse probability at alpha=0.6.'),
 ('ignorance-audit', 'companion', 'metascience', 'research', '10.5281/zenodo.21901984', 'research-code/ignorance-audit', 'QNFO/ignorance-audit', 'Python', '20 unittest', 'staged',
  'The fifteen questions verbatim (v0.3), protocol checks, model-agnostic administration, CHECK 2028 scorer.'),
 ('ultrametric-lean', 'formalization', 'math', 'research', '10.5281/zenodo.22073477', 'research-code/ultrametric-lean', 'QNFO/ultrametric-lean', 'Lean 4', 'lake build + no sorryAx', 'staged',
  'Isosceles, any-centre, nested-or-disjoint balls, confinement, unique decoding at separation r+1 (tight). Textbook facts, machine-checked; no Mathlib.');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('research_code_public', 'fleet', 'leading', 'count(research_code_libraries JOIN portfolio_repos ON name WHERE visibility = public AND archived = 0 AND seen = 1): staged research libraries that are public QNFO repositories (CODE-REACH-1)', 'qnfo-audit.research_code_libraries + portfolio_repos (PORTFOLIO-LOOP-1, daily)', '0 (2026-10-06: 3 staged, 0 public)', '>= 3', 'qnfo-fleet-control', 'CODE-REACH-1 trigger -> agent_issues; owner card code-repos-create', 'hourly', '< 3', '< 1', 'UNMEASURED', 'computed'),
 ('research_code_stars_total', 'fleet', 'lagging', 'sum(portfolio_repos.stars) over research_code_libraries names that are public (CODE-REACH-1)', 'qnfo-audit.research_code_libraries + portfolio_repos', '0 (2026-10-06)', 'maximize; threshold set 30 days after the first library is public', 'qnfo-fleet-control', 'report (exemption: no baseline yet)', 'hourly', NULL, NULL, 'UNMEASURED', 'computed');

UPDATE fleet_tasks SET definition = json_insert(definition, '$.steps[#]', json('{"type": "sql", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CASE metric WHEN ''research_code_public'' THEN CAST((SELECT COUNT(*) FROM research_code_libraries l JOIN portfolio_repos p ON p.name = l.name WHERE p.visibility = ''public'' AND p.archived = 0 AND p.seen = 1) AS TEXT) WHEN ''research_code_stars_total'' THEN CAST((SELECT COALESCE(SUM(p.stars), 0) FROM research_code_libraries l JOIN portfolio_repos p ON p.name = l.name WHERE p.visibility = ''public'' AND p.seen = 1) AS TEXT) ELSE last_value END, last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric IN (''research_code_public'', ''research_code_stars_total''); UPDATE human_actions SET status = ''resolved'', resolved_at = datetime(''now''), updated_at = datetime(''now''), resolution = ''CODE-REACH-1: research_code_public = '' || (SELECT last_value FROM metric_registry WHERE metric = ''research_code_public'') || '' (portfolio_repos shows the libraries public)'' WHERE slug = ''code-repos-create'' AND status = ''open'' AND CAST((SELECT last_value FROM metric_registry WHERE metric = ''research_code_public'') AS INTEGER) >= 3"}')),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = 'metric-refresh' AND instr(definition, 'research_code_public') = 0;

WITH v(metric_key, title, operator, threshold, priority, action, owner) AS (VALUES
  ('research_code_public', 'Research gap: staged QNFO code libraries are not public', 'lt', 3, 6,
   'Pillars research and reach (CODE-REACH-1, docs/CODE-REACH-PROGRAM.md). Read research_code_libraries for rows whose repo is missing from portfolio_repos. The organisation repositories are created by the owner (card code-repos-create on fleet.qnfo.org: the build session got GitHub 403 on repository creation); once a repository exists, copy research-code/<name>/ into it unchanged (its own CI, CITATION.cff and .zenodo.json come with it) and set research_code_libraries.status = ''public''. The next portfolio sync measures it. Never publish a library whose research-code CI is red.', 'qnfo-fleet-control')
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT metric_key, title, 'metric_registry', operator, threshold, priority, action, owner, 'agent_issues', 168, 1, 'CODE-REACH-1 (2026-10-06)' FROM v;

INSERT OR IGNORE INTO human_actions (slug, title, why, default_in_effect, action, url, sev, due, status, source) VALUES
 ('code-repos-create',
  'Create three public QNFO repositories for the tested research libraries: agentic-collapse, ignorance-audit, ultrametric-lean',
  'The libraries are built and tested in qnfo-workers/research-code/ (companions to the Agentic Collapse, Ignorance Audit and Ultrametric Program papers), but the fleet''s GitHub integration may not create organisation repositories (403). Public, installable, cited code is the reach lever papers alone do not have (docs/CODE-REACH-PROGRAM.md).',
  'The libraries stay staged inside qnfo-workers, tested on every change but not discoverable as their own projects; research_code_public stays 0.',
  'On github.com/organizations/QNFO/repositories/new create agentic-collapse, ignorance-audit and ultrametric-lean (public, empty). Then copy each research-code/<name>/ folder into its repository as the first commit (each folder carries its own CI, licence, CITATION.cff and .zenodo.json).',
  'https://github.com/QNFO/qnfo-workers/tree/main/research-code', 'normal', NULL, 'open', 'owner-only:CODE-REACH-1'),
 ('code-release-pypi-zenodo',
  'Turn on Zenodo software DOIs and PyPI publishing for the QNFO code libraries (one-time)',
  'A GitHub release becomes a citable software DOI only when the repository is switched on in your Zenodo account''s GitHub settings, and a pip-installable package needs a PyPI project tied to your account. Both are account-level and cannot be done by API from the fleet.',
  'Libraries are installable from source (pip install from the repository) and cited through the paper DOI only.',
  'Zenodo: Account, GitHub, switch on the three repositories. PyPI: add a trusted publisher for each repository (owner QNFO, workflow release.yml). Each library already carries .zenodo.json and CITATION.cff.',
  'https://zenodo.org/account/settings/github/', 'normal', NULL, 'open', 'owner-only:CODE-REACH-1'),
 ('ula-v2-1-post',
  'Post QNFO-ULA v2.1 (Software Terms) on QNFO/license',
  'Creative Commons licences are not written for software. Version 2.1 keeps every core term (any use that generates money needs a separate agreement; share-alike; attribution; prior-art citation; Swiss law) and adds Section 12, Software Terms: a non-commercial patent licence, source availability, contribution terms. The fleet cannot write to QNFO/license, and posting is the act that makes a version effective (Section 10.3).',
  'Version 2.0 stays in force; QNFO code keeps CC BY-NC-SA 4.0 as its base licence; legal.qnfo.org keeps serving v2.0.',
  'Review docs/license/README.md in qnfo-workers (four choices are yours: the funding carve-outs, the patent licence, file-level share-alike, the one-time cure), then copy docs/license/for-QNFO-license/ to the root of QNFO/license. legal.qnfo.org serves v2.1 within the hour and keeps v2.0 at /v2.0. A review by a Swiss-qualified lawyer before posting is prudent.',
  'https://github.com/QNFO/qnfo-workers/tree/main/docs/license', 'normal', NULL, 'open', 'owner-only:CODE-REACH-1');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'AGENTIC-COLLAPSE-REPRO-1: the v1 paper''s reported trajectory does not follow from its stated equations; four parameters are unstated',
  'Pillar research (CODE-REACH-1). Measured 2026-10-06 with research-code/agentic-collapse (tests/test_paper_consistency.py): the phi equation uses only alpha = 0.85 and gamma = 0.65, both stated, and at the reported t = 10 state (phi 0.7812, psi 0.1241) its drift is -0.28 per time unit (4.7 noise sd per unit time); the stable phi for that psi is 0.447. The 4.3 plateau and the terminal state also sit above the nullcline with negative drift. beta, lambda, kappa and mu are not stated, so section 4 cannot be reproduced; under the library''s assumed values a longer lag LOWERS collapse probability at alpha = 0.6 (0.97 at tau 0, 0.44 at tau 6). Next action: a v2 of 10.5281/zenodo.18133065 through the errata path that states all parameters, regenerates section 4 with the library (agentic-collapse run --seed N), cites the software, and says which conclusions hold. The paper is the corpus''s most downloaded record (3,251), so an uncorrected version is the largest credibility exposure in the corpus. Done when the new version is live and agentic-collapse check-paper passes against it.',
  'session:CODE-REACH-1', 'research', 'high', 'open', CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'AGENTIC-COLLAPSE-REPRO-1:%');

-- The Agentic Collapse finding enters the fleet's errata path as the reviser's findings do (REVISER-FLAGGED-DEADEND-1):
-- an internal_errata row plus an errata_queue row in status internal-open, which errata-hub never auto-answers or
-- auto-publishes. Unlike a single-model finding, this one is deterministic and pinned by a test
-- (research-code/agentic-collapse/tests/test_paper_consistency.py).
INSERT OR IGNORE INTO internal_errata (id, target_kind, target_ref, detected_at, detected_by, severity, claim_text, falsification, evidence, remediation, status, owner, updated_at)
VALUES ('repro-18133065-v1-trajectory', 'paper', '10.5281/zenodo.18133065', strftime('%Y-%m-%dT%H:%M:%SZ','now'), 'research-code/agentic-collapse 0.1.0', 'high',
  'Section 4 of AGENTIC COLLAPSE v1 reports states that the stated phi equation cannot produce: at t = 10 (phi 0.7812, psi 0.1241) the drift with the stated alpha = 0.85 and gamma = 0.65 is -0.28 per time unit and the stable phi is 0.447; the 4.3 plateau and the terminal state also have negative drift. beta, lambda, kappa and mu are not stated.',
  'The finding is false if the stated equations and parameters, integrated as section 3.1 describes, reproduce the section 4 states; agentic-collapse check-paper computes the drift directly from the paper''s own alpha and gamma.',
  '{"source":"research-code/agentic-collapse","test":"tests/test_paper_consistency.py","command":"agentic-collapse check-paper","deterministic":true}',
  'Publish a v2 that states every parameter, regenerates section 4 with the reference implementation (agentic-collapse run --seed N), cites the software, and says which conclusions hold; the lag claim is not reproduced under the assumed parameters (collapse probability 0.97 at tau 0, 0.44 at tau 6, alpha 0.6).',
  'open', 'errata-hub', strftime('%Y-%m-%dT%H:%M:%SZ','now'));
INSERT INTO errata_queue (email_id, source, sender, subject, paper_doi, claim, confidence, status)
SELECT NULL, 'internal_audit', 'research-code/agentic-collapse', 'repro-18133065-v1-trajectory', '10.5281/zenodo.18133065',
  'v1 section 4 trajectory is inconsistent with the stated phi equation (drift -0.28 at the t = 10 state); four parameters unstated', 1.0, 'internal-open'
WHERE NOT EXISTS (SELECT 1 FROM errata_queue WHERE subject = 'repro-18133065-v1-trajectory');

-- Closing probe for AGENTIC-COLLAPSE-REPRO-1: a second Zenodo version of the record's concept exists (zenodo_stats is
-- refreshed weekly by qnfo-cloud-ops zenodo-stats); the hourly remediation tick closes the issue on a 7-day pass streak.
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status)
SELECT 'agentic-collapse-repro-1', (SELECT id FROM agent_issues WHERE title LIKE 'AGENTIC-COLLAPSE-REPRO-1:%' ORDER BY id LIMIT 1),
  'zenodo_stats holds one version of concept ' || COALESCE((SELECT conceptdoi FROM zenodo_stats WHERE doi = '10.5281/zenodo.18133065'), '?') || ' (2026-10-06)',
  'errata path: internal_errata repro-18133065-v1-trajectory -> v2 with stated parameters and the reference implementation',
  'SELECT ''2'' AS expected, CASE WHEN (SELECT COUNT(*) FROM zenodo_stats WHERE conceptdoi = (SELECT conceptdoi FROM zenodo_stats WHERE doi = ''10.5281/zenodo.18133065'')) >= 2 THEN ''2'' ELSE ''pending: one version'' END AS observed',
  'd1-query', 60, 'errata-hub', 168, 'active'
WHERE (SELECT id FROM agent_issues WHERE title LIKE 'AGENTIC-COLLAPSE-REPRO-1:%') IS NOT NULL;
