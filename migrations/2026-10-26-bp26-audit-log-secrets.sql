-- BP26-AUDIT-LOG-2 (2026-10-26, charter pillar security; owner directive 2026-10-26 "Implement general best practices systemwide across the fleet"; agent_issues 1000362; follow-up to
-- migrations/2026-10-26-bp26-audit-log.sql, PR 4768, live 18:49Z). The practice names "every publish, send, deploy, rollback and secret change". fleet_deploys holds a secret write only when its writer
-- ledgered it (1 row in 30 days), while Cloudflare recorded 15 secret-triggered versions in the last 14 days: qnfo-ops SECRET-CHANGE-WATCH-1 copies each into cloud_ops_events (kind secret-change; worker,
-- version number and time only, never a value) every 30 minutes. That event is Cloudflare's own record of the change, so it is the right writer:
--   * an AFTER INSERT trigger on cloud_ops_events (WHEN kind = secret-change, so the 17 other triggers and 150 thousand rows are untouched for every other kind) records a secret-write row in agent_actions with the
--     time of the Cloudflare version (created_on), the worker and the version number; json_valid guards a malformed meta so the event insert can never be aborted by this trigger;
--   * the last 8 days of secret-change events are backfilled (via = backfill; 4 rows today).
-- scripts/bp26_auditchain.py then counts secret writes as a coverage class against Cloudflare's version list (workers/triggered_by = secret), which it reads itself and which does not depend on this trigger.
-- Revert: the Rollback line drops the trigger; the backfilled rows stay, because agent_actions is append-only by design.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS agent_actions_from_secret_changes;
-- spof-review: no new single point of failure; the writer reads an event row the existing secret watch already writes, and a missed watch tick delays the row, not the Cloudflare record the coverage collector reads.

CREATE TRIGGER IF NOT EXISTS agent_actions_from_secret_changes AFTER INSERT ON cloud_ops_events
WHEN NEW.kind = 'secret-change'
BEGIN
  INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
  VALUES (COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', CASE WHEN json_valid(NEW.meta) THEN json_extract(NEW.meta, '$.created_on') END), strftime('%Y-%m-%dT%H:%M:%SZ', NEW.ts), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    'cloudflare-secret-watch', NULL, 'cf-version', 'secret-write', CASE WHEN json_valid(NEW.meta) THEN json_extract(NEW.meta, '$.worker') END,
    CASE WHEN json_valid(NEW.meta) THEN CAST(json_extract(NEW.meta, '$.version') AS TEXT) END, 'ok', 'cloud_ops_events', COALESCE(NEW.id, 'rowid:' || NEW.rowid), 'trigger');
END;

INSERT OR IGNORE INTO agent_actions (ts, actor, session, tool, action_kind, target, version_id, outcome, source_table, source_id, via)
SELECT COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', CASE WHEN json_valid(e.meta) THEN json_extract(e.meta, '$.created_on') END), strftime('%Y-%m-%dT%H:%M:%SZ', e.ts)),
  'cloudflare-secret-watch', NULL, 'cf-version', 'secret-write', CASE WHEN json_valid(e.meta) THEN json_extract(e.meta, '$.worker') END,
  CASE WHEN json_valid(e.meta) THEN CAST(json_extract(e.meta, '$.version') AS TEXT) END, 'ok', 'cloud_ops_events', COALESCE(e.id, 'rowid:' || e.rowid), 'backfill'
FROM cloud_ops_events e
WHERE e.kind = 'secret-change' AND strftime('%Y-%m-%dT%H:%M:%SZ', e.ts) >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-8 days')
ORDER BY e.ts;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8-auditlog',
  'a secret change that its writer did not ledger is still a side effect the audit log must hold, and Cloudflare already records it independently: the secret-change event of qnfo-ops is the writer, Cloudflare''s version list is the outside record to judge it against',
  'BP26-AUDIT-LOG-2: trigger agent_actions_from_secret_changes on cloud_ops_events (kind secret-change only) and an 8-day backfill; scripts/bp26_auditchain.py counts secret writes against the Cloudflare Workers versions API',
  'cloud_ops_events kind secret-change: 15 events in the last 14 days (2026-10-12 to 2026-10-25), 4 in the last 8 days; fleet_deploys secret-write rows in 30 days: 1; Cloudflare versions API read for qnfo-fleet-dashboard returned annotations workers/triggered_by with upload values',
  'applied by migration; the coverage collector reads the versions API on the next remediation-consumer run after merge', 'one trigger on a table that already has 17, active for one event kind only; four backfilled rows',
  'the Rollback line (the backfilled rows stay: append-only)', 'every secret change Cloudflare records gains an append-only audit row and an outside coverage check',
  'audit_coverage keeps reading 1 while every secret-triggered Cloudflare version has a secret-write row within 20 minutes; it falls below 1 when the watch misses one', 'none directly',
  'offline: migrations/bp26-audit-log-secrets.test.mjs on node:sqlite (trigger, malformed meta, backfill window, replay, rollback)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-AUDIT-LOG-2:%');
