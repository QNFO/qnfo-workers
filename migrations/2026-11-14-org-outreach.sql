-- ORG-OUTREACH-1 (2026-11-14, charter pillar reach; owner directive 2026-11-14: reach labs, funders, AI firms and research institutes with what was built, start a conversation about
-- their needs, automatically). The paper-author lane (jobOutreach) holds institute addresses by OUTREACH-PIVOT-1; this is the organisation lane. Targets carry a public source and a specific
-- reason written from the organisation's own statement; _shared/org-outreach.js decides eligibility, builds the message and picks the segment from replies. Default mode is draft: live sends need
-- ops_config org_outreach_mode = live, the fleet kill switch (qnfo-outreach pipeline_state external_sends_enabled) and org_outreach_postal (the sender's postal address, CAN-SPAM).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_org_outreach_segments; DROP TABLE IF EXISTS org_outreach_log; DROP TABLE IF EXISTS org_targets; DELETE FROM ops_config WHERE key LIKE 'org_outreach_%';

CREATE TABLE IF NOT EXISTS org_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org TEXT NOT NULL,
  email TEXT,
  segment TEXT NOT NULL,
  fit REAL,
  fit_note TEXT,
  source_url TEXT,
  discovered_from TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_targets_org_segment ON org_targets (lower(org), segment);
CREATE INDEX IF NOT EXISTS ix_org_targets_status ON org_targets (status, segment);

CREATE TABLE IF NOT EXISTS org_outreach_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  segment TEXT NOT NULL,
  mode TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  message_id TEXT,
  sent_at TEXT DEFAULT (datetime('now')),
  reply_kind TEXT,
  replied_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_org_outreach_log_email ON org_outreach_log (lower(email));
CREATE INDEX IF NOT EXISTS ix_org_outreach_log_day ON org_outreach_log (sent_at, mode);

-- The learner's input: sends and positive replies per segment, live sends only (a draft is not evidence).
CREATE VIEW IF NOT EXISTS v_org_outreach_segments AS
  SELECT segment,
         SUM(CASE WHEN mode = 'live' THEN 1 ELSE 0 END) AS sends,
         SUM(CASE WHEN mode = 'live' AND reply_kind = 'interested' THEN 1 ELSE 0 END) AS positive,
         SUM(CASE WHEN mode = 'live' AND reply_kind IN ('stop','decline') THEN 1 ELSE 0 END) AS negative
  FROM org_outreach_log GROUP BY segment;

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES
  ('org_outreach_mode', 'draft', 'ORG-OUTREACH-1: off | draft | live. live also needs the external_sends_enabled kill switch and org_outreach_postal.', datetime('now')),
  ('org_outreach_daily_cap', '3', 'ORG-OUTREACH-1: organisation-lane sends a day, inside the shared 8/day cap', datetime('now')),
  ('org_outreach_postal', '', 'ORG-OUTREACH-1 IDENTITY-BOUND: the sender postal address printed in every live message (CAN-SPAM). Empty keeps the lane in draft.', datetime('now')),
  ('org_outreach_booking_url', '', 'ORG-OUTREACH-1: optional scheduling link added to the ask', datetime('now'));
