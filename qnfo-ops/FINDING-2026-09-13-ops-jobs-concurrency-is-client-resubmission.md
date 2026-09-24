# FINDING — 2026-09-13 — the ops job fan-out is client re-submission, not a server loop

Author: qnfo-ops (ops endpoint), autonomous. All figures are live `ops_jobs`
queries at 2026-09-13T14:45Z.

## Measured

`ops_jobs` totals: **160 succeeded, 40 cancelled, 8 failed, 4 running, 3
continuing** (215 rows). **7 non-terminal at once.** In the trailing 30 minutes:
**69 jobs created across 6 distinct prompt prefixes.**

Trailing 60 minutes, grouped by the first 42 characters of the user message
inside `payload`:

| prompt prefix | jobs |
|---|---|
| `AUDIT AND FIX ALL FLEET ERRORS, WARNINGS, A…` | **42** |
| `\n\n<ATTACHMENT_FILE>\n<FILE_INDEX>1</FILE_…` | 24 |
| `https://ideas.qnfo.org/#/s/t-qnfo-is-an-ai-…` | 17 |
| `reasoning models with a separate reasoning_…` | 14 |
| `PLEXUS BETWEN P-ADIC, MULTIPLICATIVE NUMBERS…` | 7 |
| `WHETHER A LONG MATH EXPRESSION THAT REDUCES…` | **6** |
| `WHAT'S THE BIG PICTURE? WHAT'S THE ACTION P…` | 6 |
| `Articulate the vision, strategy and archite…` | 1 |

## What this means

The fan-out is **not** a server-side loop emitting work. It is a client
re-submitting the same prompts. One prompt — `AUDIT AND FIX ALL FLEET ERRORS…`
— was dispatched **42 times in an hour**, each instance a full tool-enabled
agent with D1 write access, each independently auditing the fleet and filing
issues. That is the sufficient cause of the 108-row hour in `agent_issues`
(issue 784). No amount of deduplication at the ledger fixes it; the work has to
be refused *before* it becomes a job.

The philosophical prompt `WHETHER A LONG MATH EXPRESSION…` was dispatched **6
times in the same hour**, one of them still `running`
(`job-ec77b712654549858f8600275d4f9cba`, created 14:40:06Z). This session is one
of those instances, and its siblings are concurrent agents.

## The control that is missing, and why it is not applied

`ops_jobs` has no idempotency key. The staged migration
`sql/2026-09-13-ops-jobs-terminal-and-chain.sql` adds `idem_key` and
`idx_ops_jobs_idem` and is marked **NOT APPLIED** — correctly, because the column
does nothing until the worker populates it.

The DB-level control that *would* work without a deploy is an expression index
over the payload prefix, restricted to non-terminal rows:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_jobs_inflight_prompt
  ON ops_jobs(substr(payload,1,200))
  WHERE status IN ('running','continuing','queued');
```

**It cannot be created right now.** The 7 currently non-terminal rows already
contain three duplicate pairs — 2 × `reasoning models with…`, 2 ×
`<ATTACHMENT_FILE>…`, 2 × `AUDIT AND FIX ALL FLEET…` — so SQLite refuses the
index. Clearing them means cancelling live jobs, and **one of those live jobs is
this session.** Cancelling it would abort the turn producing this file. That is
a self-referential hazard worth recording: an endpoint asked to fix a
concurrency defect is itself one of the concurrent processes, and the
straightforward remediation would kill the remediation.

Ordered remediation for an actor that is not inside the fan-out:

1. Let the current non-terminal set drain (a mass-cancel already fires
   periodically — 4 rows share `updated_at = 2026-09-13T14:41:28Z`).
2. Create `idx_ops_jobs_inflight_prompt` as above.
3. Deploy the worker-side idempotency key so a duplicate submission returns the
   existing job id instead of erroring.

## Limitation

The 42 / 24 / 17 / 14 counts are per 60 minutes and derived from a 42-character
prefix of the user message. Two genuinely different requests that share those 42
characters would be conflated. For the `AUDIT AND FIX ALL FLEET ERRORS` prefix
that is a safe assumption; for the shorter attachment prefix it is weaker. The
counts establish repeated dispatch; they do not establish that every repetition
was byte-identical.
