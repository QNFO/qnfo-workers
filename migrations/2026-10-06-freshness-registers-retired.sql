-- FRESHNESS-REGISTERS-RETIRED-1 (2026-10-06, agent_issues #2028, charter pillar: autonomy).
--
-- qnfo-autonomy-scorer grades ooda_observe and s2_coordination from freshness_guard (fresh / total). On 2026-10-06T06:48Z
-- the table held 17 registers, 13 fresh, 4 stale. Three of the rows measured nothing any more:
--   kaizen            kaizen_candidates last 2026-09-27; qnfo-kaizen was retired in PR 657, so the register could never be
--                     fresh again (a permanent 1/17 penalty with no actuator);
--   vault_notes_index mode filed-by-ops, checked_at 2026-09-29, no writer since (orphan);
--   handoffs          checked_at 2026-09-29, read "fresh" from a 34 h age computed a week earlier (orphan, inflating).
-- Removing a register that nothing measures is not a weakening of the guard: the remaining 14 are all written by the
-- folded prober in qnfo-ai-calibration (SIGNALS) on every tick. The writer-side change (drop the kaizen tuple so the row
-- does not come back; version_queue becomes an event register with a 336 h window; amh_coverage counts only models a
-- fleet worker routes) is the code task on #2028 against qnfo-ai-calibration/worker.js.
--
-- APPLIED 2026-10-06T07:10Z to qnfo-audit by session_01ECGThLZjUCXYH4EdsUTUiB through the D1 query API, in this order.
-- Backup first (3 rows, with a backed_up_reason column), then a guarded delete that runs only when the backup holds 3 rows.
CREATE TABLE IF NOT EXISTS freshness_guard_bak_20261006 AS
  SELECT *, 'FRESHNESS-REGISTERS-RETIRED-1 2026-10-06 session_01ECGThLZjUCXYH4EdsUTUiB: dead register (kaizen: worker retired PR 657; vault_notes_index and handoffs: no writer since 2026-09-29)' AS backed_up_reason
  FROM freshness_guard WHERE signal IN ('kaizen','vault_notes_index','handoffs');
DELETE FROM freshness_guard
 WHERE signal IN ('kaizen','vault_notes_index','handoffs')
   AND (SELECT COUNT(*) FROM freshness_guard_bak_20261006 WHERE signal IN ('kaizen','vault_notes_index','handoffs')) = 3;

-- ROLLBACK (restores the three rows exactly as backed up):
-- INSERT OR REPLACE INTO freshness_guard (signal, table_name, ts_column, max_ts, age_hours, threshold_hours, status, checked_at, mode)
--   SELECT signal, table_name, ts_column, max_ts, age_hours, threshold_hours, status, checked_at, mode FROM freshness_guard_bak_20261006;
--
-- Definition of done: freshness_guard has 14 rows, none with a retired writer; the next qnfo-autonomy-scorer run reads
-- ooda_observe from fresh/14 (expected 13/14 = 4.6 until amh_coverage is re-based by the code task).
