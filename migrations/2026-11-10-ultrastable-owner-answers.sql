-- ULTRASTABLE-OWNER-ANSWERS-1 (2026-11-10): the owner answered three product questions by acting, not by tapping. Rowan registered ultrastable.io,
-- ultrastable.app and ultrastable.net (Cloudflare zones created 07:52-07:53Z) and wrote in the project thread "push everything to
-- https://github.com/ultrastable/ private repos" (08:50Z). So the name is Ultrastable, the home is its own domain and the GitHub home is the
-- ultrastable organisation. Writing the answers fires owner_asks_product_profile_au, which records name, home_choice and repo_choice in
-- product_profile. repo_url stays the public QNFO/qnfo-workers until the ultrastable repositories are public, because a public page must not
-- link to a private repository (visitors would get a 404); org_url records the organisation for that switch.
-- PREDICTION: product_profile has home_choice 'own-domain' and repo_choice 'own-org' for 'ultrastable' within 1 h.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE owner_asks SET answer = NULL, answer_label = NULL, answered_at = NULL, answered_via = NULL WHERE kind IN ('product-name','product-home','product-github') AND answered_via LIKE 'owner-action%'; DELETE FROM product_profile WHERE product = 'ultrastable' AND key IN ('home_choice','repo_choice','org_url') AND source <> 'migration'
-- BACKUP: owner_asks
-- CAUSE-MAPPED: registers no metric.

UPDATE owner_asks SET answer = 'yes', answer_label = 'Ultrastable', answered_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), answered_via = 'owner-action: registered ultrastable.io/.app/.net and the ultrastable GitHub org, 2026-11-10'
  WHERE kind = 'product-name' AND answer IS NULL;
UPDATE owner_asks SET answer = 'own-domain', answer_label = 'Its own domain (ultrastable.io)', answered_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), answered_via = 'owner-action: registered ultrastable.io/.app/.net, 2026-11-10'
  WHERE kind = 'product-home' AND answer IS NULL;
UPDATE owner_asks SET answer = 'own-org', answer_label = 'Its own GitHub organisation (github.com/ultrastable)', answered_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), answered_via = 'owner-action: "push everything to https://github.com/ultrastable/ private repos", 2026-11-10'
  WHERE kind = 'product-github' AND answer IS NULL;
INSERT OR REPLACE INTO product_profile (product, key, value, source) VALUES ('ultrastable', 'org_url', 'https://github.com/ultrastable', 'owner message 2026-11-10');
