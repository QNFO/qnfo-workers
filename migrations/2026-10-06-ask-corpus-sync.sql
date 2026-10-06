-- ASK-CORPUS-FEEDER-1 (qnfo-ai-search 2.2.8, agent_issues 2029, charter pillar research).
-- The AI Search instance qnfo-corpus is filled only through qnfo-ai-search POST /ingest, and nothing called it after
-- 2026-08-11 (newest item timestamp 1786515360000); on 2026-10-06 none of the 22 golden papers was retrievable by vector
-- search. The feeder (an hourly leg of the existing ASK-LOOP cron, kind 'corpus-sync') uploads published papers the
-- index lacks and records each one here: one row per slug, status 'uploaded' or 'error', the paper version it uploaded
-- (a new version is uploaded again), and the error text. No upload happens while a fleet_budget ai_spend cap is breached.
-- Remediation contract issue-2029 reads this table, so it was created empty on 2026-10-06T07:42Z (D1 qnfo-audit) before
-- the worker shipped; the worker's ensureAskSchema runs the same statement. Additive: no data is changed or removed.
-- Rollback: DROP TABLE ask_corpus_sync (the feeder recreates it and re-uploads; contract issue-2029 then reads pending).
CREATE TABLE IF NOT EXISTS ask_corpus_sync (
  slug TEXT PRIMARY KEY,
  ingested_at TEXT NOT NULL,
  bytes INTEGER,
  source_version TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  error TEXT
);
