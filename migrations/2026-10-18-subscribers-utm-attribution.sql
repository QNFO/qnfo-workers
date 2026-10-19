-- SUBSCRIBE-UTM-ATTRIBUTION-1 (owner directive 2026-10-18, pillar reach): capture the UTM source
-- and campaign that drove a sign-up, so a reader who clicked a tagged digest/paper link can be
-- attributed to a subscription (closes the UTM-CLICK-LEDGER-1 -> subscriber conversion loop).
-- NOT NULL DEFAULT '' backfills existing rows without a rewrite.
ALTER TABLE subscribers ADD COLUMN utm_source TEXT NOT NULL DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_campaign TEXT NOT NULL DEFAULT '';
