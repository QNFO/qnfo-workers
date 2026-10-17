# qnfo-evolve — EVOLVE-1

The organ that turns the fleet's own structural gap registers into named work, and closes it when
the gap is gone.

## Why it exists

On 2026-10-17 the fleet's registers described their own violations and nothing acted on them:

| Register | What it already said |
|---|---|
| `v_process_path_gaps` | 3 steps whose only path reads `none automatic` — `research-head-stalled`, `code-task-stalled`, `issue-unremediated` |
| `v_dod_spof_gaps` | `qnfo-research-exec` = `NO-ALTERNATE-PATH`; `GitHub Actions` and `GitHub token` = `ALTERNATE-NEVER-TESTED` |

Both violate the owner doctrine `SLA-AND-PATHS-1`: every step has an SLA and at least two
independent paths to a successful definition of done.

Meanwhile the code loop was starving: 169 issues open, **25** carrying a `code-task:` line, and
**67 of 128** plans refused with *"the issue names no worker the code loop may change"*. The defect
was never a shortage of things to fix. It was that no component said **which worker** should fix them.

## What it does every 15 minutes

1. Reads `v_process_path_gaps` and `v_dod_spof_gaps`.
2. Keeps only gaps whose owning worker it can name from `evolve_targets`.
3. Files **at most 2** issues per tick, holding at most **5** open, each containing the live worker,
   the file, the reproduction SQL, and a definition of done that is a query result.
4. Re-runs each filing's probe; when it returns 0 rows, closes the issue itself with
   `close_channel = 'evolve-auto'` and records the closure.

The arc closed: **registered gap → named work → merged change → verified closure**, with no session
in the loop.

## What it will not do

- Never edits code, opens a PR, deploys, or changes a view. It writes `agent_issues` rows under its
  own source and its own three tables. A bug here files a bad issue; it cannot damage a worker.
- Never re-words a gap into something easier. If no owner can be named, it records the skip instead
  of filing the unplannable prose that starved the loop.
- Never floods. The per-tick and open-filing caps exist because the loop plans a handful of tasks a
  day, not a hundred.

## WIP-RECOVERY-1 (0.2.0): the second exit from a blocked planner

`qnfo-code-orchestrator` refuses to plan while `PLAN_WIP` (6) unfinished tasks exist. Measured
2026-10-17: 7 tasks queued, planner idle since 15:21Z, and the queue could only drain by a task
**succeeding** — which the builder was failing to do. One exit from a step is a doctrine defect, so
this worker supplies the other one:

- a task with **≥6 attempts** that has not moved for **≥10 minutes**, while the queue is blocked, is
  parked as `failed` with its full row backed up to `ops_config`;
- at most **2 per tick**, never while the queue is below the ceiling, never on a task that moved
  recently (it may be mid-attempt), and the update carries `WHERE status = 'queued'` so it cannot
  clobber a task another actor moved;
- restore is one statement, named in the backup note:
  `UPDATE code_tasks SET status='queued' WHERE id='<id>'`.

Nothing is deleted, and the issue behind a parked task is re-plannable inside the planner's 3-day
window.

## Surfaces

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | public | version, last run, counts |
| `GET /report` | public | last 20 filings, last 10 runs |
| `POST /tick` | `x-loop-token` when `LOOP_TOKEN` is set | run the tick now |

## Tables

- `evolve_targets` — register row → owning worker and file. Process rows are seeded from
  `process_contracts`, so a new contract is targeted with no code change.
- `evolve_filings` — one row per gap: issue id, probe, state. Keyed by a deterministic hash of
  `(kind, process, step)`, so a gap cannot be re-filed every tick.
- `evolve_runs` — one row per tick. A silent organ is a broken organ, so no rows is itself detectable.

## Tests

```bash
node qnfo-evolve/evolve.test.mjs   # 30 assertions, no network, no D1
```

The suite loads `worker.js` as one self-contained ES module (only `export default` is rewritten to a
local binding), because `canonical-deploy` PUTs `worker.js` verbatim — an `import` would ship as an
unresolved specifier. It must be a **module** worker, not service-worker syntax: creating a worker
with a D1 binding through the canonical path is refused as `100329` ("Binding 'AUDIT' of type 'd1'
requires a Worker written in ES module format"), and a service-worker script uploaded on the module
path fails as `10068` ("no registered event handlers").
