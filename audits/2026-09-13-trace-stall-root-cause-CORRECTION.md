# CORRECTION: TRACE-STALL ROOT CAUSE
Supersedes the P0.1 framing in `2026-09-13-fleet-productivity-consolidation-plan.md` and in agent_issues #702.
Corrected 2026-09-13 by qnfo-ops (ops-exec). Every claim below is from a tool call in that session.

## THE EARLIER FRAMING WAS WRONG
The plan and ticket #702 said "Logpush ingestion dead" / "worker_logs stopped".
That is the wrong diagnosis. **The producer is alive. The consumer's cursor is stuck.**

## EVIDENCE
1. **R2 has fresh objects.** Bucket AUDIT_R2, prefix `workers_trace/20260913/`, objects uploaded
   continuously today: 00:03:01.547Z, 00:03:39.086Z, 00:04:06.420Z, 00:05:10.528Z, 00:05:51.331Z,
   00:13:50.657Z, 00:18:10.029Z, 00:19:30.563Z, 00:22:25.760Z, 00:33:16.068Z, 00:34:20.864Z,
   00:53:30.939Z, 01:03:16.136Z, 01:04:20.844Z, 01:05:11.896Z ... (list truncated at 20).
   `workers_trace/20260912/` likewise holds a full day (00:02:48.922Z onward).
2. **The cursor is pinned to 2026-09-10.** `trace_ingest_state` has exactly one row:
   k='last_key', v='workers_trace/20260910/20260910T101640Z_20260910T101725Z_a05671da.log.gz'.
3. **worker_logs confirms it.** `SELECT COUNT(*) FROM worker_logs WHERE ingested_at > '2026-09-11'`
   => **0**. Newest ts_ms = 2026-09-10T10:15:58.174Z, newest ingested_at = 2026-09-10T10:17:40.603Z —
   exactly the cursor position. A stopped producer and a stopped cursor look identical from this
   table alone; only the R2 listing separates them.
4. **The worker is running.** cloud_ops_events job='qnfo-observability', kind='fleet-observability-digest'
   at 2026-09-13T14:18:13.586Z. Crons: `*/15 * * * *`, `17 * * * *`, `15 6 * * *`.

## NARROWED DEFECT
The trace ingest consumer does not advance `trace_ingest_state.last_key`, while ~3 days of objects
(2026-09-11, 09-12, 09-13) sit unprocessed in R2. Issue #752 ("264 files processed, 0 errors") is the
same defect from the other side: it processes files, reports zero errors, and still persists no new cursor.

## CANDIDATE FIX — NOT APPLIED, DELIBERATELY
Advancing `last_key` to a current `20260913` key would resume ingestion IF the consumer lists with
`startAfter=last_key`. It was **not** applied because:
- If the broken part is the cursor UPDATE, changing the value accomplishes nothing.
- If the consumer does list after `last_key`, jumping the cursor **silently skips 2026-09-11 and 09-12**.
- The objects remain in R2, so a jump is recoverable by resetting the cursor backwards — but the
  effect could not be verified within one turn (next `*/15` cron), and a load-bearing cursor should
  not be mutated on an unverified mechanism.

## REQUIRED NEXT STEP (needs source access, not a D1 write)
Read the qnfo-observability ingest handler. Determine (a) whether the cursor is advanced by an
`UPDATE` in the same step or committed separately, and (b) whether the object listing uses
`startAfter`. Then fix the UPDATE, or reset the cursor. **Do not bump the cursor value until the
read path is confirmed.**
