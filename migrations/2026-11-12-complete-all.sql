-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_11_12_COMPLETE_ALL_1';
-- spof-review: no new cron, trigger, binding, host or credential; one ops_config row recording the directive.
-- COMPLETE-ALL-1 (2026-11-12, charter pillar autonomy): text lives in agent-bootstrap.md (session procedure step 5).
-- CAUSE-MAPPED: no metric is registered here.
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_11_12_COMPLETE_ALL_1',
  '{"id":"COMPLETE-ALL-1","directive_verbatim":"You shall always complete all work and automatically resolve all threads and sessions.","recorded":"2026-11-12","limits":["IC-GATE-001","harness permission checks","secret lock","live work claims"]}',
  'Owner directive 2026-11-12: every session resolves its review threads, merges or fixes its PRs, closes its issues with evidence and leaves no item open.');
