-- WORK-CLAIMS-1 (2026-10-02, pillar: autonomy). Applied live by the session that wrote it; idempotent.
--
-- The problem. Several agent sessions and the code loop change this repository at the same time, and nothing says who
-- is already working on what. Measured 2026-10-02: three sessions fixed the same code-loop verifier defect in parallel
-- (PRs 458, 459 and 462; 462 was closed as a duplicate), and two PRs of one session had to be rebased because other
-- sessions moved the same VERSION line in between.
--
-- The fix: an advisory claim on a path. A session looks before it starts and says what it is doing; the code loop's
-- unfinished tasks appear in the same view. A claim never blocks a write: it tells the next session to review the
-- in-flight change instead of writing a second one. It expires by itself after two hours, so a dead session cannot
-- hold a path.
--
-- Rollback: DROP VIEW v_work_claims_active; DROP TABLE work_claims.

CREATE TABLE IF NOT EXISTS work_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  intent TEXT NOT NULL,
  holder TEXT NOT NULL,
  issue_id INTEGER,
  pr INTEGER,
  claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 hours')),
  released_at TEXT,
  outcome TEXT
);

CREATE VIEW IF NOT EXISTS v_work_claims_active AS
SELECT 'session' AS kind, path, intent, holder, issue_id, pr, claimed_at, expires_at
  FROM work_claims WHERE released_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now')
UNION ALL
SELECT 'code-loop', path, substr(goal, 1, 200), 'qnfo-code-orchestrator:' || id, NULL, NULL, created_at, NULL
  FROM code_tasks WHERE status NOT IN ('merged','closed','publish_failed','needs_human','failed','reverted');
