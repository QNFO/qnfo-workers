-- MIGRATION-RUNNER-1 (2026-10-06, pillar autonomy, transformation lever T5.3): the first migration applied by CI, not by
-- a session. .github/workflows/apply-migrations.yml runs scripts/apply_migrations.py on the push that merges this file and
-- records the run in qnfo-audit.migration_runs; if this row set reads landed, the runner works end to end on Cloudflare D1.
-- It also records SUITE-RUNNER-1 (levers T1.10 and T5.4, PR 683): every suite of a changed worker runs on every PR and
-- the full set runs for control-plane and shared changes. Idempotent (a second run changes nothing).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE transformation_levers SET status = 'pending', landed_at = NULL WHERE (tp = 5 AND n IN (3, 4)) OR (tp = 1 AND n = 10);

UPDATE transformation_levers
SET status = 'landed',
    landed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    note = COALESCE(note || ' | ', '') || 'landed by its own migration: applied by ci:apply-migrations (MIGRATION-RUNNER-1, scripts/apply_migrations.py); merged migrations that carry -- APPLY-BY: ci apply themselves and are recorded in migration_runs',
    updated_at = datetime('now')
WHERE tp = 5 AND n = 3 AND status <> 'landed';

UPDATE transformation_levers
SET status = 'landed',
    landed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    note = COALESCE(note || ' | ', '') || 'SUITE-RUNNER-1 (PR 683): scripts/run-suites.mjs runs every suite of a changed worker on every PR and the full set for control-plane and shared changes; 19 orphan suites joined (3 radar-hub suites had been failing on main)',
    updated_at = datetime('now')
WHERE ((tp = 1 AND n = 10) OR (tp = 5 AND n = 4)) AND status <> 'landed';
