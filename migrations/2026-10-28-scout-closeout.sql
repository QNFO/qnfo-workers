-- SCOUT-CLOSEOUT-1 (2026-10-28, charter pillars autonomy, research, core; OWNER-NO-LOOSE-ENDS-1, SESSION-RECORD-1): the build items the scouting session's producers could not measure, each with a doer and a closing probe, plus the session record.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'RM-POSTMORTEM-LEDGER-1:%' OR title LIKE 'RM-CLAIMS-LEDGER-1:%' OR title LIKE 'RM-SEEDED-CLAIM-HARNESS-1:%' OR title LIKE 'RM-D1-RESTORE-DRILL-1:%'; UPDATE roadmap_implementation SET status = 'retired' WHERE source = 'scout-2026-10-closeout'; DELETE FROM session_records WHERE session_id = 'session-scout-1028';

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-POSTMORTEM-LEDGER-1', 'scout-2026-10-closeout', 'Build the incident and postmortem ledger so postmortem_coverage can be measured', 'worker', 'qnfo-fleet-control', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md; scripts/bp26_*.py stubs' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-POSTMORTEM-LEDGER-1' AND source = 'scout-2026-10-closeout');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-POSTMORTEM-LEDGER-1: Build the incident and postmortem ledger so postmortem_coverage can be measured',
 'Charter pillar: autonomy. Doer: qnfo-fleet-control via qnfo-code-orchestrator. No incident or postmortem table exists (scripts/bp26_postmortem.py returns unknown and names this). Lever: an incidents table written when a CONTROL-PLANE-REVERTED or deploy-failure issue opens, a postmortems table written within 72 hours, and a view; then switch scripts/bp26_postmortem.py to read it. Closing probe: metric postmortem_coverage has a non-empty last_value in metric_registry.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-POSTMORTEM-LEDGER-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-CLAIMS-LEDGER-1', 'scout-2026-10-closeout', 'Build an atomic-claims ledger for published papers so claim_coverage can be measured', 'worker', 'qnfo-research-exec', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md; scripts/bp26_*.py stubs' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-CLAIMS-LEDGER-1' AND source = 'scout-2026-10-closeout');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-CLAIMS-LEDGER-1: Build an atomic-claims ledger for published papers so claim_coverage can be measured',
 'Charter pillar: research. Doer: qnfo-research-exec via qnfo-code-orchestrator. No atomic-claims ledger exists (scripts/bp26_claims.py returns unknown). Lever: extract and store each factual claim of a published paper with its source and verification state, then point the collector at it. Closing probe: metric claim_coverage has a non-empty last_value.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-CLAIMS-LEDGER-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-SEEDED-CLAIM-HARNESS-1', 'scout-2026-10-closeout', 'Build the seeded-false-claim harness so seeded_false_claim_catch_rate can be measured', 'worker', 'qnfo-research-exec', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md; scripts/bp26_*.py stubs' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-SEEDED-CLAIM-HARNESS-1' AND source = 'scout-2026-10-closeout');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-SEEDED-CLAIM-HARNESS-1: Build the seeded-false-claim harness so seeded_false_claim_catch_rate can be measured',
 'Charter pillar: research. Doer: qnfo-research-exec via qnfo-code-orchestrator. No harness exists (scripts/bp26_seeded.py returns unknown). Lever: seed known-false claims into review inputs on a schedule, record whether the review gates caught each, store results in a table the collector reads. Closing probe: metric seeded_false_claim_catch_rate has a non-empty last_value.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-SEEDED-CLAIM-HARNESS-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-D1-RESTORE-DRILL-1', 'scout-2026-10-closeout', 'Run the D1 Time Travel restore drill into a scratch database and record it in d1_restore_drills', 'worker', 'qnfo-cloud-ops', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md; scripts/bp26_*.py stubs' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-D1-RESTORE-DRILL-1' AND source = 'scout-2026-10-closeout');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-D1-RESTORE-DRILL-1: Run the D1 Time Travel restore drill into a scratch database and record it in d1_restore_drills',
 'Charter pillar: autonomy. Doer: qnfo-cloud-ops via qnfo-code-orchestrator. BP26-D1-DISCIPLINE-1 (1000349): d1_restore_drill_age_days stays unknown until a drill passes. Lever: a quarterly step that restores qnfo-audit to a recent migration_runs.bookmark into a scratch D1, checks row counts of three tables, drops the scratch DB, and writes a pass or fail row to d1_restore_drills. Closing probe: metric d1_restore_drill_age_days has a numeric last_value at or below 90.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-D1-RESTORE-DRILL-1:%' AND status = 'open');

INSERT INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
)
SELECT 'session-scout-1028', 'QNFO.INFRA', 'claude-code', 'Asked: proactively scout GitHub and arXiv for the Cloudflare Qniverse roadmap, then research, document, program, implement and deploy all of it. Delivered: docs/SCOUT-ROADMAP-2026-10.md with two rounds (about 60 candidates, 9 read in full text, the rest abstract-level), 12 roadmap items filed, apply-time D1 Time Travel bookmark capture, 10 BP26 metric producers or stubs (compat_date, orphaned_leases, brier and forecast criteria, paper immutability proxy, oai_pmh, correction latency, eval suite age, source liveness, provenance stub, three stubs for missing sources), two PAPER-PIDS code tasks for qnfo-gateway, and a deterministic-gate audit (21 decision points, 4 MODEL-ONLY, PR 5083).', 'Producers are labelled proxies where the metric definition needs data that does not exist; no table was invented. Duplicate producers were dropped when main already measured the metric (pre_migration_bookmark_recorded, agent_pr_revert_rate). The gateway edits go through the code loop as code tasks, not hand edits. Merges of green PRs were left to the stale-PR lane.',
  'docs/SCOUT-ROADMAP-2026-10.md; docs/DETERMINISTIC-GATE-AUDIT.md; scripts/apply_migrations.py; scripts/bp26_compat.py, bp26_leases.py, bp26_forecast.py, bp26_paperver.py, bp26_oai.py, bp26_corrections.py, bp26_eval_suite_age_days.py, bp26_source_liveness.py, bp26_provenance_marking_coverage.py, bp26_postmortem.py, bp26_claims.py, bp26_seeded.py; migrations/2026-10-28-*.sql',
  'PRs 5058 5059 5062 5063 5064 5068 5073 5074 5079 merged; 5083 open', 'migrations apply through apply-migrations.yml; no worker deployed by this session',
  'PR 5083 (gate audit and 4 GATE-AUDIT-1 issues) is open and merges through the lane. Unmeasured for lack of a source: postmortem_coverage, claim_coverage, seeded_false_claim_catch_rate (RM-POSTMORTEM-LEDGER-1, RM-CLAIMS-LEDGER-1, RM-SEEDED-CLAIM-HARNESS-1), provenance_marking_coverage (BP26-PROVENANCE-MARKING-1 1000335), d1_restore_drill_age_days (RM-D1-RESTORE-DRILL-1). The three top gate-audit findings are in qnfo-ops (cf_worker_deploy, github_file_write, ops_d1_write). Live values of the new producers were not read from D1. The work claim on file:docs/DETERMINISTIC-GATE-AUDIT.md was not released with a token and lapses by TTL. canonical-deploy failures at 12:31 and 12:33 UTC were another session''s research-exec parse error (fixed by 0.39.6), not this session.', 0.9, 10, 9, '2026-10-28T11:30:00Z', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE NOT EXISTS (SELECT 1 FROM session_records WHERE session_id = 'session-scout-1028');
