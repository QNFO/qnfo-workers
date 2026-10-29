-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key IN ('docs_only_incomplete','OWNER_DIRECTIVE_2026_10_29_DOCS_ONLY_INCOMPLETE_1');
-- DOCS-ONLY-INCOMPLETE-1 (2026-10-29, pillar autonomy): qnfo-fleet-control 0.58.0 refuses to merge a pull request that changes only documentation.
-- The setting is read by the stale-PR lane every tick; 'off' lets the lane merge docs-only pull requests again.
INSERT OR REPLACE INTO ops_config (key, value) VALUES ('docs_only_incomplete', 'on');
INSERT OR REPLACE INTO ops_config (key, value) VALUES ('OWNER_DIRECTIVE_2026_10_29_DOCS_ONLY_INCOMPLETE_1', 'Rowan 2026-10-29 12:34Z: "Documentation needs to be affected in code changes. If it''s not in code, it doesn''t do anything." A docs-only pull request is incomplete; the lane and the code loop send it back to be implemented in code.');
