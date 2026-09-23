# OPS-RUN-TO-COMPLETION-1 (qnfo-ops v2.15.0, 2026-09-12)

## Problem

A single natural-language prompt to `ops-exec` is supposed to be planned and executed
entirely server-side. In practice the sync agent loop (`POST /v1/chat/completions`) is
bounded by:

- `OPS_MAX_TOOL_ITERS` (default 30 tool rounds)
- `OPS_LOOP_DEADLINE_MS` (default 300000 ms soft budget)
- `OPS_MAX_ROUNDS` (default 90 model rounds)

When any bound is reached the loop injects `BUDGET_EXHAUSTED_DIRECTIVE`, forces a final
answer, and the model typically emits `INCOMPLETE: ...`. The job then **stopped** - the
remaining work was abandoned and the user had to type "continue". Same for the durable
`/v1/jobs` workflow: on budget exhaustion it finalized the job and stopped.

## Fix (server-side, no client change required)

1. **Sync auto-escalation.** When the sync loop ends with `bailReason` `tool-budget` or
   `deadline`, or the final content matches `INCOMPLETE:`, and at least one tool ran,
   the worker **automatically enqueues a durable continuation job** carrying the full
   conversation state (collected tool results included) plus
   `RUN_TO_COMPLETION_DIRECTIVE`. The response is appended with:
   `SERVER-SIDE CONTINUATION STARTED (no user action needed): job <id> (chain depth N/6)`.
2. **Workflow self-chaining.** `OpsExecWorkflow` applies the same test at job finalize
   time. Unfinished work enqueues a follow-up job, the current job is set to status
   `continuing`, and the continuation id is recorded in the response.
3. **Bounded chains.** `MAX_CHAIN_DEPTH = 6` per root request; `OPS_JOBS_DAILY_CAP`
   (default 200) still caps total jobs. Continuation payloads that exceed ~900 KB are
   compacted (first user message + last assistant answer + directive).
4. **Loop-lesson hardening.** Identical tool call (name + exact args) seen 3+ times in one
   sync run is not re-executed; the cached result is returned with an explicit
   "DUPLICATE CALL SUPPRESSED" nudge, so iterations cannot be burned on a repeat loop.

## Verification (2026-09-12, live)

| Probe | Result |
|---|---|
| `/health` | `2.15.0`, capabilities include `run-to-completion`, `self-chaining-jobs` |
| 5-step NL prompt (version + fleet count + D1 count + arithmetic + report) | 200, finish `stop`, correct combined report, ~13 s |
| Full-fleet audit NL prompt (probe every worker, table, oldest-5, coverage %) | 200, finish `stop`, complete table + coverage 18/55, ~133 s |
| Forced-INCOMPLETE probe | sync response carried `SERVER-SIDE CONTINUATION STARTED: job job-772fe9ff73b854 (chain depth 1/6)` - no user prompt needed |
| Async `POST /v1/jobs` | 202 queued -> `succeeded` with full evidence-bearing report |

## Contract

- Client contract is unchanged: OpenAI-compatible `POST /v1/chat/completions`.
- Callers that want the durable path up front may send `x-ops-async: 1` (or `x_ops_async: true`)
  and poll `GET /v1/jobs/<id>`.
- Do NOT lower the ceilings; route long work through the chain, never by shrinking settings.
