-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261030_finops_triggers
-- Rollback: DROP TRIGGER IF EXISTS finops_digest_ai_del; DROP TRIGGER IF EXISTS finops_digest_ai_ins; DROP TRIGGER IF EXISTS finops_digest_ai_upd; CREATE TRIGGER finops_digest_ai_ins AFTER INSERT ON ai_spend_ledger BEGIN INSERT OR REPLACE INTO finops_digest (week, caller, calls, usd, downgraded, updated_at) SELECT strftime('%Y-W%W', NEW.day), NEW.caller, SUM(calls), SUM(usd), SUM(downgraded), datetime('now') FROM ai_spend_ledger WHERE caller = NEW.caller AND strftime('%Y-W%W', day) = strftime('%Y-W%W', NEW.day); END; CREATE TRIGGER finops_digest_ai_upd AFTER UPDATE ON ai_spend_ledger BEGIN INSERT OR REPLACE INTO finops_digest (week, caller, calls, usd, downgraded, updated_at) SELECT strftime('%Y-W%W', NEW.day), NEW.caller, SUM(calls), SUM(usd), SUM(downgraded), datetime('now') FROM ai_spend_ledger WHERE caller = NEW.caller AND strftime('%Y-W%W', day) = strftime('%Y-W%W', NEW.day); END;
-- FINOPS-DIGEST-UPSERT-1, charter pillars cost/autonomy; refs #5266, #5253.
-- An outer INSERT ... ON CONFLICT DO UPDATE overrides a trigger's OR REPLACE conflict policy.
-- Use explicit UPSERT in the digest too. Recompute affected groups, not increments, so retries do not double-charge.
-- Keep old caller/week totals correct when rows move or are removed; preserve zero-valued groups for audit.
CREATE TABLE IF NOT EXISTS bak_20261030_finops_triggers AS
  SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN ('finops_digest_ai_ins', 'finops_digest_ai_upd');

DROP TRIGGER IF EXISTS finops_digest_ai_ins;
DROP TRIGGER IF EXISTS finops_digest_ai_upd;
DROP TRIGGER IF EXISTS finops_digest_ai_del;

CREATE TRIGGER finops_digest_ai_ins AFTER INSERT ON ai_spend_ledger BEGIN
  INSERT INTO finops_digest (week, caller, calls, usd, downgraded, updated_at)
  SELECT strftime('%Y-W%W', NEW.day), NEW.caller, COALESCE(SUM(calls), 0), COALESCE(SUM(usd), 0), COALESCE(SUM(downgraded), 0), datetime('now')
  FROM ai_spend_ledger WHERE caller = NEW.caller AND strftime('%Y-W%W', day) = strftime('%Y-W%W', NEW.day)
  ON CONFLICT(week, caller) DO UPDATE SET calls = excluded.calls, usd = excluded.usd, downgraded = excluded.downgraded, updated_at = excluded.updated_at;
END;

CREATE TRIGGER finops_digest_ai_upd AFTER UPDATE ON ai_spend_ledger BEGIN
  INSERT INTO finops_digest (week, caller, calls, usd, downgraded, updated_at)
  SELECT strftime('%Y-W%W', OLD.day), OLD.caller, COALESCE(SUM(calls), 0), COALESCE(SUM(usd), 0), COALESCE(SUM(downgraded), 0), datetime('now')
  FROM ai_spend_ledger WHERE caller = OLD.caller AND strftime('%Y-W%W', day) = strftime('%Y-W%W', OLD.day)
  ON CONFLICT(week, caller) DO UPDATE SET calls = excluded.calls, usd = excluded.usd, downgraded = excluded.downgraded, updated_at = excluded.updated_at;
  INSERT INTO finops_digest (week, caller, calls, usd, downgraded, updated_at)
  SELECT strftime('%Y-W%W', NEW.day), NEW.caller, COALESCE(SUM(calls), 0), COALESCE(SUM(usd), 0), COALESCE(SUM(downgraded), 0), datetime('now')
  FROM ai_spend_ledger WHERE caller = NEW.caller AND strftime('%Y-W%W', day) = strftime('%Y-W%W', NEW.day)
  ON CONFLICT(week, caller) DO UPDATE SET calls = excluded.calls, usd = excluded.usd, downgraded = excluded.downgraded, updated_at = excluded.updated_at;
END;

CREATE TRIGGER finops_digest_ai_del AFTER DELETE ON ai_spend_ledger BEGIN
  INSERT INTO finops_digest (week, caller, calls, usd, downgraded, updated_at)
  SELECT strftime('%Y-W%W', OLD.day), OLD.caller, COALESCE(SUM(calls), 0), COALESCE(SUM(usd), 0), COALESCE(SUM(downgraded), 0), datetime('now')
  FROM ai_spend_ledger WHERE caller = OLD.caller AND strftime('%Y-W%W', day) = strftime('%Y-W%W', OLD.day)
  ON CONFLICT(week, caller) DO UPDATE SET calls = excluded.calls, usd = excluded.usd, downgraded = excluded.downgraded, updated_at = excluded.updated_at;
END;

INSERT INTO finops_digest (week, caller, calls, usd, downgraded, updated_at)
SELECT strftime('%Y-W%W', day), caller, COALESCE(SUM(calls), 0), COALESCE(SUM(usd), 0), COALESCE(SUM(downgraded), 0), datetime('now')
FROM ai_spend_ledger WHERE 1 GROUP BY 1, 2
ON CONFLICT(week, caller) DO UPDATE SET calls = excluded.calls, usd = excluded.usd, downgraded = excluded.downgraded, updated_at = excluded.updated_at;
