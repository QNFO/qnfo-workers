-- DOCTRINE-1 (2026-10-08, pillar autonomy). Owner directive 2026-10-08: "aggressively interrogate every hold, filter, pause
-- and kill switch in the fleet, assume none are necessary. No hold, filter, pause or kill switch shall ever be on critical
-- path and alternate workarounds shall always exist", with the Autonomous Operation Doctrine (docs/AUTONOMOUS-OPERATION-
-- DOCTRINE.md, verbatim). This file turns the doctrine's registers into D1 tables the fleet keeps current every tick:
--   control_registry  section 11: every hold, filter, pause, kill switch, gate and cap; disposition remove/demote/replace/keep;
--                     on a critical path or not; its alternate path and when that alternate last ran (tested, not documented).
--   spof_registry     section 10: single points of failure, their alternate path and when it last ran.
--   belief_registry   section 5: operative beliefs, each tied to a machine probe (remediation_contracts class belief-<key>)
--                     that qnfo-fleet-control's hourly tick evaluates; v_belief_status derives held / falsified / suspect
--                     (no verdict in 60 minutes) from remediation_verifications, so a belief is never taken on trust.
--   decision_log      section 12: append-only {assumption, action, evidence, outcome, blast radius, rollback path}.
--   v_doctrine_scorecard + metrics section 13 (controls and SPOFs on a critical path without a tested alternate, beliefs
--                     not verified this hour, backlog age p95 in minutes), refreshed on the 10-minute heartbeat.
-- Dispositions applied in this file: issue_refile_guard (it silently dropped a relapse filed within 24 h) is REPLACED by a
-- reopen of the closed issue; the plaintext ops_config command_drain_key (no reader in any worker; qnfo-email authenticates
-- with API_KEY / GATEWAY_EMAIL_KEY) is REMOVED by overwriting the value. Applied by the session before this file (data):
-- code_merge_trusted_sources REPLACED (first-party internal loops admitted, outside-text sources still excluded; backup row
-- code_merge_trusted_sources--bak-20261008T1440Z); research holds REMOVED (bak_20261008_hold_release).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261008_doctrine_triggers
-- (bak_20261008_doctrine_triggers is created by this file ahead of its first DROP: a copy of every trigger's SQL from sqlite_master, so each
-- dropped guard can be recreated from D1 itself. Re-applied 2026-10-08: the first run named control_registry, which the
-- runner requires to exist before the file starts, and refused the file with no statement run.)
-- Rollback: DROP TRIGGER IF EXISTS doctrine_tick_10m; DROP TRIGGER IF EXISTS decision_log_no_update; DROP TRIGGER IF EXISTS decision_log_no_delete; DROP TRIGGER IF EXISTS issue_refile_reopen; CREATE TRIGGER issue_refile_guard BEFORE INSERT ON agent_issues WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved','wontfix','closed') AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s','now') * 1000 - 86400000)) BEGIN SELECT RAISE(IGNORE); END; DROP VIEW IF EXISTS v_doctrine_scorecard; DROP VIEW IF EXISTS v_belief_status; DELETE FROM remediation_contracts WHERE class LIKE 'belief-%'; DELETE FROM metric_registry WHERE metric IN ('controls_on_critical_path_untested','spofs_on_critical_path','beliefs_unverified_60m','backlog_age_p95_min'); DELETE FROM analytics_metric_triggers WHERE metric_key IN ('controls_on_critical_path_untested','spofs_on_critical_path','beliefs_unverified_60m','backlog_age_p95_min'); -- the four registers are ledgers and stay.

CREATE TABLE IF NOT EXISTS control_registry (
  control TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')),
  guards_against TEXT,
  critical_path INTEGER NOT NULL DEFAULT 0,
  disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')),
  disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')),
  alternate_path TEXT,
  alternate_tested_at TEXT,
  evidence TEXT NOT NULL,
  issue_id INTEGER,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS spof_registry (
  component TEXT PRIMARY KEY,
  critical_path TEXT NOT NULL,
  alternate_path TEXT,
  alternate_tested_at TEXT,
  evidence TEXT NOT NULL,
  issue_id INTEGER,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS belief_registry (
  belief_key TEXT PRIMARY KEY,
  claim TEXT NOT NULL,
  confidence REAL,
  evidence TEXT NOT NULL,
  probe_class TEXT NOT NULL,
  built_on TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS decision_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL,
  assumption TEXT NOT NULL,
  action TEXT NOT NULL,
  evidence TEXT NOT NULL,
  outcome TEXT NOT NULL,
  blast_radius TEXT NOT NULL,
  rollback_path TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS decision_log_no_update BEFORE UPDATE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER IF NOT EXISTS decision_log_no_delete BEFORE DELETE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;

-- Controls interrogated on 2026-10-08 (inventory: every ops_config and pipeline_flags key, every worker read of one, every
-- D1 trigger that aborts or ignores a write, the code loop's deny lists). Validation guards that only reject malformed
-- rows (enum, cadence, timestamp, referential and evidence guards) are not on a critical path and are not listed.
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('research-owner-hold', 'research_queue.status owner_hold', 'hold', 'research on the pipeline''s own papers before owner-signal intake shipped', 1, 'remove', 'applied', 'none needed', NULL, '19 rows released 2026-10-08 (bak_20261008_hold_release); the intake it waited for shipped 2026-10-07', NULL),
 ('idea-triaged-hold-owner-and-reentry', 'idea_proposals.status triaged_hold (owner notebook bar, re-entry expiry)', 'filter', 'low-score owner ideas; self-referential re-entry loop', 1, 'replace', 'planned', 'owner ideas always accepted (#2173); re-entry becomes a 2/day rate (#2174)', NULL, '31 held ideas released 2026-10-08; removal outright would let every paper spawn papers about itself, so a rate replaces the hold', 2174),
 ('code-merge-trusted-sources', 'ops_config code_merge_trusted_sources (code loop intake + merge runner)', 'filter', 'outside text (email, public Ask queries, arXiv) steering a merged code change', 1, 'replace', 'applied', 'session PR through the stale-PR lane', '2026-10-08T10:00:58Z', 'trust by content provenance: first-party internal loops admitted 2026-10-08 (backup code_merge_trusted_sources--bak-20261008T1440Z); PR 800 merged by the lane', NULL),
 ('control-plane-deny', 'qnfo-code-orchestrator PLAN_DENY_WORKERS, qnfo-fleet-control CM_DENY', 'filter', 'the code loop breaking its own verifier or deploy path; gaming the scorer; breaking the AI router or public gateway (the canary checks VERSION only)', 1, 'replace', 'planned', 'session PRs merged by the lane with the CONTROL-PLANE canary and automatic revert', '2026-10-07', 'canary revert proven by CONTROL-PLANE-REVERTED-1 (#2138); a functional canary (one real request) would let the loop take qnfo-ai and qnfo-gateway: CONTROL-PLANE-FUNCTIONAL-CANARY-1', 2176),
 ('github-workflow-deny', 'code loop DENY_PATH .github/, lane never auto-merges .github/', 'filter', 'CI or supply-chain tampering by an automated change', 0, 'keep', 'applied', 'put logic in scripts/ (merged by the lane) and keep workflows thin', '2026-10-08', 'security precedes anti-fragility (doctrine section 0); the retired-host routes shipped through scripts/attach-surface-routes.py on 2026-10-08 with no workflow change', NULL),
 ('zenodo-enabled', 'ops_config zenodo_enabled = 0', 'kill-switch', 'calls to an account Zenodo banned (2026-10-07, final)', 1, 'demote', 'planned', 'in-house publication and identifiers (#2137, #2135, #2136)', NULL, 'the switch mirrors an outside refusal; research publishing has no tested second path until #2137 lands', 2137),
 ('errata-publish-enabled', 'pipeline_flags errata_publish_enabled (absent = off)', 'gate', 'errata deposits to Zenodo', 0, 'replace', 'planned', 'in-house errata publication with #2135', NULL, 'turning it on would only call the banned account', 2135),
 ('perf-loop-enabled', 'ops_config perf_loop_enabled = 0', 'pause', 'the performance experiment reverting the owner''s q08_max_per_day', 0, 'replace', 'planned', 're-enable with q08_max_per_day outside the experiment''s search space: PERF-LOOP-RESUME-1', NULL, 'paused 2026-10-06 on the owner''s instruction (card 58); the instruction protects the cap, not the pause', 2177),
 ('code-merge-max-per-tick', 'ops_config code_merge_max_merges_per_tick = 3', 'cap', 'merge thrash (doctrine section 4 WIP limit)', 1, 'demote', 'applied', 'the next 10-minute tick', '2026-10-08', 'a rate, not a hold: 18 merges an hour', NULL),
 ('research-quality-gate', 'publication_gate_mode / QUALITY-GATE-1 / verify stage', 'gate', 'publishing an incomplete or wrong paper (doctrine section 5 requires it)', 1, 'demote', 'applied', 'a failing paper is parked so the rest of the queue runs (queue_sla 30-minute park; #2170)', '2026-10-08', 'per item, never head-of-line: row a08f298a blocked 12 papers for 24 h before the park', 2170),
 ('research-single-flight-lease', 'qnfo-research-exec single-flight lease, one stage per tick', 'lease', 'overlapping runs on one row', 1, 'replace', 'planned', 'up to 3 rows in flight, stages back to back (#2175)', NULL, 'about 13 papers a day against about 68 queued', 2175),
 ('issue-refile-guard', 'D1 trigger issue_refile_guard', 'filter', 'duplicate issues', 1, 'replace', 'applied', 'reopen the closed issue instead of dropping the new one (issue_refile_reopen)', NULL, 'RAISE(IGNORE) silently dropped any relapse filed within 24 h of a close', NULL),
 ('deploy-version-monotonic', 'D1 trigger deployment_history_version_monotonic_ins', 'guard', 'a deploy ledger that regresses silently', 1, 'keep', 'applied', 'reverts bump forward (1.4.2-revert-e70f166) and ROLLBACK-OK in notes', '2026-10-07', 'the canary revert of #2138 shipped through it', 2138),
 ('linkedin-draft-mode', 'pipeline_flags linkedin_mode = draft', 'gate', 'automated LinkedIn posting, forbidden by its API terms (3.1); the owner''s identity', 0, 'keep', 'applied', 'Bluesky, Mastodon and X post automatically; LinkedIn drafts wait one tap in Buffer', '2026-10-07', 'identity-bound and contractual (doctrine section 3)', NULL),
 ('outreach-consent-gate', 'qnfo-outreach pipeline_state external_sends_enabled, contact_ledger guards, email tone gate', 'gate', 'mailing people outside the fleet without consent; opt-out law', 0, 'keep', 'applied', 'none needed: protects people outside the fleet (CLAUDE.md RULE-8-RETIRED-1 keeps it)', NULL, 'never on a research or remediation path', NULL),
 ('enabling-kill-switches', 'ops_config autonomy_first_gate, queue_sla_autofix, control_plane_self_merge, inbound_sla_enabled (all on)', 'kill-switch', 'a bad automatic fix', 0, 'demote', 'applied', 'each one stops only an automation layered on top of the base path; the base path runs without it', '2026-10-08', 'switches that stop an enhancer, not a critical path', NULL),
 ('command-drain-key', 'ops_config command_drain_key (plaintext capability key)', 'gate', 'nothing: no worker reads it', 0, 'remove', 'applied', 'none needed', NULL, 'removed by this file (value overwritten); qnfo-email authenticates with API_KEY / GATEWAY_EMAIL_KEY', NULL);

INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('qnfo-research-exec single executor', 'research: queue to published paper', NULL, NULL, 'one stage per tick, one row at a time; one failing row stalled 12 papers for 24 h on 2026-10-07', 2175),
 ('Zenodo deposit', 'research: publication and identifiers', 'in-house publication (#2137)', NULL, 'account banned 2026-10-07; nothing has published since 2026-10-06', 2137),
 ('the fleet tick (10-minute fixer, age ladder, scorecard)', 'every 10-minute remediation in D1', 'fleet_tick advances from the fleet cron log or from fleet_heartbeat written by six workers on their own crons', NULL, 'the first design (two cron rows) was one producer, one trigger on fleet_crons.last_fired: a false alternate, corrected 2026-10-08 (SPOF-AUDIT-1); tested when the first heartbeat-sourced tick is recorded', NULL),
 ('qnfo-fleet-control remediation tick', 'issue probes and belief probes', 'scripts/remediation_consumer.py on the GitHub runner reads the same contracts (dispatched by qnfo-cloud-ops when idle 60 min)', '2026-10-08', 'PROBE-CADENCE-1', NULL),
 ('qnfo-code-orchestrator', 'one-file code remediation', 'session PRs through the stale-PR lane', '2026-10-08T10:00:58Z', 'PR 800 merged by the lane', NULL),
 ('qnfo-ops /ops/deploy', 'every canonical deploy, reverts included', NULL, NULL, 'canonical-deploy.yml calls it; no second deploy path for an ordinary worker is recorded as tested: DEPLOY-SECOND-PATH-1', 2178),
 ('qnfo-ai router', 'every internal model call', NULL, NULL, 'internal workers reach models through its service binding; a per-worker direct env.AI fallback is not recorded as tested: AI-ROUTER-SECOND-PATH-1', 2179);

-- Beliefs: each is probed hourly by the remediation tick through its belief-<key> contract.
INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on) VALUES
 ('repo-token-writes-routes', 'The repository CLOUDFLARE_API_TOKEN can create zone routes', 0.95, 'deployment_history worker_route attach rows (2026-10-02); the opposite belief on card cf-dns-redirect-token was false', 'belief-repo-token-writes-routes', 'RETIRED-HOSTS-ROUTES-1, CLAUDE.md Cloudflare section'),
 ('issues-probed-hourly', 'Every open issue has a probe verdict within 60 minutes', 0.5, 'QUEUE-SLA-1: 105 of 136 unprobed before the change', 'belief-issues-probed-hourly', 'QUEUE-SLA-1 issue SLA'),
 ('research-drains-in-3h', 'The research queue drains inside 180 minutes', 0.1, 'about 13 papers a day against about 68 queued (2026-10-08)', 'belief-research-drains-in-3h', 'research pillar throughput'),
 ('nothing-stuck', 'No queue item is past its SLA', 0.3, 'stuck_items_over_sla', 'belief-nothing-stuck', 'QUEUE-SLA-1'),
 ('owner-queue-identity-only', 'Every open owner card is irreversible and identity-bound', 0.8, 'v_human_action_gate', 'belief-owner-queue-identity-only', 'AUTONOMY-FIRST-1'),
 ('research-publishes-without-zenodo', 'Research papers publish without Zenodo', 0.1, 'nothing published since 2026-10-06', 'belief-research-publishes-without-zenodo', 'INHOUSE-FIRST-1'),
 ('no-untested-control-on-critical-path', 'No control on a critical path lacks a tested alternate', 0.2, 'control_registry', 'belief-no-untested-control-on-critical-path', 'doctrine section 11'),
 ('no-spof-on-critical-path', 'No critical path has a single point of failure without a tested alternate', 0.2, 'spof_registry', 'belief-no-spof-on-critical-path', 'doctrine section 10');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('belief-repo-token-writes-routes', NULL, 'DOCTRINE-1 belief', 'belief probe', 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM deployment_history WHERE resource_type = ''worker_route'' AND status = ''success'') THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief'),
 ('belief-issues-probed-hourly', NULL, 'DOCTRINE-1 belief', 'belief probe', 'SELECT ''1'' AS expected, CASE WHEN CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''issues_unprobed_60m''), ''999'') AS INTEGER) <= 10 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief'),
 ('belief-research-drains-in-3h', NULL, 'DOCTRINE-1 belief', 'belief probe', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status = ''queued'' AND datetime(created_at) < datetime(''now'', ''-180 minutes'')) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief'),
 ('belief-nothing-stuck', NULL, 'DOCTRINE-1 belief', 'belief probe', 'SELECT ''1'' AS expected, CASE WHEN CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''stuck_items_over_sla''), ''999'') AS INTEGER) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief'),
 ('belief-owner-queue-identity-only', NULL, 'DOCTRINE-1 belief', 'belief probe', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM v_human_action_gate WHERE status = ''open'' AND gate = ''fleet'') = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief'),
 ('belief-research-publishes-without-zenodo', NULL, 'DOCTRINE-1 belief', 'belief probe', 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM research_queue WHERE status = ''published'' AND published_at > ''2026-10-07T08:26:00Z'' AND COALESCE(doi, '''') NOT LIKE ''10.5281/zenodo%'') THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief'),
 ('belief-no-untested-control-on-critical-path', NULL, 'DOCTRINE-1 belief', 'belief probe', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM control_registry WHERE critical_path = 1 AND NOT (disposition = ''remove'' AND disposition_state = ''applied'') AND alternate_tested_at IS NULL) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief'),
 ('belief-no-spof-on-critical-path', NULL, 'DOCTRINE-1 belief', 'belief probe', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM spof_registry WHERE alternate_tested_at IS NULL) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief');

CREATE VIEW IF NOT EXISTS v_belief_status AS
SELECT b.belief_key, b.claim, b.probe_class,
  (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.class = b.probe_class) AS last_tested,
  (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = b.probe_class AND v.pass = 0) AS falsification_hits,
  CASE
    WHEN (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.class = b.probe_class) IS NULL
      OR (SELECT MAX(v.verified_at) FROM remediation_verifications v WHERE v.class = b.probe_class) < datetime('now', '-60 minutes') THEN 'suspect'
    WHEN (SELECT v.pass FROM remediation_verifications v WHERE v.class = b.probe_class ORDER BY v.id DESC LIMIT 1) = 1 THEN 'held'
    ELSE 'falsified'
  END AS status
FROM belief_registry b;

CREATE VIEW IF NOT EXISTS v_doctrine_scorecard AS
SELECT
  (SELECT COUNT(*) FROM control_registry WHERE critical_path = 1 AND NOT (disposition = 'remove' AND disposition_state = 'applied') AND alternate_tested_at IS NULL) AS controls_on_critical_path_untested,
  (SELECT COUNT(*) FROM spof_registry WHERE alternate_tested_at IS NULL) AS spofs_on_critical_path,
  (SELECT COUNT(*) FROM v_belief_status WHERE status = 'suspect') AS beliefs_unverified_60m,
  (SELECT COUNT(*) FROM v_belief_status WHERE status = 'falsified') AS beliefs_falsified,
  (SELECT age_min FROM v_issue_age ORDER BY age_min DESC LIMIT 1 OFFSET (SELECT COUNT(*) / 20 FROM v_issue_age)) AS backlog_age_p95_min,
  (SELECT COUNT(*) FROM human_actions WHERE status = 'open') AS owner_stops_open,
  (SELECT COUNT(*) FROM v_human_action_gate WHERE status = 'open' AND gate = 'owner') AS owner_stops_justified;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('controls_on_critical_path_untested', 'operational', 'guard', 'v_doctrine_scorecard.controls_on_critical_path_untested: controls on a critical path whose alternate path has not run (doctrine sections 10-11).', 'qnfo-audit.control_registry (DOCTRINE-1)', '6 on 2026-10-08', '0', 'qnfo-fleet-control', 'trigger gt 0 -> one METRIC-TRIGGER issue', '10m', '> 0', '> 6', NULL, NULL, 'MEASURED', 'computed'),
 ('spofs_on_critical_path', 'operational', 'guard', 'v_doctrine_scorecard.spofs_on_critical_path: single points of failure whose alternate path has not run (doctrine section 10).', 'qnfo-audit.spof_registry (DOCTRINE-1)', '5 on 2026-10-08', '0', 'qnfo-fleet-control', 'trigger gt 0 -> one METRIC-TRIGGER issue', '10m', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed'),
 ('beliefs_unverified_60m', 'operational', 'guard', 'v_doctrine_scorecard.beliefs_unverified_60m: registered beliefs with no probe verdict in 60 minutes (doctrine section 5).', 'qnfo-audit.v_belief_status (DOCTRINE-1)', '8 before the first probe run', '0', 'qnfo-fleet-control', 'trigger gt 0 -> one METRIC-TRIGGER issue', '10m', '> 0', '> 4', NULL, NULL, 'MEASURED', 'computed'),
 ('backlog_age_p95_min', 'operational', 'target', 'v_doctrine_scorecard.backlog_age_p95_min: 95th percentile age of open agent_issues in minutes (doctrine section 13, target <= one tick).', 'qnfo-audit.v_issue_age (DOCTRINE-1)', 'about 7 days on 2026-10-08', '<= 60', 'qnfo-fleet-control', 'trigger gt 1440 -> one METRIC-TRIGGER issue', '10m', '> 60', '> 1440', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS doctrine_tick_10m AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT controls_on_critical_path_untested FROM v_doctrine_scorecard) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'controls_on_critical_path_untested';
  UPDATE metric_registry SET last_value = CAST((SELECT spofs_on_critical_path FROM v_doctrine_scorecard) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'spofs_on_critical_path';
  UPDATE metric_registry SET last_value = CAST((SELECT beliefs_unverified_60m FROM v_doctrine_scorecard) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'beliefs_unverified_60m';
  UPDATE metric_registry SET last_value = CAST((SELECT backlog_age_p95_min FROM v_doctrine_scorecard) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'backlog_age_p95_min';
END;

-- Replace issue_refile_guard: a relapse reopens the closed issue (with a dated note) instead of vanishing.
CREATE TABLE IF NOT EXISTS bak_20261008_doctrine_triggers AS SELECT type, name, tbl_name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'trigger';

DROP TRIGGER IF EXISTS issue_refile_guard;
CREATE TRIGGER IF NOT EXISTS issue_refile_reopen BEFORE INSERT ON agent_issues
WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
  AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000))
BEGIN
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' by issue_refile_reopen (DOCTRINE-1): the same title was filed again within 24 h of the close, by ' || COALESCE(NEW.source, '?') || '.'
  WHERE id = (SELECT t.id FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
    AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000) ORDER BY t.id DESC LIMIT 1);
  SELECT RAISE(IGNORE);
END;

-- Remove the orphaned plaintext capability key (no reader; doctrine section 6).
UPDATE ops_config SET value = 'removed-20261008', note = 'DOCTRINE-1 2026-10-08: plaintext capability key removed; no worker reads it (qnfo-email authenticates with API_KEY / GATEWAY_EMAIL_KEY; qnfo-email-orchestrator folded 2026-10-06). Never store a credential in ops_config.', updated_at = datetime('now')
WHERE key = 'command_drain_key' AND value <> 'removed-20261008';

-- Idempotent: re-applying this file adds no decision twice (doctrine section 2).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'research owner_hold no longer had a live reason', 'released 19 owner_hold rows and 8 outage-parked rows to queued; accepted and queued 31 held ideas', 'SIGNAL-INTAKE shipped 2026-10-07; parked errors were ensemble 0/3 legs during model outages', 'applied 2026-10-08', 'research_queue and idea_proposals rows only; publishing still passes the quality gate', 'bak_20261008_hold_release; revert text in each row''s error or rationale'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action = 'released 19 owner_hold rows and 8 outage-parked rows to queued; accepted and queued 31 held ideas');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'outside text, not first-party loops, is what the trusted-sources filter must exclude', 'admitted fi-executor, autonomy-first-gate, qnfo-code-orchestrator, qnfo-fleet-advisor, claude-chat*, chat:* to code_merge_trusted_sources', 'their issue text is generated from fleet data; qnfo-email, ask-loop and qnfo-research-exec embed outside text and stay excluded', 'applied 2026-10-08', 'code loop intake and merge for issues from those sources; every change still passes CI, the goal review and the merge runner', 'copy ops_config code_merge_trusted_sources--bak-20261008T1440Z back'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action = 'admitted fi-executor, autonomy-first-gate, qnfo-code-orchestrator, qnfo-fleet-advisor, claude-chat*, chat:* to code_merge_trusted_sources');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'the research head row blocked the queue', 'parked research_queue a08f298a (review/publish, Zenodo 403)', 'failed every tick from 2026-10-07T13:30Z; 12 rows waited behind it', 'queue moved at 14:00Z (ground -> ensemble)', 'one research row', 'status review, stage publish (text in the row''s error)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action = 'parked research_queue a08f298a (review/publish, Zenodo 403)');
