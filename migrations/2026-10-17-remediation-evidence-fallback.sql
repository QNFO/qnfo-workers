-- SLA-AND-PATHS-1 (2026-10-17, owner directive): every step carries an SLA and more than one path to its
-- definition of done. This migration adds path B for step 2 of the remediation pipeline, evidence persistence.
--
-- WHY: remediation_verifications has seven triggers, and since 2026-10-17T15:08:58Z every INSERT into it fails
-- with "triggers nested too deep" (issue 2794, docs/PROBE-WRITE-DEAD-1.md). Evidence persistence therefore had a
-- single path, that path failed, and autoclose/reopen — which act on inserted rows — could not fire at all.
--
-- WHAT: an append-only evidence sink with no triggers, plus a union view so readers do not need to know which
-- path carried a row. PROVEN 2026-10-17: an insert with the same values returned changes=1 here while the
-- identical insert into remediation_verifications returned 7500: triggers nested too deep.
--
-- STATUS: applied live through the D1 API. Path B is a sink with no writer until the worker tick and the CI
-- consumer fall through to it in their insert catch blocks (see docs/SLA-AND-PATHS-1.md s2).

CREATE TABLE IF NOT EXISTS remediation_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER,
  class TEXT NOT NULL,
  probe_url TEXT,
  transport TEXT NOT NULL,
  expected TEXT,
  observed TEXT,
  pass INTEGER NOT NULL,
  verified_at TEXT DEFAULT (datetime('now')),
  verifier TEXT,
  path TEXT DEFAULT 'B:evidence-table'
);

CREATE INDEX IF NOT EXISTS idx_remediation_evidence_class ON remediation_evidence(class, verified_at);

CREATE VIEW IF NOT EXISTS v_remediation_evidence_all AS
  SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier,
         'verifications' AS src FROM remediation_verifications
  UNION ALL
  SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier,
         'evidence' AS src FROM remediation_evidence;

-- Path-count check (docs/SLA-AND-PATHS-1.md s3): a step with fewer than two live paths is an incident, not a
-- review item. A counts only when a verifications row landed in the last hour; B only when a B: row was written.
-- SELECT (SELECT COUNT(*) FROM remediation_verifications WHERE verified_at > datetime('now','-1 hour')) AS path_a,
--        (SELECT COUNT(*) FROM remediation_evidence    WHERE verified_at > datetime('now','-1 hour') AND path LIKE 'B:%') AS path_b;
