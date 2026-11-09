-- OUTBOUND-QUEUE-1 (2026-11-09, charter pillar reach; owner directive: mail goes out from qnfo.org, tracked, never from the owner's Gmail or left in drafts, with an autonomous-agent disclosure).
-- qnfo-email 2.13.0 drains this table every 15 minutes (drainOutboundQueue): suppression check, disclosure footer, send from qnfo@qnfo.org, row in emails, status sent. Replies come back through the normal inbound path.
-- Also queues the first message: partnership note to The Global Research Space (Laika), replacing the Gmail draft.
-- Prediction: the queued row reaches status 'sent' within 30 minutes of the qnfo-email 2.13.0 deploy.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS outbound_queue
-- spof-review: one new table read by an existing worker tick; no new gate.
-- CAUSE-MAPPED: registers no metric_registry row.

CREATE TABLE IF NOT EXISTS outbound_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  from_addr TEXT NOT NULL DEFAULT 'qnfo@qnfo.org',
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_status ON outbound_queue(status, id);

INSERT INTO outbound_queue (to_addr, subject, body_text, purpose)
SELECT 'laika@globalresearchspace.com', 'Laika / TGRS and QNFO: comparing notes on research navigation', 'Hello,

I came across The Global Research Space through your weekly edition for 2-8 November, and then Laika. The map of 10M+ recent papers, with Laika bridging topical clusters to surface possible collaborations, is close to a problem I work on.

I run QNFO (qnfo.org), an independent, Cloudflare-native research publishing and analysis system. It continuously produces and indexes research papers and tracks which ones actually get read. I''m a one-person operation, so I''m interested in people building adjacent things rather than competing with them.

Two things I''d like to learn from you:
1. How you built the paper map (embedding and UMAP choices, OpenAlex coverage, refresh cadence) and what you''ve found hardest to keep accurate.
2. How you''re thinking about Laika''s cross-discipline matching, since that is the part I find most interesting.

Two things I could offer, if useful: QNFO''s papers as an additional, openly licensed corpus layer on your map, and measured feedback on which kinds of cross-field connections readers actually engage with.

Would a 20-minute call in the next couple of weeks work? If you''d rather start by email, I''m glad to send specifics first. And if Laika access is opening to early testers, I''d like to try it.

Thank you for your time.

Rowan Quni
QNFO, qnfo.org', 'partnership-outreach: TGRS Laika'
WHERE NOT EXISTS (SELECT 1 FROM outbound_queue WHERE to_addr='laika@globalresearchspace.com' AND purpose LIKE 'partnership-outreach:%');
