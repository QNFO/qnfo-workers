-- COMPETE-SLOT-1 (2026-11-13, charter pillar autonomy; owner-requested product R&D and competitive analysis as core behaviour).
-- qnfo-agents 0.22.2 never defers or sheds a compete-<product>-<yyyymmdd> request (the pr-compete-ask step of domain-managers: one request at a time, one product refreshed per
-- 30 days). Measured 2026-11-12: compete-brand-20261112 was shed after 110 minutes, so product_competitors stayed at 0 rows and v_product_research showed no competitors.
-- This BEFORE INSERT trigger bounds that exemption: at most 6 compete-* requests in any 24 h; a seventh is logged in cf_agent_requests_dropped and ignored (a rate, not a hold).
-- Prediction: product_competitors holds rows with source URLs within 24 h; compete requests per day stay at 6 or fewer.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS cf_agent_requests_compete_cap_bi; DELETE FROM control_registry WHERE control = 'compete-request-cap'; DELETE FROM control_alternate_probes WHERE control = 'compete-request-cap';
-- CAUSE-MAPPED: registers no metric_registry row.

CREATE TABLE IF NOT EXISTS cf_agent_requests_dropped (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT, instance TEXT, dropped_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));

CREATE TRIGGER IF NOT EXISTS cf_agent_requests_compete_cap_bi BEFORE INSERT ON cf_agent_requests
WHEN substr(COALESCE(NEW.instance, ''), 1, 8) = 'compete-'
 AND (SELECT COUNT(*) FROM cf_agent_requests
      WHERE id > (SELECT COALESCE(MAX(id), 0) FROM cf_agent_requests) - 700
        AND substr(COALESCE(instance, ''), 1, 8) = 'compete-'
        AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')) >= 6
BEGIN
  INSERT INTO cf_agent_requests_dropped (requester, instance) VALUES (NEW.requester, NEW.instance);
  SELECT RAISE(IGNORE);
END;

INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
SELECT 'compete-request-cap', 'qnfo-audit trigger cf_agent_requests_compete_cap_bi (COMPETE-SLOT-1)', 'cap',
  'product competitor requests (compete-<product>-<yyyymmdd>), now exempt from the qnfo-agents budget shed, running without a daily bound',
  0, 'keep', 'applied',
  'a rate, not a hold: pr-compete-ask files the next product on the next tick once the rolling 24 h window has room, and the step itself allows one open compete request at a time; DROP TRIGGER cf_agent_requests_compete_cap_bi removes the bound with no deploy',
  NULL,
  'cf_agent_requests 2026-11-12: compete-brand-20261112 shed after 110 minutes, product_competitors 0 rows',
  NULL
WHERE NOT EXISTS (SELECT 1 FROM control_registry WHERE control = 'compete-request-cap');

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES
 ('compete-request-cap',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name = ''cf_agent_requests_compete_cap_bi'') = 0 THEN ''the trigger cf_agent_requests_compete_cap_bi is missing, so compete requests have no daily bound'' ELSE ''ok'' END AS observed',
  'state probe, no window: the trigger that bounds compete requests; the alternate (the next tick filing the next product) is the pr-compete-ask step of domain-managers', 1);
