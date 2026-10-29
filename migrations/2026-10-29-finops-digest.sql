-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS finops_digest_ai_ins; DROP TRIGGER IF EXISTS finops_digest_ai_upd; DROP VIEW IF EXISTS v_finops_weekly; DROP TABLE IF EXISTS finops_digest;
-- BP26-AUDIT-LOG-1 follow-up (2026-10-29, pillar security/cost): the audit-log doc listed "weekly FinOps digest per worker and loop" and a cost value as not built.
-- agent_actions is append-only (UPDATE aborts), so a cost cannot be written onto an existing row; the cost is kept per caller and ISO week in finops_digest,
-- maintained by triggers on ai_spend_ledger (written by the qnfo-ai router every day), so the digest is always current with no cron.
-- v_finops_weekly joins it to the week's agent_actions count per worker (agent_actions.target = worker for deploy/settings/secret-write rows).
CREATE TABLE IF NOT EXISTS finops_digest (
  week TEXT NOT NULL, caller TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, usd REAL NOT NULL DEFAULT 0,
  downgraded INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (week, caller));
INSERT OR REPLACE INTO finops_digest (week, caller, calls, usd, downgraded)
  SELECT strftime('%Y-W%W', day), caller, SUM(calls), SUM(usd), SUM(downgraded) FROM ai_spend_ledger GROUP BY 1, 2;
CREATE TRIGGER IF NOT EXISTS finops_digest_ai_ins AFTER INSERT ON ai_spend_ledger BEGIN
  INSERT OR REPLACE INTO finops_digest (week, caller, calls, usd, downgraded, updated_at)
  SELECT strftime('%Y-W%W', NEW.day), NEW.caller, SUM(calls), SUM(usd), SUM(downgraded), datetime('now')
  FROM ai_spend_ledger WHERE caller = NEW.caller AND strftime('%Y-W%W', day) = strftime('%Y-W%W', NEW.day);
END;
CREATE TRIGGER IF NOT EXISTS finops_digest_ai_upd AFTER UPDATE ON ai_spend_ledger BEGIN
  INSERT OR REPLACE INTO finops_digest (week, caller, calls, usd, downgraded, updated_at)
  SELECT strftime('%Y-W%W', NEW.day), NEW.caller, SUM(calls), SUM(usd), SUM(downgraded), datetime('now')
  FROM ai_spend_ledger WHERE caller = NEW.caller AND strftime('%Y-W%W', day) = strftime('%Y-W%W', NEW.day);
END;
CREATE VIEW IF NOT EXISTS v_finops_weekly AS
  SELECT d.week, d.caller, d.calls, ROUND(d.usd, 4) AS usd, d.downgraded,
         (SELECT COUNT(*) FROM agent_actions a WHERE a.target = d.caller AND strftime('%Y-W%W', a.ts) = d.week) AS audited_actions
  FROM finops_digest d;
