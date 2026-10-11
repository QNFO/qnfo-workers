-- ZENODO-EXIT-RETIRED-1 (2026-10-11, pillar autonomy; owner directives 2026-10-10 NO-ZENODO-DOI-0 (#2273) and 2026-10-11 "always
-- automatically audit and remediate all issues, failure modes, open items, and root causes").
-- v_stuck_summary.zenodo_exit_pending_stalled read 13 at 08:20Z, part of stuck_items_over_sla 70: thirteen zenodo_exit_ledger rows
-- sit at status pending for a recovery runner that PR 887 removed under NO-ZENODO-DOI-0, so nothing will ever process them and the
-- stuck count can never fall. They are set to retired (the row, DOI and timestamps are kept; only the status changes), which is
-- their true state. 914 rows are already terminal (inhouse 164, metadata-only 750).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE zenodo_exit_ledger SET status = 'pending' WHERE status = 'retired'

UPDATE zenodo_exit_ledger SET status = 'retired' WHERE status = 'pending';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'a queue item whose processor was retired on purpose is retired, not stuck', 'ZENODO-EXIT-RETIRED-1: 13 pending zenodo_exit_ledger rows set retired', 'v_stuck_summary 2026-10-11 08:20Z zenodo_exit_pending_stalled 13; scripts/zenodo_exit_runner.py removed by PR 887 (NO-ZENODO-DOI-0)', 'stuck_items_over_sla falls by 13', '13 ledger rows', 'the Rollback line', 'none (state correction)', 'zenodo_exit_pending_stalled reads 0 at the next 10-minute tick', NULL, 'D1'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'ZENODO-EXIT-RETIRED-1%');
