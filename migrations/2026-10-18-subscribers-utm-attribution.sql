-- SUBSCRIBE-UTM-ATTRIBUTION-1 (owner directive 2026-10-18, pillar reach): capture the UTM source
-- and campaign that drove a sign-up, so a reader who clicked a tagged digest/paper link can be
-- attributed to a subscription (closes the UTM-CLICK-LEDGER-1 -> subscriber conversion loop).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: ALTER TABLE subscribers DROP COLUMN utm_campaign; ALTER TABLE subscribers DROP COLUMN utm_source;
-- SUBSCRIBERS-ATTRIBUTION-CHAIN-1 (agent_issues 2899, QNFO/qnfo-workers#2489): this file had no APPLY-BY header, so
-- apply_migrations.py skipped it and qnfo-audit.subscribers never gained the columns the Sunday cron selects. It was never
-- applied, so adding the header is safe. The runner tolerates a duplicate column, so a sign-up that already ran the worker's
-- lazy ALTER (ensureSubscriberUtm) does not fail it.
-- NOT NULL DEFAULT '' backfills existing rows without a rewrite.
ALTER TABLE subscribers ADD COLUMN utm_source TEXT NOT NULL DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_campaign TEXT NOT NULL DEFAULT '';
