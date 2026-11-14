-- PROBE-TOKEN-OUTPUT-1, second pass (2026-11-14, charter pillar autonomy; PROBE-TOKEN-WRITE-GUARD-1 agent_issues 1003570 / GitHub #11929, filed by the consumer's new
-- free-text guard from PR 11904 on its first run). The probe-author-1 contract issue-1002458 (OWNER-TASK "Are outputs getting better?") returned
-- '3 surfaces worse, 3 unmeasured', a sentence the sink guard refuses as free-text-value on every pass. It now measures the same counts as one token.
-- The earlier file (2026-11-14-probe-author-tokens.sql) is not edited (MIGRATION-NO-CLOBBER-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261114_probe_author_tokens_2
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261114_probe_author_tokens_2 b WHERE b.class = remediation_contracts.class) WHERE class = 'issue-1002458';

CREATE TABLE IF NOT EXISTS bak_20261114_probe_author_tokens_2 AS SELECT class, verify_probe, attempts, last_verdict, next_due_at FROM remediation_contracts WHERE class = 'issue-1002458';

UPDATE remediation_contracts SET verify_probe = 'WITH s AS (SELECT surface, worse, verdict FROM v_output_quality_by_surface) SELECT ''worse:0:unmeasured:0'' AS expected, ''worse:'' || (SELECT COUNT(*) FROM s WHERE worse > 0) || '':unmeasured:'' || (SELECT COUNT(*) FROM s WHERE verdict = ''unmeasured'') AS observed',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1002458';
