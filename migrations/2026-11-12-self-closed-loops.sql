-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_11_12_SELF_CLOSED_LOOPS_1';
-- spof-review: no new cron, trigger, binding, host or credential; one ops_config row recording the directive.
-- SELF-CLOSED-LOOPS-1 (2026-11-12, charter pillar autonomy): rule text lives in CLAUDE.md and AGENTS.md; scripts/self_closed_lint.py enforces it.
-- CAUSE-MAPPED: no metric is registered here.
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_11_12_SELF_CLOSED_LOOPS_1',
  '{"id":"SELF-CLOSED-LOOPS-1","directive_verbatim":"Never assume that anything is needed externally. Close all of your own code loops. Documents and memories are useless; everything must be executable by code. Do not assume anything will ever be reviewed. Stop creating documents and owner decisions that no loop consumes.","recorded":"2026-11-12","limits":["IC-GATE-001 (irreversible and identity-bound)","harness permission checks","secret lock","live work claims"]}',
  'Owner directive 2026-11-12: every output has a code consumer, every loop closes without a person, cross-repo fixes are made in the owning repository in the same session.');
