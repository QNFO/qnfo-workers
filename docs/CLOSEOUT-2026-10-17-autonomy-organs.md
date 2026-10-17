# CLOSEOUT — 2026-10-17 — autonomy organs (EVOLVE-1) and the planner starvation

Author: Chatbox agent session, owner directive "the system must be endogenous and 100% autonomous".
Window: 2026-10-17 15:59Z → 19:30Z.
Status: **shipped and live; one hypothesis refuted; two governance ceilings left to the owner.**

---

## 1. What the session set out to do

The owner's report: *"The system is not updating itself unless it is being actively worked on by a
third-party agentic code LLM. Nothing happens."*

Diagnosis at 15:59Z, from the fleet's own tables (not from opinion):

| Signal | Value at 15:59Z |
|---|---|
| `code_tasks`, 14 days | 39 merged / 71 failed / 40 closed (≈28 % success) |
| `issue_plans`, lifetime | 6 `queued` vs 128 `not-code`, 14 refused |
| Dominant refusal | **67×** "the issue names no worker the code loop may change" |
| Open issues vs farmable | 169 open, **25** carrying a `code-task:` line |
| Workers with cron | 24 of 29 — scheduling was never the gap |

Two hardcoded ceilings in `qnfo-code-orchestrator` were named as the root cause:

1. **`DENY_PATH`** blocks `.github/`, `wrangler.toml`, `deploy-targets.txt`, `.env` — the loop can
   patch existing files and can never create a new worker, cron, route module or binding.
2. **`PLAN_DENY_WORKERS`** (= `PLAN_CONTROL_PLANE` minus `PLAN_LOOP_CANARIED`) excludes
   `fleet-control`, `ops`, `deploy-guard`, `containers-pilot`, `autonomy-scorer`, `observability`,
   `code-orchestrator`, `code-agent` — the system cannot improve the machinery that decides what it
   may do.

Both remain. Neither was opened (see §6).

---

## 2. What shipped

### 2.1 `qnfo-evolve` — EVOLVE-1 (new worker, live 2026-10-17T17:08:29Z)

The missing organ: nothing read the fleet's own gap registers and turned them into work.

Each tick (cron `2,17,32,47 * * * *`):

1. reads `v_process_path_gaps` and `v_dod_spof_gaps`;
2. keeps only gaps whose owning worker is nameable (`evolve_targets`, seeded from
   `process_contracts`, so a new contract is targeted with no code change);
3. files at most **2** issues per tick, at most **5** open, each naming the live worker, the file, the
   reproduction SQL and a **query-based definition of done**;
4. re-runs each probe and **closes the issue itself** when it returns 0 rows.

Tables (`migrations/2026-10-17-evolve-organ.sql`, applied by the CI runner):
`evolve_targets` (50 rows), `evolve_filings`, `evolve_runs`.

Filed work, first two ticks:

| Issue | Gap | Owner worker |
|---|---|---|
| #2834 | `queue:research-head-stalled` has < 2 live paths | `qnfo-research-exec` |
| #2838 | `qnfo-research-exec single executor` = NO-ALTERNATE-PATH | `qnfo-research-exec` |
| #2839 | `GitHub Actions` = ALTERNATE-NEVER-TESTED | `qnfo-cloud-ops` |

`#2835` was filed and **retracted** — see §2.3.

### 2.2 The ceiling, made visible (0.1.1+)

Gaps owned by a `PLAN_DENY_WORKERS` member are now **counted and reported**, never filed, in
`evolve_runs.detail.blocked_control_plane`. Current blocked set, every tick:

```
qnfo-code-orchestrator:queue:code-task-stalled
qnfo-fleet-control:queue:issue-unremediated
qnfo-fleet-control:GitHub token (worker secrets)
```

The fleet now states, every 15 minutes, that it cannot fix its own improvement machinery.

### 2.3 WIP-RECOVERY-1 (0.2.0) — the second exit from a full queue

`qnfo-code-orchestrator` refuses to plan while `PLAN_WIP` unfinished tasks exist, and the queue could
only drain by a task **succeeding**. One exit is a doctrine defect (`SLA-AND-PATHS-1`).

Proved live at 17:32:35Z: WIP 7 ≥ ceiling 6 → parked `ct_md3mbqste1k69f` (7 attempts) and
`ct_n2igiu2craoa` (6) as `failed`, **after** writing each full row to `ops_config`
(`code_tasks--bak-<id>-<date>`) with its restore statement. Guardrails: ≥6 attempts, ≥10 min without
movement, ≤2 per tick, inert below the ceiling, `WHERE status='queued'` so it cannot clobber a task
another actor moved.

0.2.2: the ceiling is read from `ops_config.evolve_wip_ceiling` (seeded 12) **because the other
session raised `PLAN_WIP` 6 → 12 mid-session (0.18.2)**; a hardcoded copy would have parked work the
loop wanted.

### 2.4 Orchestrator 0.18.3 — `PLAN-RESERVE-1` (PR #1376, merged, live 18:01:03Z, superseded 18:11Z)

Lanes stop at `budget − 15 s` so `planIssues()` gets a reserved slice. Merged with a green gate.

**It did not fix planning.** See §3. It also exposed a deploy trap: `deploy-code-orchestrator` fails
`CONTENT-DRIFT-IMPORT-SOT` unless `qnfo-code-orchestrator/deployed-current.worker.js` is regenerated
in the same change, and a mirror-only commit does not fire the workflow — `workflow_dispatch` does.

### 2.5 Data written (reversible)

| Key / table | Change |
|---|---|
| `ops_config.code_merge_trusted_sources` | `+ ,qnfo-evolve|EVOLVE-1` (undo: remove token) |
| `ops_config.evolve_wip_ceiling` | `12` |
| `service_registry` | `+ qnfo-evolve` (live, cron:15m, d1:qnfo-audit) |
| `spof_registry` | `+ 'qnfo-evolve cron'` with its tested second path (`POST /tick`) |

---

## 3. The hypothesis that was refuted — read this before touching the planner

Claim on the table at 17:50Z: *the lanes consume the tick budget and the plan step, which runs after
them, never executes.* Evidence for it was sound: `fleet_tick` landing every 10 min, `code_tasks`
moving every minute, WIP below `PLAN_WIP`, daily cap headroom (3/8), 40 candidates available, and
`issue_plans` frozen at **15:21:02Z**.

`PLAN-RESERVE-1` was deployed at **18:01:03Z**. Between 18:01 and 18:11 — while 0.18.3 was live —
**zero** plans were recorded. Another session then shipped **0.18.4 `PLAN-METRIC-ATTR-1`** at 18:11:24Z
and moved the cron to `*/2`. Planning resumed at **18:14:47Z**.

**Conclusion: the reserve was necessary in principle and insufficient in fact. The unlock was 0.18.4.**
A 15 s slice cannot host a step that makes its own 20–40 s model call; and whatever 0.18.4 unlocked
was a separate gate. Do not credit §2.4 with the recovery, and do not assume a budget slice is a
sufficient design for planning.

---

## 4. Live state at closeout (19:29Z)

| Signal | Value | Reading |
|---|---|---|
| `issue_plans` last | 18:23:34Z (2 rows since 18:00) | planning alive |
| `fleet_tick` (orchestrator) | 19:20:59Z | ticking |
| `code_tasks` last movement | 19:28:55Z | loop working |
| WIP | 1 (ceiling 12) | healthy |
| `ct_tsjrxnm06e59qt` | `ready_to_publish` @ 19:18 | builder produced a change |
| Orchestrator live cron | `*/2 * * * *` (set 18:11:59Z) | 0.18.2's cadence, retuned |
| `qnfo-evolve` cron | `2,17,32,47` (set 16:58:01Z) | every 15 min, ticks 1–10 all recorded |
| EVOLVE-1 filings | 3 open, 0 closed by probe | no gap has been fixed yet, so the auto-close path is **tested offline only, never exercised live** |
| `blocked_control_plane` | 3 every tick | ceiling visible, unchanged |

---

## 5. Open items, with owners

1. **EVOLVE-1's work is not being farmed yet.** #2834/#2838/#2839 sit behind ~40 older candidates
   ordered by priority then id; at ~2 plans/hour they are ≈20 h out. Options: `evolve_targets` can
   file at `high`, or the planner's ordering can prefer `qnfo-evolve|EVOLVE-1`. Owner:
   `qnfo-code-orchestrator` (planning order) — currently **denied to the loop**.
2. **The auto-close path has never fired live.** No gap has been fixed since the organ shipped. The
   first real closure is the proof that matters and it is still outstanding.
3. **Three control-plane gaps are permanently unfiled** by design. Fixing them needs §6.
4. **`deployed-current` mirrors are a manual step** for every orchestrator change — a silent trap
   found the hard way (§2.4).

---

## 6. Decisions still held by the owner (deliberately not taken)

- Opening `DENY_PATH` so the fleet can create workers/crons/route modules — i.e. new capability.
- Opening `PLAN_DENY_WORKERS` so the fleet can improve the code that governs the fleet, under the
  canary + auto-revert machinery that already protects `qnfo-ai` and `qnfo-gateway`.

Neither is a small change: both let the machine rewrite its own constraints, on a deploy path that
was red for unrelated reasons for part of this session. Without them, "new killer apps" and
"the system improves how it improves" remain impossible by construction, and everything else in this
document is maintenance of a loop whose shape is fixed.

---

## 7. Rollback

| Change | Undo |
|---|---|
| `qnfo-evolve` worker | delete from `deploy-targets.txt`, delete the worker; `evolve_*` tables are inert |
| EVOLVE-1 filings | `UPDATE evolve_filings SET state='closed'`; issues are ordinary `agent_issues` rows |
| WIP-RECOVERY-1 parking | `UPDATE code_tasks SET status='queued' WHERE id='<id>'` (id in the backup note) |
| 0.18.3 reserve | revert PR #1376 (superseded by 0.18.4 anyway) |
| trust row | remove `,qnfo-evolve|EVOLVE-1` from `ops_config.code_merge_trusted_sources` |

---

## 8. For the next agent

- Read `qwav`/`qnfo` memory first; this file plus `docs/SLA-AND-PATHS-1.md` carry the doctrine.
- **Do not** hardcode a constant that also exists in `qnfo-code-orchestrator`; read it from
  `ops_config`. `PLAN_WIP` moved 6 → 12 inside one hour today.
- **Do not** merge an orchestrator change without regenerating `deployed-current.worker.js`.
- **Do not** assume a green `gate` means the change is live: it proves the source is acceptable, not
  that Cloudflare accepted the create. The deploy log is the authority (`0/1 ok` is a real outcome —
  CF `10068`/`100329`: a D1 binding requires an **ES module** worker).
- Measure before claiming: three of this session's five assertions about *why* the loop was idle were
  wrong until the table was read.
