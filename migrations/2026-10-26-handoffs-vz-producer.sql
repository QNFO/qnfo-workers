-- HANDOFFS-VZ-PRODUCER-1 (2026-10-26, pillar autonomy; agent_issues 1000176, GitHub issue mirror of the same id)
--
-- WHAT WAS MEASURED (2026-10-26, qnfo-audit SELECT only, repository read at 8e4cdfa)
--   qnfo-audit.handoffs holds 1,706 rows (ids 1..30034, newest 2026-10-26T07:00Z). The handoffs vector index is queried by qnfo-ai, qnfo-archive,
--   qnfo-ops and qnfo-infra /retrieve, and returned only rows from 2026-07. PR 4230 (a code-loop merge titled for an unrelated 502 issue) added a
--   producer to the 06:30 indexer member in qnfo-infra/worker.js that ran SELECT id, content FROM handoffs. The table has no content column
--   (id, session_id, project_id, phase_completed, summary, pending_work, next_action, r2_handoff_path, timestamp, wbs_code, dod_verdict, claim_sheet),
--   so the query threw into a catch that logged and went on. The issue's birth contract was a circular status probe, superseded at birth, so the issue
--   had no check that could ever fail or pass on the real defect.
--
-- WHAT THIS FILE DOES (the code change is qnfo-infra 1.9.0: indexHandoffs() on every hourly fire, 100 handoffs per run, ids handoff:<id>:<chunk>)
--   1. seeds ops_config handoffs_vz_last_id = 0, the watermark the producer moves only after its upserts succeeded (INSERT OR IGNORE: a value written by
--      the worker before this file applies is kept)
--   2. replaces the circular contract of issue 1000176 with a probe on its definition of done: no handoff older than 90 minutes sits above the watermark
--      (the backfill of about 18 hourly runs keeps it red until it is done, then the hourly remediation tick closes the issue with that reading)
--   3. registers failure mode handoffs-vz-stalled with detector fm-handoffs-vz-stalled: the watermark row is missing, or its value has not moved for 3 hours
--      while a handoff older than 3 hours sits above it (a healthy backfill moves it every hour, so it stays green while draining; a quiet night followed by
--      one new handoff stays green, because that handoff is young. An independent review replayed the first version of this detector, which read only the row's
--      updated_at, and it went red for ten such windows in 14 days of live data)
--   4. records the decision and the capability
-- Personal/research separation (the review's first major): the indexer skips a handoff whose project, WBS or session label is of the personal plane (51 of 1,706 rows
-- on 2026-10-26, and a trickle of email-strategic-<id> rows that name sender addresses), because scope=research retrieval reads this index and a vector cannot be
-- filtered out later (the index has no metadata index). The deny-list is in qnfo-infra/worker.js (handoffIsPersonalPlane) and the decision row below.
-- No trigger, no cron, no table other than the backup of the old contract row.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET precondition = (SELECT b.precondition FROM bak_20261026_rc_issue_1000176 b), action = (SELECT b.action FROM bak_20261026_rc_issue_1000176 b), verify_probe = (SELECT b.verify_probe FROM bak_20261026_rc_issue_1000176 b), verify_transport = (SELECT b.verify_transport FROM bak_20261026_rc_issue_1000176 b), status = (SELECT b.status FROM bak_20261026_rc_issue_1000176 b), last_verdict = (SELECT b.last_verdict FROM bak_20261026_rc_issue_1000176 b), module = (SELECT b.module FROM bak_20261026_rc_issue_1000176 b) WHERE class = 'issue-1000176' AND EXISTS (SELECT 1 FROM bak_20261026_rc_issue_1000176); UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback HANDOFFS-VZ-PRODUCER-1' WHERE class = 'fm-handoffs-vz-stalled'; UPDATE failure_modes SET detector = 'rolled back 2026-10-26 (HANDOFFS-VZ-PRODUCER-1)' WHERE fm_key = 'handoffs-vz-stalled'; UPDATE capability_ledger SET reliability = 'retired by rollback' WHERE capability = 'handoffs-vector-index-hourly-producer'

CREATE TABLE IF NOT EXISTS bak_20261026_rc_issue_1000176 AS SELECT class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, last_verdict, module FROM remediation_contracts WHERE class = 'issue-1000176';

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES
 ('handoffs_vz_last_id', '0', 'HANDOFFS-VZ-PRODUCER-1: id of the last qnfo-audit.handoffs row embedded into the handoffs vector index. qnfo-infra 1.9.0 indexHandoffs() moves it after each hourly run (100 rows per run) and writes the behind count into this note. Seeded 0 by migration 2026-10-26-handoffs-vz-producer.sql.', datetime('now'));

UPDATE remediation_contracts
SET precondition = 'HANDOFFS-VZ-PRODUCER-1: qnfo-infra 1.9.0 indexHandoffs() indexes qnfo-audit.handoffs hourly',
    action = 'probe',
    verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM handoffs h WHERE h.id > COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''handoffs_vz_last_id''), 0) AND replace(substr(h.timestamp, 1, 19), ''T'', '' '') < datetime(''now'', ''-90 minutes'')) AS TEXT) AS observed',
    verify_transport = 'd1-query',
    status = 'active',
    last_verdict = NULL,
    module = 'handoffs-vz-producer-1'
WHERE class = 'issue-1000176' AND status = 'superseded' AND verify_probe LIKE '%CASE WHEN status IN (''closed'', ''resolved'')%';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('handoffs-vz-stalled',
  'the handoffs vector index stops receiving new handoffs, so semantic handoff search returns a frozen snapshot with no sign that it is frozen',
  'the producer sat inside the 06:30 indexer member behind a catch that only logged, and it selected a column the table does not have (handoffs.content), so it failed every night and nothing measured whether any handoff reached the index',
  'HANDOFFS-VZ-PRODUCER-1: qnfo-infra indexHandoffs() runs on every hourly fire from the ops_config watermark handoffs_vz_last_id, which moves only after the upsert succeeded, and fm-handoffs-vz-stalled reads a watermark that is missing or has not moved for 3 hours while a handoff older than 3 hours sits above it',
  'the watermark row exists and, when a handoff older than 3 hours sits above it, was updated within 3 hours', 'fm-handoffs-vz-stalled', '2026-10-26', 1000176,
  'the embedding model, the vectorize binding or the handoffs schema changes and indexHandoffs() throws on every fire',
  'vectorize_query on the handoffs index returns only old rows, ops_config handoffs_vz_last_id stays put while new handoffs arrive',
  'qnfo-ai, qnfo-archive /handoff/search, qnfo-ops vectorize_query and qnfo-infra /retrieve scope research, and any agent using handoff search to avoid repeating work');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-handoffs-vz-stalled', NULL, 'HANDOFFS-VZ-PRODUCER-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ops_config c WHERE c.key = ''handoffs_vz_last_id'' AND replace(substr(c.updated_at, 1, 19), ''T'', '' '') < datetime(''now'', ''-3 hours'') AND EXISTS (SELECT 1 FROM handoffs h WHERE h.id > CAST(c.value AS INTEGER) AND replace(substr(h.timestamp, 1, 19), ''T'', '' '') < datetime(''now'', ''-3 hours''))) + (SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END FROM ops_config WHERE key = ''handoffs_vz_last_id'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('handoffs-vector-index-hourly-producer',
  'qnfo-infra 1.9.0 indexHandoffs() HANDOFFS-VZ-PRODUCER-1 (agent_issues 1000176)',
  'qnfo-audit.handoffs, ops_config handoffs_vz_last_id, the HANDOFFS_VZ vectorize binding and the AI binding on qnfo-infra; hourly fire of the 0 * * * * grid',
  'unproven until the watermark moves in production: the offline suite replays the live columns, the first backfill (about 18 hourly runs) is the proof',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'personal-plane handoffs are skipped by label (51 of 1,706 on 2026-10-26); the fallback path is the same resumable watermark (UPDATE ops_config SET value = 0 re-indexes from the start, upserts are idempotent), not a second script');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-code-session_015kWmGuAq2fNuvzu4MrD7x3',
  'a fix that was merged but never measured is still an open defect: the handoff producer from PR 4230 cannot have worked because it reads a column the table lacks, and the issue that asked for it had only a circular probe; the index is read by scope=research retrieval, so the personal plane stays out of it (charter rule 10)',
  'HANDOFFS-VZ-PRODUCER-1: qnfo-infra 1.9.0 replaces the broken 06:30 block with an hourly indexHandoffs() (real columns, deterministic ids, watermark moved after the upsert, 100 rows per run), it skips handoffs labelled for the personal plane (project personal, q08, twin, msgraph, owner-; WBS personal, q08; session email-strategic-) and moves the watermark past them; this file seeds the watermark, gives issue 1000176 a probe on its definition of done and registers the stall detector',
  'handoffs columns read from pragma_table_info on 2026-10-26 (no content column), 1,706 rows, ids 1..30034, the old block at qnfo-infra/worker.js line 860 at 8e4cdfa, offline suite qnfo-infra/handoffs-index.test.mjs (replays the live columns in node:sqlite; twelve mutations of the worker are each caught), the four existing qnfo-infra suites unchanged; an independent review replayed the detector, the personal-plane counts (47 by project label, 51 with the WBS and session labels) and the platform limits (75 subrequests worst case of 10,000)',
  'migration merged, qnfo-infra 1.9.0 deployed through the canonical path',
  'one extra hourly step in qnfo-infra (about 7 Workers AI embedding calls and 2-3 vectorize upserts per 100-handoff run while draining, 8 and 3 for the worst live window, then none), one ops_config row, one capability row, one backup table of a single contract row',
  'qnfo-infra deploy revert restores the old block, the Rollback header restores the contract row and retires the detector, UPDATE ops_config SET value = 0 re-indexes from the start (upserts are idempotent)',
  'new handoffs reach semantic search within the hour',
  'ops_config handoffs_vz_last_id is above 0 within 2 hours of the deploy and no handoff older than 90 minutes sits above it within 24 hours',
  'handoff continuity search (qnfo-ai, qnfo-archive, qnfo-ops, qnfo-infra /retrieve) sees the 1,706 handoffs instead of a July snapshot',
  'd1:qnfo-audit handoffs, ops_config, remediation_contracts, agent_issues, decision_log (SELECT only), repository read of qnfo-infra/worker.js, qnfo-ai/worker.js (query model), qnfo-infra/wrangler.toml (binding), offline node:sqlite suite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'HANDOFFS-VZ-PRODUCER-1:') = 1);
