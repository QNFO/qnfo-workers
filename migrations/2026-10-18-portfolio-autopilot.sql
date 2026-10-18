-- PORTFOLIO-AUTOPILOT-1 (owner directive 2026-10-18: "the system shall automatically maintain, implement,
-- deploy and upgrade its own portfolio, programs and projects").  DB: qnfo-audit
--
-- What existed: four hourly crons already OBSERVE the portfolio (portfolio-self-manage writes health and gaps,
-- portfolio-execute writes program work, portfolio-gap-action assigns owners, portfolio-lifecycle tracks
-- projects). What did not exist is CLOSURE. portfolio_gaps is append-only per day with no state, so the same
-- 62 "active project with no issue mapped to it" observations were re-inserted every day forever, and only 3
-- issues in the tracker had ever come from the portfolio. Observation without closure is not maintenance.
--
-- This adds a lifecycle: a gap is open until it stops being observed (or its project retires), becomes an
-- agent_issue when it is actionable, and closes when that issue closes. Deploy and upgrade gaps are filed at
-- high priority because they are the two verbs the portfolio could not perform for itself.
ALTER TABLE portfolio_gaps ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE portfolio_gaps ADD COLUMN resolved_at TEXT;
ALTER TABLE portfolio_gaps ADD COLUMN issue_id INTEGER;
ALTER TABLE portfolio_gaps ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_portfolio_gaps_open ON portfolio_gaps (kind, entity, status);

-- One row per autopilot run: what it closed, what it filed. The audit trail for "the portfolio upgraded itself".
CREATE TABLE IF NOT EXISTS portfolio_autopilot_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  gaps_open INTEGER,
  gaps_closed INTEGER,
  issues_filed INTEGER,
  gaps_linked INTEGER,
  note TEXT
);
