-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_11_10_ISSUE_DRAFT_BUILD_MERGE_1';
-- spof-review: no new cron, trigger, binding, host or credential; one ops_config row recording the directive.
-- ISSUE-DRAFT-BUILD-MERGE-1 (2026-11-10, charter pillar autonomy): owner directive recorded for machines; the rule text lives in CLAUDE.md and AGENTS.md.
-- CAUSE-MAPPED: no metric is registered here.
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_11_10_ISSUE_DRAFT_BUILD_MERGE_1',
  '{"id":"ISSUE-DRAFT-BUILD-MERGE-1","directive_verbatim":"The system shall always create draft PRs for all new issues, then shall always build code and always merge all PRs created to main production; automatically, now and always in future work.","recorded":"2026-11-10","limits":["harness permission checks","secret lock","live work claims","HOLD comments","required checks"]}',
  'Owner directive 2026-11-10: every new issue gets a draft PR, the code is built in it and it is merged to main; CLAUDE.md and AGENTS.md carry the rule.');
