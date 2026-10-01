-- REACH-SIGNALS-INGEST-1 (#1711, 2026-10-01). docs/STRATEGY.md 6.2: one schema for every reach signal.
--
-- qnfo-fleet-dashboard 1.7.48 creates both tables idempotently at runtime (same DDL as REACH_DDL in its worker.js)
-- on its first daily ingest, so applying this file by hand is optional and safe to repeat.
--
-- reach_signals: one row per (date, source, channel, entity_type, entity_id, metric). Phase 1 writers (dashboard cron,
-- once per UTC day after 02:00Z, for the previous complete UTC day):
--   cf-rum / web       site "(all)", paper <slug>, page <host><path>, referrer <host or "(direct)">  pageviews  unknown
--   zenodo / zenodo    doi <doi>  views (unknown), downloads (bot when downloads/views > 3, else unknown)
--   openalex / openalex doi <doi>  citations  human
--   bluesky / bluesky  post <at-uri>  likes, reposts, replies  human
--   qnfo-subscribers / email  list qnfo  confirmed_subscribers  human
--   email / email      campaign research-outreach  sent, followup, replied  unknown (trailing 14 days rewritten)
-- A source that cannot be read writes nothing; the run is logged in cloud_ops_events (id reach-ingest-<day>).
-- entity_map: slug -> doi (zenodo_doi || doi, lowercased) and page_url from living-paper; utm_campaign, post_uri and
-- buffer_id are for POST-ID-UTM-1.

CREATE TABLE IF NOT EXISTS reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT CHECK (quality IN ('human','bot','unknown')), collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));

CREATE TABLE IF NOT EXISTS entity_map (slug TEXT PRIMARY KEY, doi TEXT, page_url TEXT, utm_campaign TEXT, post_uri TEXT, buffer_id TEXT, updated_at TEXT);
