-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_11_09_MERGE_ALL_AUTO_1';
-- spof-review: no new cron, trigger, binding, host or credential; one ops_config row recording the directive.
-- MERGE-ALL-AUTO-1 (2026-11-09, charter pillar autonomy): owner directive recorded for machines; the rule text lives in CLAUDE.md and AGENTS.md.
-- CAUSE-MAPPED: no metric is registered here.
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_11_09_MERGE_ALL_AUTO_1',
  '{"id":"MERGE-ALL-AUTO-1","directive_verbatim":"You shall always merge all code changes automatically. Update all system/fleet instructions and merge all open PRs immediately","recorded":"2026-11-09","limits":["harness permission checks","secret lock","live work claims","HOLD comments","GitHub-enforced required checks"]}',
  'Owner directive 2026-11-09: sessions and loops merge every open code change as soon as GitHub accepts it; CLAUDE.md and AGENTS.md carry the rule.');
