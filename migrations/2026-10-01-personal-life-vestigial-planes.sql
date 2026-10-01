-- TARGET DB: personal-life (e8d6c61a-10b7-4086-b81e-9e6e85afa407). PERSONAL-VESTIGIAL-PLANES-1 (2026-10-01).
-- Resolves #935 PERSONAL-MEMORY-MAINTAIN-NOOP-POST-909 and the queries half of #938 PERSONAL-TELEMETRY-PLANES-INERT.
--
-- agent_memories / memory_maintain_runs (#935). The writer, qnfo-twin-maintain, was merged into personal-api on
-- 2026-09-13 (worker_removals id 2) and last ran on 2026-09-18:
--   - 31 runs, all with scanned = pruned = deduped = 0;
--   - agent_memories holds 0 rows here.
-- Memory maintenance lives in qnfo-lifecycle and runs against qnfo-graph.agent_memories (QNFO_GRAPH binding).
-- No live worker reads or writes the personal-life copies, and no view or trigger depends on them. The empty table is
-- dropped, and the run log is kept under an _archived name as evidence.
--
-- queries (#938). The per-request log holds 86 rows, the last one 2026-09-13T18:02Z. No code in the repository has
-- ever written it; the writer was a pre-repository build. personal-api's per-request telemetry is the AI Gateway
-- caller metadata (4.1.15-aig-caller-meta) plus the chat table. The log is archived, so its absence of new rows is
-- not mistaken for an outage.
--
-- The proactive_signals half of #938 is fixed in code (personal-api 4.1.17, PROACTIVE-SIGNALS-CONSUMER-1).
-- Applied live.
DROP TABLE IF EXISTS agent_memories;
ALTER TABLE memory_maintain_runs RENAME TO memory_maintain_runs_archived_20260918;
ALTER TABLE queries RENAME TO queries_archived_20260913;
