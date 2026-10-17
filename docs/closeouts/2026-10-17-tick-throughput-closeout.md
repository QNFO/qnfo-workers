# Closeout — code-loop throughput and the two backlogs (2026-10-17)

Owner directives this thread, in order:

1. "FLEET WORKFLOWS/PIPELINES ARE NOT MOVING FAST ENOUGH … MAKE TICKS FASTER AND ACCELERATE SLAs FOR EACH AND EVERY STEP/PROCESS WITH MULTIPLE REDUNDANT PATHS TO DEFINITION-OF-DONE SUCCESS"
2. "MORE PARALLEL WORKERS, FASTER TICKS, MORE THROUGHPUT/OUTPUT/RESOLVED"
3. "WHAT OTHER MEASURES CAN RESOLVE BACKLOG AND CONTENT PUBLICATION FASTER?"
4. "IMPLEMENT AND DEPLOY ALL REMEDIATION, ALL MEASURES"

Everything below is measured from `qnfo-audit` (D1 `35e2e573-…`) and `living-paper` (D1 `70a58cb3-…`) unless marked unverified.

---

## 1. What was actually slow

| measurement | value |
| --- | --- |
| distinct code tasks touched per 10-minute bucket, 8 consecutive buckets before the change | **1** |
| steps allowed per tick | 16 |
| queued tasks, all at step `propose` | 7, for 22–50 minutes each |
| 14-day time-to-merge | 70–650 minutes |

Cause: the tick ran one step at a time and awaited it, so a single `propose` model call consumed the whole 40 s budget. The loop was not short of ticks — it was serial.

## 2. Shipped, deployed, verified

| version | change | verified by |
| --- | --- | --- |
| `0.18.0-sla-paths-accel-1` / `0.18.1-claim-threshold-1` | 4 concurrent lanes; waits compressed (round backoff 1h/2h → 5m/15m, timeout 10m → 2m, claim-held 20m → 2m, claim park 30m → 4m, intake cooldown 120m → 30m, no-progress ceiling 180m → 45m); `STEP_SLA_MIN` {read 10, propose 20, verify 15, commit 10} with `slaSweep()` releasing a stale lease (event `code-task.sla-unstick`) | `/health`; test-loop 4-task/all-`pr_open` case |
| `0.18.2-lanes-8-1` | cron `*/10` → `*/2` under a **named owner override**; `TICK_LANES` 8; `MAX_OPEN_TASKS` 48; intake 8/tick; `PLAN_WIP` 12; `SINGLE-FLIGHT-1` (`loop_lock`); `SPEND-CAP-1` (`ops_config code_loop_daily_calls`, default 1500) | schedules API `*/2`; `fleet_heartbeat` version + 2-minute cadence |
| `0.18.4-plan-metric-attr-1` | `PLAN-METRIC-OWNER-ATTR-1` (metric_registry owner attribution); `PLAN_DAILY_CAP` 8 → 24; carries the concurrent `PLAN-RESERVE-1` (15 s of each tick reserved for planning) | planner produced its first `issue_plans` row in ~3 h at 18:14:47 |

`scripts/cron_rate_guard.py` gained `OWNER_OVERRIDES` (worker, owner's words, date) feeding both `audit_repo` and `deploy_gate.cron_rate_gate`; every run prints `OVERRIDE` / `NOTE`. `docs/CRON-RATE-CEILING-1.md` §7 records the exception. No other worker is exempt.

**Throughput, measured after deploy** (distinct tasks touched per hour): 15:00 → 1, 17:00 → 2, 18:00 → 4, 19:00 → 5.

**Three-hour window at closeout:** 17 code tasks created — 11 failed, 4 merged, 1 queued, 1 `ready_to_publish`. Pace ≈ 136 tasks/day against a 14-day baseline of ~10/day.

**Spend:** 2026-10-16 $0.35 → 2026-10-17 $1.198 (3.4×). The daily cap was never reached (`with_model` = 4 of 24).

## 3. Lessons that cost real time (do not relearn these)

- **A registered cron is not a firing cron.** `* * * * *` was accepted by `PUT …/schedules` and `GET` showed it live; it produced **zero invocations for eight minutes** — the loop was off while every "is it deployed?" check said yes. `*/2` fired within 90 s. Verify delivery by a **heartbeat write**, never by the schedule object.
- **Schedules are reconciled from the repo on deploy.** Live drifted to `*/10` for weeks because `wrangler.toml` said `*/10`; after the repo matched, the 18:11 deploy re-applied the trigger itself.
- **The schedules PUT body is an array of objects**: `[{"cron":"*/2 * * * *"}]`. A bare string array or `{crons:[…]}` returns API error 10026.
- **Windows test harness**: `python3` is the Store stub, so the suite dies at the first python verify. A same-folder hardlink `Python312\python3.exe → python.exe` plus that directory prepended to PATH fixes it. `node … > file` through a PowerShell pipe loses output — use `cmd /c "node … > %TEMP%\x.txt 2>&1"`. The 4 remaining local failures (`multi-file`, `no-eol` ×113, `self-repair` A4, `fail-signature-stop` summary) are git-apply CRLF artefacts and are identical on `origin/main`.
- **`agent_issues.created_at` is epoch milliseconds**, not a date string. `julianday(created_at)` silently returns nonsense; use `datetime(created_at/1000,'unixepoch')`.
- **A concurrent actor edits this checkout.** Twice: it added `PLAN-RESERVE-1` mid-session, and it pushed one of these commits straight to `main` (bb562f9e) without its follow-up, leaving `main` inconsistent for ~4 minutes. Always `git fetch` and branch from `origin/main` immediately before pushing; check `git reflog` when a push is rejected.

## 4. Corrections to earlier numbers in this thread

| claim | correction |
| --- | --- |
| "527 open issues" | **188**. 349 rows are `wontfix` (terminal). `qnfo-fleet-dashboard` already excludes them correctly — the error came from ad-hoc `status NOT IN ('closed','done','resolved')` queries. **No product bug; only bad analysis.** |
| "151 of 198 published lack a DOI" | Worse: **all 598** published rows in `living-paper.papers` have `doi` NULL. The 47 came from `research_queue`, which holds a DOI the `papers` row never received. |
| "raise `research_ready_cap`" | **Withdrawn.** `qnfo-fleet-control` caps `status='queued'` at ~3 h of throughput; raising it only relabels `deferred` rows. It drains nothing. |

## 5. Open — with the evidence needed to finish

1. **Attribution is deployed but UNPROVEN.** Since the 18:11 deploy the planner made 2 decisions (last 18:23), **none attributed**. `PLAN_DAILY_CAP` is not the blocker (4 of 24 used). Next query: `SELECT id, substr(description,1,80) FROM agent_issues WHERE status='open' AND source='qnfo-fleet-control' AND description LIKE '%code-task:%'` — if the metric-trigger issues carry a `code-task:` line, they are excluded from the planner by design and attribution can never fire; they go through `intakeIssues` instead.
2. **Failure rate is now 11 of 17 in the window (65%)** against 39 merged / 71 failed (55%) on 14 days. Faster lanes burn failures faster; this is the dominant cost and the top priority.
3. **`issue_triage`: 2732 of 2779 rows past `sla_due_at` (98%).** Untouched this thread. It is the issue pipeline's SLA, not the code loop's.
4. **Open issues rose 188 → 204** while this work ran: the fleet files faster than anything closes.
5. **#2846 `DOI-RECONCILE-1`**, **#2847 `REVISE-STRIDE-1`** — filed with definition-of-done, carrying `code-task:` lines so they enter by intake.
6. `SPEND-CAP-1` default is 1500 model calls/day; raise `ops_config code_loop_daily_calls` to change it without a deploy.

## 6. State at closeout

- `qnfo-code-orchestrator` live: `0.18.4-plan-metric-attr-1`; cron `*/2`; 8 lanes; `loop_lock` single-flight; spend cap armed.
- PRs merged: #1371, #1374, #1378, #1382, #1384. #1366 closed as superseded.
- Tests: 23 of 27 orchestrator suites clean locally; the 4 failures are byte-identical on `origin/main` under Windows.
- Spend today: $1.198 for the code loop.
