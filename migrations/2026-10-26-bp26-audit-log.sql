-- BP26-AUDIT-LOG-1 and BP26-LEASES-KILLSWITCH-1 (2026-10-26, charter pillars security and autonomy; owner directive 2026-10-26 "Implement general best practices systemwide across the fleet";
-- agent_issues 1000362 audit log, 1000361 leases and kill switch, 1000448 orphaned_leases). Metrics audit_coverage, audit_chain_verify, kill_switch_test_age_days (all UNMEASURED before this file).
-- WHAT WAS WRONG (measured 2026-10-26 against qnfo-audit): the fleet has partial ledgers (fleet_deploys, deployment_history, emails, social_media_posts, social_threads, decision_log, issue_lifecycle, work_claims) and
-- no one append-only record of what an agent DID. Nothing proves a ledger row was not rewritten after the fact, and nothing checks the ledgers against an independent record of the same events (the Cloudflare
-- deployments API, a platform's public timeline). There is no global kill switch: ops_config and pipeline_flags hold no halt/pause/kill key except the per-loop social_paused.
-- WHAT THIS DOES:
--  1. agent_actions: one append-only row per side effect (deploy, settings, secret-write, rollback, publish, send). Writers are D1 AFTER INSERT triggers on the ledgers that already record the side effect
--     (fleet_deploys, emails, social_media_posts, social_threads), so no worker code changes and nothing is double-written (UNIQUE source_table + source_id). fleet_deploys rows are classified by the rules
--     qnfo-deploy-guard already uses (SETTINGS-ONLY, SECRET-ONLY, rollback markers). A mail row stores the recipient DOMAIN only, never the address. The last 8 days of each ledger are backfilled (via = backfill)
--     so the 7-day coverage window is meaningful from the first run; rows sealed late say so (sealed_at).
--  2. agent_action_chain + agent_action_roots: SQLite has no sha256, so scripts/bp26_auditchain.py (runner, hourly) seals new rows: row_hash = sha256(prev_hash | canonical json of the row), re-verifies the whole
--     chain and every daily root, and writes each day's head to R2 qnfo-backups/audit-chain/<day>.json (a copy outside D1). BEFORE UPDATE and BEFORE DELETE triggers on all four tables abort: append-only in code paths.
--  3. audit_coverage is judged against records the log does not write itself, never against the triggers' own output. Independent of every fleet ledger: Cloudflare Workers deployments (API) for deploy, settings,
--     secret-write and rollback, and a platform's public timeline (Mastodon) for publish. Papers (living-paper paper_change_ledger) and q08 pieces (published_pieces) live in other databases, which a trigger cannot
--     reach, so the runner mirrors them (via = runner-mirror) and they are counted against their own system of record: that checks the mirror's completeness, not the publisher. A class with no outside record is
--     named in the evidence rows, not counted.
--  4. kill_switch_tests (append-only drill ledger) and docs/KILL-SWITCH-DRILL.md: the protocol. kill_switch_test_age_days stays UNMEASURED until a live drill passes (no switch exists, so no honest age exists).
--  5. v_lease_abandonments_7d: the abandonment evidence per holder. DECISION: orphaned_leases (1000448) is already repaired by qnfo-deploy-guard 1.3.34 LEASE-EXPIRY-SWEEP-1 (PR 4729, merged 2026-10-26: an expired,
--     unreleased claim is closed with outcome expired on every acquire and on the 20-minute tick; the metric read 215 at 17:18Z and 0 at 18:11Z). A second sweeper in scripts/claim_reaper.py would race it, so none is
--     added; the abandonment stays countable from work_claims.outcome = 'expired' through this view.
-- Revert: the Rollback line removes the triggers, view, indexes and tables; the metrics return to the source text they had.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS agent_actions_from_social_threads; DROP TRIGGER IF EXISTS agent_actions_from_social_posts; DROP TRIGGER IF EXISTS agent_actions_from_emails_sent; DROP TRIGGER IF EXISTS agent_actions_from_fleet_deploys; DROP TRIGGER IF EXISTS kill_switch_tests_no_delete; DROP TRIGGER IF EXISTS kill_switch_tests_no_update; DROP TRIGGER IF EXISTS agent_action_roots_no_delete; DROP TRIGGER IF EXISTS agent_action_roots_no_update; DROP TRIGGER IF EXISTS agent_action_chain_no_delete; DROP TRIGGER IF EXISTS agent_action_chain_no_update; DROP TRIGGER IF EXISTS agent_actions_no_delete; DROP TRIGGER IF EXISTS agent_actions_no_update; DROP VIEW IF EXISTS v_lease_abandonments_7d; DROP TABLE IF EXISTS kill_switch_tests; DROP TABLE IF EXISTS agent_action_roots; DROP TABLE IF EXISTS agent_action_chain; DROP TABLE IF EXISTS agent_actions; UPDATE metric_registry SET source_of_truth = CASE metric WHEN 'audit_coverage' THEN 'agent_actions (to build) [BP26]' WHEN 'audit_chain_verify' THEN 'agent_actions chain verifier (to build) [BP26]' ELSE 'kill-switch test ledger (to build) [BP26]' END WHERE metric IN ('audit_coverage', 'audit_chain_verify', 'kill_switch_test_age_days');
-- spof-review: the hash chain is sealed by the remediation-consumer runner (one producer, hourly); a missed run delays sealing and the verify metric only, rows stay in agent_actions and are sealed on the next run. The roots are copied to R2 as a second place.

CREATE TABLE IF NOT EXISTS agent_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT,
  session TEXT,
  tool TEXT,
  action_kind TEXT NOT NULL,
  target TEXT,
  inputs_hash TEXT,
  outputs_hash TEXT,
  version_id TEXT,
  cost REAL,
  outcome TEXT,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  via TEXT NOT NULL DEFAULT 'trigger'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_actions_source ON agent_actions (source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_agent_actions_kind_ts ON agent_actions (action_kind, ts);

CREATE TABLE IF NOT EXISTS agent_action_chain (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id INTEGER NOT NULL UNIQUE,
  prev_hash TEXT NOT NULL,
  row_hash TEXT NOT NULL,
  sealed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_action_roots (
  day TEXT PRIMARY KEY,
  head_seq INTEGER NOT NULL,
  head_hash TEXT NOT NULL,
  rows_total INTEGER NOT NULL,
  r2_key TEXT,
  r2_ok INTEGER NOT NULL DEFAULT 0,
  written_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kill_switch_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  flag TEXT NOT NULL,
  mode TEXT NOT NULL,
  loops_expected INTEGER,
  loops_observed_stopped INTEGER,
  loops_observed_resumed INTEGER,
  outcome TEXT NOT NULL,
  evidence TEXT NOT NULL,
  actor TEXT
);

CREATE TRIGGER IF NOT EXISTS agent_actions_no_update BEFORE UPDATE ON agent_actions BEGIN SELECT RAISE(ABORT, 'BP26-AUDIT-LOG-1: agent_actions is append-only'); END;

CREATE TRIGGER IF NOT EXISTS agent_actions_no_delete BEFORE DELETE ON agent_actions BEGIN SELECT RAISE(ABORT, 'BP26-AUDIT-LOG-1: agent_actions is append-only'); END;

CREATE TRIGGER IF NOT EXISTS agent_action_chain_no_update BEFORE UPDATE ON agent_action_chain BEGIN SELECT RAISE(ABORT, 'BP26-AUDIT-LOG-1: agent_action_chain is append-only'); END;

CREATE TRIGGER IF NOT EXISTS agent_action_chain_no_delete BEFORE DELETE ON agent_action_chain BEGIN SELECT RAISE(ABORT, 'BP26-AUDIT-LOG-1: agent_action_chain is append-only'); END;

CREATE TRIGGER IF NOT EXISTS agent_action_roots_no_update BEFORE UPDATE ON agent_action_roots BEGIN SELECT RAISE(ABORT, 'BP26-AUDIT-LOG-1: agent_action_roots is append-only'); END;

CREATE TRIGGER IF NOT EXISTS agent_action_roots_no_delete BEFORE DELETE ON agent_action_roots BEGIN SELECT RAISE(ABORT, 'BP26-AUDIT-LOG-1: agent_action_roots is append-only'); END;

CREATE TRIGGER IF NOT EXISTS kill_switch_tests_no_update BEFORE UPDATE ON kill_switch_tests BEGIN SELECT RAISE(ABORT, 'BP26-LEASES-KILLSWITCH-1: kill_switch_tests is append-only'); END;

CREATE TRIGGER IF NOT EXISTS kill_switch_tests_no_delete BEFORE DELETE ON kill_switch_tests BEGIN SELECT RAISE(ABORT, 'BP26-LEASES-KILLSWITCH-1: kill_switch_tests is append-only'); END;

-- Writers: one AFTER INSERT trigger per ledger that already records a side effect. INSERT OR IGNORE on the unique (source_table, source_id): a replay or a second path never double-writes.
-- fleet_deploys classification mirrors qnfo-deploy-guard (isSettingsOnly, isSecretOnly) plus the rollback markers of the deploy ledger.
CREATE TRIGGER IF NOT EXISTS agent_actions_from_fleet_deploys AFTER INSERT ON fleet_deploys
BEGIN
  INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
  VALUES (COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', NEW.ts), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), NEW.actor, NEW.session_id, COALESCE(NEW.source_path, substr(NEW.note, 1, 60)),
    CASE
      WHEN COALESCE(NEW.note, '') LIKE 'SETTINGS-ONLY%' THEN 'settings'
      WHEN COALESCE(NEW.note, '') LIKE 'SECRET-ONLY%' THEN 'secret-write'
      WHEN (lower(COALESCE(NEW.actor, '') || ' ' || COALESCE(NEW.note, '')) LIKE '%secret-rotat%' OR lower(COALESCE(NEW.actor, '') || ' ' || COALESCE(NEW.note, '')) LIKE '%secret rotat%'
         OR lower(COALESCE(NEW.actor, '') || ' ' || COALESCE(NEW.note, '')) LIKE '%secret put%' OR lower(COALESCE(NEW.actor, '') || ' ' || COALESCE(NEW.note, '')) LIKE '%secret-put%'
         OR lower(COALESCE(NEW.actor, '') || ' ' || COALESCE(NEW.note, '')) LIKE '%secret change%' OR lower(COALESCE(NEW.actor, '') || ' ' || COALESCE(NEW.note, '')) LIKE '%secret set %')
        AND COALESCE(NEW.to_sha, '') NOT GLOB '[0-9]*.[0-9]*' AND COALESCE(NEW.to_sha, '') NOT GLOB 'v[0-9]*' THEN 'secret-write'
      WHEN lower(COALESCE(NEW.note, '')) LIKE '%rollback-ok%' OR lower(COALESCE(NEW.note, '')) LIKE 'rollback%' OR lower(COALESCE(NEW.note, '')) LIKE 'revert%' OR lower(COALESCE(NEW.actor, '')) LIKE '%rollback%' THEN 'rollback'
      ELSE 'deploy'
    END,
    NEW.worker, NEW.to_sha, CASE NEW.ok WHEN 1 THEN 'ok' WHEN 0 THEN 'failed' ELSE 'unknown' END, 'fleet_deploys', CAST(NEW.id AS TEXT), 'trigger');
END;

-- Outbound mail is recorded in emails with status sent or replied at INSERT (the same rule emails_outbound_violation_detect uses). The target is the recipient domain only.
CREATE TRIGGER IF NOT EXISTS agent_actions_from_emails_sent AFTER INSERT ON emails
WHEN NEW.status IN ('sent', 'replied') AND NEW.recipient IS NOT NULL AND instr(NEW.recipient, '@') > 0
BEGIN
  INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
  VALUES (COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', NEW.received_at), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), COALESCE(NEW.sender, 'qnfo-email'), NULL, 'email-send', 'send',
    'mail:' || lower(substr(NEW.recipient, instr(NEW.recipient, '@') + 1)), NULL, 'ok', 'emails', CAST(NEW.id AS TEXT), 'trigger');
END;

CREATE TRIGGER IF NOT EXISTS agent_actions_from_social_posts AFTER INSERT ON social_media_posts
WHEN NEW.status = 'published'
BEGIN
  INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
  VALUES (COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(NEW.published_at, NEW.created_at)), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), 'qnfo-social', NULL, NEW.platform, 'publish',
    COALESCE(NEW.url, NEW.platform || ':' || COALESCE(NEW.post_id, NEW.id)), NULL, 'ok', 'social_media_posts', CAST(NEW.id AS TEXT), 'trigger');
END;

CREATE TRIGGER IF NOT EXISTS agent_actions_from_social_threads AFTER UPDATE OF status ON social_threads
WHEN NEW.status = 'posted' AND COALESCE(OLD.status, '') <> 'posted'
BEGIN
  INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
  VALUES (COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', NEW.posted_at), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), 'qnfo-social', NULL, 'thread', 'publish', 'thread:' || COALESCE(NEW.slug, CAST(NEW.id AS TEXT)),
    NULL, 'ok', 'social_threads', CAST(NEW.id AS TEXT), 'trigger');
END;

-- Backfill: the last 8 days of each ledger, so the 7-day coverage window is real from the first run. Same classification as the trigger; replaying inserts nothing.
INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', f.ts), f.actor, f.session_id, COALESCE(f.source_path, substr(f.note, 1, 60)),
  CASE
    WHEN COALESCE(f.note, '') LIKE 'SETTINGS-ONLY%' THEN 'settings'
    WHEN COALESCE(f.note, '') LIKE 'SECRET-ONLY%' THEN 'secret-write'
    WHEN (lower(COALESCE(f.actor, '') || ' ' || COALESCE(f.note, '')) LIKE '%secret-rotat%' OR lower(COALESCE(f.actor, '') || ' ' || COALESCE(f.note, '')) LIKE '%secret rotat%'
       OR lower(COALESCE(f.actor, '') || ' ' || COALESCE(f.note, '')) LIKE '%secret put%' OR lower(COALESCE(f.actor, '') || ' ' || COALESCE(f.note, '')) LIKE '%secret-put%'
       OR lower(COALESCE(f.actor, '') || ' ' || COALESCE(f.note, '')) LIKE '%secret change%' OR lower(COALESCE(f.actor, '') || ' ' || COALESCE(f.note, '')) LIKE '%secret set %')
      AND COALESCE(f.to_sha, '') NOT GLOB '[0-9]*.[0-9]*' AND COALESCE(f.to_sha, '') NOT GLOB 'v[0-9]*' THEN 'secret-write'
    WHEN lower(COALESCE(f.note, '')) LIKE '%rollback-ok%' OR lower(COALESCE(f.note, '')) LIKE 'rollback%' OR lower(COALESCE(f.note, '')) LIKE 'revert%' OR lower(COALESCE(f.actor, '')) LIKE '%rollback%' THEN 'rollback'
    ELSE 'deploy'
  END,
  f.worker, f.to_sha, CASE f.ok WHEN 1 THEN 'ok' WHEN 0 THEN 'failed' ELSE 'unknown' END, 'fleet_deploys', CAST(f.id AS TEXT), 'backfill'
FROM fleet_deploys f
WHERE strftime('%Y-%m-%dT%H:%M:%SZ', f.ts) >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-8 days')
ORDER BY f.id;

INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', e.received_at), COALESCE(e.sender, 'qnfo-email'), NULL, 'email-send', 'send', 'mail:' || lower(substr(e.recipient, instr(e.recipient, '@') + 1)), NULL, 'ok', 'emails', CAST(e.id AS TEXT), 'backfill'
FROM emails e
WHERE e.status = 'sent' AND e.recipient IS NOT NULL AND instr(e.recipient, '@') > 0 AND strftime('%Y-%m-%dT%H:%M:%SZ', e.received_at) >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-8 days')
ORDER BY e.id;

INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(p.published_at, p.created_at)), 'qnfo-social', NULL, p.platform, 'publish', COALESCE(p.url, p.platform || ':' || COALESCE(p.post_id, p.id)), NULL, 'ok', 'social_media_posts', CAST(p.id AS TEXT), 'backfill'
FROM social_media_posts p
WHERE p.status = 'published' AND strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(p.published_at, p.created_at)) >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-8 days')
ORDER BY p.created_at;

INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', t.posted_at), 'qnfo-social', NULL, 'thread', 'publish', 'thread:' || COALESCE(t.slug, CAST(t.id AS TEXT)), NULL, 'ok', 'social_threads', CAST(t.id AS TEXT), 'backfill'
FROM social_threads t
WHERE t.status = 'posted' AND strftime('%Y-%m-%dT%H:%M:%SZ', t.posted_at) >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-8 days')
ORDER BY t.id;

-- The abandonment evidence per holder (a claim the sweeper closed with outcome expired: its holder never released it).
CREATE VIEW IF NOT EXISTS v_lease_abandonments_7d AS
SELECT holder,
       COUNT(*) AS claims,
       SUM(CASE WHEN outcome = 'expired' OR outcome LIKE 'expired-%' THEN 1 ELSE 0 END) AS abandoned,
       ROUND(1.0 * SUM(CASE WHEN outcome = 'expired' OR outcome LIKE 'expired-%' THEN 1 ELSE 0 END) / COUNT(*), 3) AS abandoned_share,
       MAX(CASE WHEN outcome = 'expired' OR outcome LIKE 'expired-%' THEN expires_at END) AS last_abandoned_expiry
FROM work_claims
WHERE claimed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
GROUP BY holder;

UPDATE metric_registry SET source_of_truth = 'qnfo-audit.agent_actions judged by scripts/bp26_auditchain.py collect_audit_coverage (runner, hourly) against records it does not write: Cloudflare Workers deployments API (independent) for deploy, settings, secret-write and rollback; the Mastodon public timeline (independent) for publish; papers and q08 events against their own databases (the runner mirrors them: mirror completeness); classes with no outside record are named in bp26_probe_results, not counted [BP26]'
  WHERE metric = 'audit_coverage';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.agent_action_chain sealed and re-verified by scripts/bp26_auditchain.py collect_audit_chain (runner, hourly): sha256 over prev_hash and the canonical row, every daily root checked, each root copied to R2 qnfo-backups/audit-chain/ [BP26]'
  WHERE metric = 'audit_chain_verify';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.kill_switch_tests (last live drill with outcome pass) via scripts/bp26_auditchain.py collect_kill_switch_age; stays UNMEASURED until a drill passes because no global kill switch exists yet (protocol docs/KILL-SWITCH-DRILL.md) [BP26]'
  WHERE metric = 'kill_switch_test_age_days';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8-auditlog',
  'an audit log is only worth its name when it is append-only, tamper-evident and judged against records the log does not write itself; a lease sweeper already exists, so a second one would race it, and a kill switch that does not exist cannot honestly be given an age',
  'BP26-AUDIT-LOG-1: agent_actions, agent_action_chain, agent_action_roots with trigger writers on fleet_deploys, emails, social_media_posts and social_threads, an 8-day backfill and append-only guards; BP26-LEASES-KILLSWITCH-1: kill_switch_tests, v_lease_abandonments_7d, docs/KILL-SWITCH-DRILL.md; no second lease sweeper (qnfo-deploy-guard 1.3.34 already closes expired claims); metrics audit_coverage, audit_chain_verify and kill_switch_test_age_days get their real producer text',
  'work_claims 2026-10-26: 0 unreleased claims past expiry at 18:18Z, orphaned_leases 0 at 18:11:02Z (215 at 17:18Z), PR 4729 qnfo-deploy-guard 1.3.34 LEASE-EXPIRY-SWEEP-1; ops_config and pipeline_flags hold no global halt key (only social_paused); fleet_deploys 8650 deploy, 977 settings, 59 tombstone, 2 rollback and 1 secret-write rows in 30 days; Cloudflare Workers deployments API reads for qnfo-deploy-guard returned 200 with created_on times',
  'applied by migration; the chain collector seals and verifies on the next remediation-consumer run after merge', 'four new tables, one view, nine triggers (three writers on fleet_deploys, emails and social_media_posts, one on social_threads, eight guards), one backfill of about 2.5 thousand rows; no existing row changes',
  'the Rollback line', 'every deploy, settings change, secret write, rollback, publish and send gains an append-only, hash-chained record checked against an independent source',
  'audit_chain_verify reads 1 after the first seal; audit_coverage reads a real share below 1 where a deployment has no ledger row; kill_switch_test_age_days stays unmeasured until a drill passes', 'none directly; it is the evidence layer the doctrine asks for',
  'offline: migrations/bp26-audit-log.test.mjs on node:sqlite (writers, classification, append-only, replay); live reads: work_claims, fleet_deploys, Cloudflare deployments API'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-AUDIT-LOG-1:%');
