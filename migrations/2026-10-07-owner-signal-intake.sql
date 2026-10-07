-- OWNER-SIGNAL-INTAKE-1 (2026-10-07, pillar research, issues #1947 #2103 #2104; owner directive 2026-10-07: "I need an
-- integrated platform where all information is shared and leveraged across the fleet. No siloes!"). Ships with idea-hub
-- 1.7.0-owner-signal-intake. Evidence on 2026-10-07: of 28 papers published since 2026-09-30, 13 were arXiv-derived, 6
-- re-entries and none came from the owner's notes or ideas; notes_intake held 6,589 owner notes read only by the calendar
-- leg; owner proposals 688 and 788 sat at a model HOLD.
--   1. owner_corpus_seen: one row per notebook note the corpus feeder has read (idea-hub also creates it if absent).
--   2. signal_worker_boundary idea-hub/artifact_reentry_owner = 1: re-entry restarts, reading only the owner's own papers
--      (zenodo, slug, doi, internal). The arXiv-wide 'artifact_reentry' row stays 0 (OWNER-NARROW-SIGNAL-1), and pre-1.7.0
--      code never reads the new row, so a deploy lagging this file cannot resume the old scan.
--   3. metric owner_signal_share_30d (producer: idea-hub triage, hourly) with its trigger: below 0.30 is a breach.
--   4. closing probes for #2103 and #2104 (classes written at birth by ORPHAN-GUARD-BIRTH-1, hence UPDATE).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE signal_worker_boundary SET permitted = 0 WHERE worker = 'idea-hub' AND source = 'artifact_reentry_owner'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'owner_signal_share_30d'; DELETE FROM metric_registry WHERE metric = 'owner_signal_share_30d'; UPDATE remediation_contracts SET verify_probe = 'needs-machine-probe', status = 'needs-machine-probe' WHERE class IN ('issue-2103', 'issue-2104');

CREATE TABLE IF NOT EXISTS owner_corpus_seen (path TEXT PRIMARY KEY, sig TEXT, ts TEXT, outcome TEXT, proposal_id INTEGER, note TEXT);

INSERT OR REPLACE INTO signal_worker_boundary (worker, source, permitted, domain, note)
VALUES ('idea-hub', 'artifact_reentry_owner', 1, 'research', 'OWNER-SIGNAL-INTAKE-1 2026-10-07: re-entry from the owner''s own papers only (identifier_type zenodo/slug/doi/internal), idea-hub 1.7.0+. The arXiv-wide artifact_reentry row stays paused.');

INSERT OR REPLACE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, refresh_class, warning_band, kill_band, last_value, last_refreshed, state)
VALUES ('owner_signal_share_30d', 'system', 'lagging',
 'share of research_queue rows created in the last 30 days whose idea_proposals source is owner-authored (owner-*, rowan-*, chat-session, contact owner) or owner-corpus (notebook)',
 'qnfo-audit.research_queue join idea_proposals', '0.07 (2 of 30, 2026-10-07, both released by hand)', '>= 0.30', 'idea-hub', 'idea-hub', 'hourly', 'hourly', '0.15-0.30', '< 0.15', '0.07', datetime('now'), 'active');

INSERT OR REPLACE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('owner_signal_share_30d', 'OWNER-SIGNAL-SHARE: research is not driven by the owner''s own ideas', 'metric_registry', 'lt', 0.30, 2,
 'Pillar research. The owner''s notebook and own ideas must drive the pipeline (owner directive 2026-10-07). Lever: raise idea-hub OWNER_CORPUS_BATCH (notes read per hour) or lower OWNER_CORPUS_SCORE_MIN, after checking owner_corpus_seen outcomes (a high none share means the extraction prompt, not the batch, is the gap). Done = metric >= 0.30 for 7 days with idea_topic_concentration_30d not worse.
code-task: repo=qnfo-workers path=idea-hub/worker.js
code-anchor: var OWNER_CORPUS_BATCH = 2, OWNER_CORPUS_MIN_CHARS = 600, OWNER_CORPUS_EXCERPT = 7000, OWNER_CORPUS_RQ_CAP = 12;',
 'idea-hub', 'agent_issues', 168, 1, 'OWNER-SIGNAL-INTAKE-1, migrations/2026-10-07-owner-signal-intake.sql');

UPDATE remediation_contracts SET status = 'active', verify_transport = 'd1-query', escalate_to = 'idea-hub',
 action = 'idea-hub 1.7.0-owner-signal-intake (OWNER-SIGNAL-INTAKE-1): owner-direct rows ACCEPT regardless of the model verdict; ask-gap skips the chat-question filter.',
 verify_probe = 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_heartbeat WHERE worker = ''idea-hub'' AND version >= ''1.7.0'') AND NOT EXISTS (SELECT 1 FROM idea_proposals WHERE (name LIKE ''owner%'' OR name LIKE ''rowan%'' OR contact = ''owner'') AND name <> ''owner-corpus'' AND status = ''triaged_hold'' AND rationale <> ''noise/question filter'' AND replace(substr(triaged_at,1,19),''T'','' '') >= datetime(''now'',''-7 day'')) AND NOT EXISTS (SELECT 1 FROM idea_proposals WHERE name = ''ask-gap'' AND rationale = ''noise/question filter'' AND replace(substr(triaged_at,1,19),''T'','' '') >= datetime(''now'',''-1 day'')) THEN ''1'' ELSE ''0'' END AS observed'
WHERE class = 'issue-2103';

UPDATE remediation_contracts SET status = 'active', verify_transport = 'd1-query', escalate_to = 'idea-hub',
 action = 'idea-hub 1.7.0-owner-signal-intake (OWNER-SIGNAL-INTAKE-1): runOwnerCorpus distils notebook notes (notes_intake + R2 obsidian-vault) into owner-corpus proposals each hour.',
 verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM owner_corpus_seen) >= 10 AND EXISTS (SELECT 1 FROM research_queue q JOIN idea_proposals p ON q.source = ''proposal'' AND CAST(p.id AS TEXT) = q.source_id WHERE p.name = ''owner-corpus'') THEN ''1'' ELSE ''0'' END AS observed'
WHERE class = 'issue-2104';
