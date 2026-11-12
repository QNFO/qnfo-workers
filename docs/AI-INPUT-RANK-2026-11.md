# AI input-token ranking (AI-INPUT-CUT-1, agent_issues 1001691)
Source: `qnfo-audit.v_ai_input_rank_7d` (migrations/2026-11-12-ai-input-rank.sql), window 2026-11-05..2026-11-12. Baselines: `ai_input_baseline`.

| worker | calls | in_tok | in/call | neurons | owner of the cut |
|---|---|---|---|---|---|
| qnfo-research-exec | 3809 | 73.2M | 19205 | 2.42M | TOKEN-CUT-1 |
| qnfo-agents | 4861 | 22.4M | 4605 | 0.51M | AGENTS-INPUT-CUT-1 (#7273) |
| qnfo-code-orchestrator (ladder) | 2562 | 18.6M | 7249 | 2.78M | queued (file claimed by the code loop) |
| personal-companion | 2818 | 13.9M | 4944 | 1.53M | open: factcheck re-asks an unchanged draft on purpose, so a verdict cache was rejected (verify.test.mjs fails); next lever is shorter ground (code-task filed) |
| qnfo-paper-reviser (binding) | 295 | 9.1M | 30892 | 0.38M | folded into research-exec; queued |

Re-read: `SELECT * FROM v_ai_input_rank_7d LIMIT 10;`. Verify after 48 h: factcheck `in_tok/calls` for personal-companion vs baseline 5811 (prediction <= 5300).
