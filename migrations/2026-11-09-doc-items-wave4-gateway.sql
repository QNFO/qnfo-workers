-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE issue_triage SET close_evidence = NULL WHERE issue_id = 1002705 AND close_evidence LIKE 'DOC-ITEMS-WAVE4-GATEWAY-1:%';
-- CAUSE-MAPPED: no metric registered; disposition for DOC-GATE-1 issue 9769 (agent_issues 1002705)

-- DOC-ITEMS-WAVE4-GATEWAY-1. Read from ai_gateway_failures on 2026-11-09 (ts is epoch ms):
--   @cf/baai/bge-base-en-v1.5 status 429: 50831 cumulative rows, 0 in the last 24 h, last row 2026-10-17.
--   @cf/qwen/qwen2.5-coder-32b-instruct status 400: 27082 cumulative rows, 0 in the last 24 h, last row 2026-09-18.
-- Both classes are historic and not recurring; the qnfo-ai router downgrades and falls back per caller (BUDGET-SOFT-ROUTE-1, qnfo-ai 5.50.0).
UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-WAVE4-GATEWAY-1: (1) bge-base-en-v1.5 429s: cumulative 50831, last 24h 0, last occurrence 2026-10-17; capacity throttling is handled by qnfo-ai caller fallback and has not recurred. (2) qwen2.5-coder-32b-instruct 400s: cumulative 27082, last 24h 0, last occurrence 2026-09-18; no 400 has been logged since. Read from ai_gateway_failures 2026-11-09; no code left to write, ai_gateway_failures keeps measuring and a recurrence reopens through the gateway metric triggers.'
WHERE issue_id = 1002705 AND close_evidence IS NULL;
