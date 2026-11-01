-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = '12', updated_at = datetime('now') WHERE key = 'errata_confirm_max' AND value = '20';

UPDATE ops_config
SET value = '20',
    updated_at = datetime('now')
WHERE key = 'errata_confirm_max'
  AND value = '12';
