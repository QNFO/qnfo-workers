-- SLA-PATHS-1 (2026-10-17, owner directive): every step carries an SLA and more than one path to its definition of
-- done. docs/SLA-AND-PATHS-1.md states the rule; this file gives it a place to be MEASURED.
--
-- WHY A LIVENESS TABLE: the first draft counted a path as live when it wrote a row in the last hour. A fallback is
-- never used while the primary works, so that rule reports the fallback dead by construction - and the registry it
-- fed read "12 processes, 0 violations" on 2026-10-17 while evidence persistence had exactly one live path and that
-- path was being refused (400 7500 triggers nested too deep). Liveness is AVAILABILITY: each path holds a heartbeat
-- when it carries a row, and the fallback is drilled once a day (a synthetic row written and deleted) so its
-- availability is proven rather than assumed. qnfo-fleet-control 0.33.4 stamps and reads this table, files
-- SINGLE-PATH-1 when fewer than two paths are live, and reports evidence_paths_live in every tick.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_path_health; DROP TABLE IF EXISTS path_liveness;
--           DELETE FROM process_contracts WHERE process = 'remediation:evidence-persistence';
-- No BACKUP line: this file deletes no rows (it drops only the v_path_health view and creates path_liveness empty), and
-- BACKUP-SELF-EMPTY-1 rightly refuses a snapshot of a table the same file creates.

CREATE TABLE IF NOT EXISTS path_liveness (
  path TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  checked_by TEXT,
  detail TEXT
);

-- One row, four columns: A and B last-ok stamps and their live flags. Written as scalar subqueries on purpose - a
-- compound SELECT here tripped "too many terms in compound SELECT" on this D1 instance. IF NOT EXISTS, not
-- DROP + CREATE: a DROP here would make the file destructive, and BACKUP-SELF-EMPTY-1 rightly refuses to snapshot a
-- table the same file creates. A later definition goes in a later migration.
CREATE VIEW IF NOT EXISTS v_path_health AS
SELECT
  (SELECT checked_at FROM path_liveness WHERE path = 'remediation:evidence:A') AS a_last_ok,
  (SELECT COUNT(*) FROM path_liveness WHERE path = 'remediation:evidence:A' AND checked_at > datetime('now','-6 hours')) AS a_live,
  (SELECT checked_at FROM path_liveness WHERE path = 'remediation:evidence:B') AS b_last_ok,
  (SELECT COUNT(*) FROM path_liveness WHERE path = 'remediation:evidence:B' AND checked_at > datetime('now','-30 hours')) AS b_live;

-- The measured step joins the process registry, so the SLA, the definition of done and all three paths are in one
-- place with every other process. Idempotent: a second apply finds the row.
INSERT INTO process_contracts (process, owner, sla_min, definition_of_done, paths_json)
SELECT 'remediation:evidence-persistence', 'qnfo-fleet-control', 2,
       'A row exists in v_remediation_evidence_all for (class, verified_at) and the deciding tick can read it',
       '[{"name":"primary-verifications","kind":"primary","action":"INSERT INTO remediation_verifications (fires the autoclose and reopen triggers)"},
         {"name":"fallback-evidence","kind":"remediation","action":"INSERT INTO remediation_evidence with path=B:tick or B:consumer (no triggers); writers are the fleet tick and the CI consumer, readers use v_remediation_evidence_all"},
         {"name":"session","kind":"workaround","action":"a session inserts into remediation_evidence with path=C:session and names the row in issue_triage.close_evidence"}]'
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'process_contracts')
  AND NOT EXISTS (SELECT 1 FROM process_contracts WHERE process = 'remediation:evidence-persistence');
