-- ULTRASTABLE-CREATOR-LINK-1 (owner, 2026-11-10: "link the two now for increased exposure"; my personal brand stays mine, the platform is what gets branded):
-- (1) product_profile holds the platform's public identity (name, home, repository, who directs it and their links). qnfo.org/platform (qnfo-gateway 3.65.0)
--     renders the credit and the schema.org author from these rows, so a change is one row, not a deploy.
-- (2) three prompted-recall questions on fleet.qnfo.org/focus (where the product lives, its GitHub home, a public credit) join the five asked earlier.
-- (3) owner_asks_product_profile_au applies an answer to product_profile at once. It writes only product_profile, which has no triggers, so it stays far
--     inside D1's trigger depth (the earlier agent_issues trigger failed there, MIGRATION-APPLY-FAILED-1, 2026-11-10).
-- PREDICTION: product_profile rows for 'ultrastable' >= 8 within 1 h; qnfo.org/platform contains "Directed by Rowan Brad Quni-Gudzinas" within 2 h.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS owner_asks_product_profile_au; DROP TABLE IF EXISTS product_profile
-- Rollback note: the three owner_asks rows stay as the record of what was asked.
-- CAUSE-MAPPED: registers no metric.
-- spof-review: the gateway falls back to built-in defaults when product_profile cannot be read, so the page never depends on this table.

CREATE TABLE IF NOT EXISTS product_profile (product TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'migration',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), PRIMARY KEY (product, key));
INSERT OR IGNORE INTO product_profile (product, key, value) VALUES
('ultrastable', 'name', 'Ultrastable'),
('ultrastable', 'home_url', 'https://qnfo.org/platform'),
('ultrastable', 'repo_url', 'https://github.com/QNFO/qnfo-workers'),
('ultrastable', 'creator_name', 'Rowan Brad Quni-Gudzinas'),
('ultrastable', 'creator_role', 'Directed by'),
('ultrastable', 'creator_title', 'systems researcher studying autonomous AI systems'),
('ultrastable', 'creator_url', 'https://rwnq8.github.io/'),
('ultrastable', 'creator_same_as', 'https://orcid.org/0009-0002-4317-5604 https://github.com/rwnq8 https://www.linkedin.com/in/rowan-quni https://qnfo.org/about'),
('ultrastable', 'credit_visible', '1');

INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority, created_at) VALUES
('fleet', 'product-home', 'platform-home@2026-11-10',
 'Keep qnfo.org/platform as the platform''s home page for now?',
 'Today the platform lives at qnfo.org/platform, linked from your site, GitHub profile and CV. A domain of its own needs the domain card (ultrastable-domain-1) first.',
 '[{"key":"qnfo","label":"Yes, qnfo.org/platform for now"},{"key":"own-domain","label":"Move it to its own domain once bought"},{"key":"unsure","label":"Not sure"}]',
 1, strftime('%Y-%m-%dT%H:%M:%SZ','now')),
('fleet', 'product-github', 'platform-github@2026-11-10',
 'Where should the platform''s code live on GitHub?',
 'Today it is in QNFO/qnfo-workers, split into core, app and personal parts by product/boundary.json. A separate organisation needs the GitHub card (ultrastable-github-org-1).',
 '[{"key":"qnfo","label":"Stay in QNFO/qnfo-workers for now"},{"key":"own-org","label":"Its own GitHub organisation"},{"key":"unsure","label":"Not sure"}]',
 2, strftime('%Y-%m-%dT%H:%M:%SZ','now')),
('fleet', 'product-credit-public', 'platform-credit@2026-11-10',
 'Show "Directed by Rowan Brad Quni-Gudzinas, systems researcher" on the platform page, linking to your site?',
 'It already shows, linked to rwnq8.github.io, ORCID, GitHub and LinkedIn, so your name travels with the platform. "No" takes it off.',
 '[{"key":"yes","label":"Yes, show my name"},{"key":"no","label":"No, leave my name off"},{"key":"unsure","label":"Not sure"}]',
 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

CREATE TRIGGER IF NOT EXISTS owner_asks_product_profile_au AFTER UPDATE OF answer ON owner_asks
WHEN NEW.kind IN ('product-name', 'product-design-credit', 'product-home', 'product-github', 'product-credit-public') AND NEW.answer IS NOT NULL AND NEW.answer != 'unsure'
  AND (OLD.answer IS NULL OR OLD.answer != NEW.answer)
BEGIN
  INSERT OR REPLACE INTO product_profile (product, key, value, source, updated_at)
  SELECT 'ultrastable', k, v, 'owner_asks ' || NEW.id, strftime('%Y-%m-%dT%H:%M:%SZ','now') FROM (
    SELECT 'name' AS k, CASE NEW.answer WHEN 'yes' THEN 'Ultrastable' WHEN 'homeostat' THEN 'Homeostat' WHEN 'qnfo' THEN 'the QNFO platform' END AS v WHERE NEW.kind = 'product-name'
    UNION ALL SELECT 'creator_role', CASE NEW.answer WHEN 'yes' THEN 'Designed and directed by' ELSE 'Directed by' END WHERE NEW.kind = 'product-design-credit'
    UNION ALL SELECT 'home_choice', NEW.answer WHERE NEW.kind = 'product-home'
    UNION ALL SELECT 'repo_choice', NEW.answer WHERE NEW.kind = 'product-github'
    UNION ALL SELECT 'credit_visible', CASE NEW.answer WHEN 'no' THEN '0' ELSE '1' END WHERE NEW.kind = 'product-credit-public'
  ) WHERE v IS NOT NULL;
END;
