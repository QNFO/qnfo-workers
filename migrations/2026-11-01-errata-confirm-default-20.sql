-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = '12', note = substr(note, instr(note, '; ') + 2), updated_at = datetime('now') WHERE key = 'errata_confirm_max' AND value = '20' AND instr(note, 'ERRATA-CONFIRM-COST-2: default 20 rows; ') = 1

UPDATE ops_config
SET value = '20',
    note = 'ERRATA-CONFIRM-COST-2: default 20 rows; ' || COALESCE(note, ''),
    updated_at = datetime('now')
WHERE key = 'errata_confirm_max'
  AND value = '12'
  AND note LIKE 'BREACH-SELFHEAL-1 / ERRATA-CONFIRM-COST-1:%';
