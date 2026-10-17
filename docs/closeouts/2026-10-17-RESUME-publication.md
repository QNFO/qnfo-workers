# PROMPT — Resume: unblock research publication (QNFO fleet)

Copy everything below this line into a new session.

---

## MISSION

The QNFO research pipeline completes work and publishes nothing. Restore publication, then
reduce waiting, then reach zero-past-SLA. Work from measurements, not assumptions; every claim
you make must be backed by a query result you ran in this session.

## STATE AT HANDOFF (verified 2026-10-17 20:05Z)

| item | value |
| --- | --- |
| `qnfo-research-exec` live | **0.18.29-verify-cycle-1** |
| `qnfo-code-orchestrator` live | **0.18.5-capability-grant-1** |
| research-exec cron | `*/15 * * * *`, `RUN_LOOP_BUDGET_MS` = 4 min |
| code-orchestrator cron | `*/2 * * * *` (owner override in `scripts/cron_rate_guard.py`) |
| `ops_config.research_parallel` | **24** (revert 12) |
| `ops_config.research_recover_max` | **3** (revert 6) |
| `ops_config.research_ready_cap` | 120 (leave alone: it only relabels deferred rows) |
| `ops_config.publish_quotas` | `{"papers.qnfo.org":24,"q08.org":10,"reading.q08.org":5}` |
| published today (`published_at >= date('now')`) | **8**, last at 16:36Z |
| `research_queue` | deferred 508, queued 55, researching 5, published 270, wontfix 32 |
| `research_queue` at `stage='publish'` | **0 — the core symptom** |

D1 handles: `qnfo-audit` = `35e2e573-92f3-46ac-83c6-22f6429fc5e5`;
`living-paper` = `70a58cb3-b2cd-498d-877f-ecca86859a22`. Both via the `d1_database_query` tool.

Repo: `C:\Users\LENOVO\Dev\qnfo-workers`. Deliver changes as a PR from a fresh
`chatbox/...` branch off `origin/main`; squash-merge; the deploy workflows then run.

## THE GATE CHAIN (four found; three fixed; ONE OPEN)

1. **Publish quota — FIXED.** `publishStageV2` defers when
   `COUNT(*) research_queue WHERE published_at >= today >= quota`. A bad reconcile had stamped
   `published_at = now` on 72 rows, making the count 80 against a quota of 24, so *every* publish
   deferred. Rows marked `error LIKE 'RECONCILE-IN-LINE-1%'` had `published_at` set back to NULL;
   count is 8 again. **Do not re-stamp `published_at` on reconciled rows.**
2. **Empty publish stage — LOCATED.** `stage='publish'` is written only at
   `worker.js:4231` and `:4358`, both after a passing verify.
3. **Cycle reset — FIXED (0.18.29).** `worker.js:4226` wrote `context={"cycles":0,...}` on every
   `verify->revise`, while every other edge (3716/3735/3753) preserved it, so
   `MAX_REVIEW_CYCLES=6` was unreachable. Now preserved.
4. **Verify gate — OPEN, this is the one.** Adjudications show **0 mismatches, 0 undecided**, and
   `script_no=5` (claims with no executable check). Plus one
   `verify-unrun cause=script-error detail=OverflowError: integer division`.

Read these before editing:
- `worker.js:4211` — `const gates2 = finalGates(paper, gateOpts);`
- `worker.js:4299` — the `verify-adjudication` log line (shows `script_no` is computed)
- `finalGates()` and `gateOpts` — **unknown whether `script_no` enters the verdict; determine this first**

## DECISION REQUIRED BEFORE ANY GATE EDIT

The owner has stated both "maintaining high quality" and "NO PARKING / MORE THROUGHPUT".
These conflict. Get one explicit answer:

> **"publish on 0 mismatches + 0 undecided; unscripted claims flag, do not block"** — yes or no.

If yes: gate on `mismatches`/`undecided` only, write `script_no` into provenance as a flag.
If no: the pipeline will keep withholding; do not attempt to circumvent it.

## DIAGNOSTICS (run these first, in order)

```sql
-- 1. Is anything at the publish stage? (0 = still blocked)
SELECT status, stage, COUNT(*) n FROM research_queue
WHERE status NOT IN ('published','wontfix') GROUP BY status, stage ORDER BY n DESC;

-- 2. Is output moving? (watch this rise above 8 after any fix)
SELECT COUNT(*) today_published, MAX(published_at) last
FROM research_queue WHERE published_at >= date('now');

-- 3. Why did verify refuse? (the gate's own words)
SELECT kind, COUNT(*) n, substr(MAX(text),1,160) sample FROM cloud_ops_events
WHERE job='qnfo-research-exec' AND ts > datetime('now','-24 hours')
  AND (kind LIKE '%verify%' OR kind LIKE '%unrun%' OR kind LIKE '%park%' OR kind LIKE '%gate%')
GROUP BY kind ORDER BY n DESC;

-- 4. Is the loop re-running? (rerun-route should FALL after fixes)
SELECT kind, COUNT(*) n, MAX(ts) last FROM cloud_ops_events
WHERE job='qnfo-research-exec' AND ts > datetime('now','-6 hours')
  AND kind IN ('revise-patch','revise-noop','rerun-route','review-unresolved','complete','poison-park')
GROUP BY kind ORDER BY n DESC;

-- 5. Cycle distribution — proof the cap is reachable now
SELECT substr(text, instr(text,'cycle=')+6, 2) cycle, COUNT(*) n FROM cloud_ops_events
WHERE kind='review-unresolved' AND ts > datetime('now','-3 days') GROUP BY cycle ORDER BY cycle+0;

-- 6. Flow balance
SELECT substr(created_at,1,10) day, COUNT(*) arrivals FROM research_queue
WHERE created_at > datetime('now','-14 days') GROUP BY day ORDER BY day DESC;
SELECT substr(published_at,1,10) day, COUNT(*) published FROM research_queue
WHERE published_at IS NOT NULL AND published_at > datetime('now','-14 days')
GROUP BY day ORDER BY day DESC;
```

## REMEDIATION ORDER (do not reorder)

1. Run diagnostics 1–6; record the numbers.
2. Read `finalGates` + `gateOpts`; determine whether `script_no` blocks.
3. Get the quality-policy answer above.
4. Fix the checker bug independently: `OverflowError: integer division` in the claim-script
   generator — a throwing checker currently counts as a failed claim.
5. Ship, verify `/health` version, then re-run diagnostic 2 and 1.
6. **Only after publication resumes**: raise throughput.
   - `publish_quotas["papers.qnfo.org"]` (24/day) is the hard ceiling — owner decision.
   - `RUN_LOOP_BUDGET_MS` 4→6 min is safe only with a per-stage timeout (code comment says
     4 min + p99 stage 10.5 min ≈ the 15-min wall).
   - `*/15`→`*/5` needs `TICK_CRON` + `CRON_TABLE` rework (shared with `paper-reviser` at `:30`
     every 4th hour and three errata jobs). Refactor, not config.
7. Then the separate backlog items: `issue_triage` (2732/2779 past SLA), DOI (#2846, 0/598 papers
   carry a DOI; 47 live only on `research_queue`), `REVISE-STRIDE-1` (#2847), and the admission
   bypass in `idea-hub` (its cap held **6 of 751** accepts — its fail-open `catch` is the suspect).

## PITFALLS THAT COST REAL TIME TONIGHT

- **A registered cron is not a firing cron.** `* * * * *` was accepted by the schedules API and
  `GET` showed it live, yet produced **zero invocations for 8 minutes**. Verify by a heartbeat
  write, never by the schedule object. Schedules PUT body must be `[{"cron":"..."}]` (else API
  error 10026). Schedules reconcile from `wrangler.toml` on deploy.
- **`agent_issues.created_at` is epoch milliseconds.** `julianday(created_at)` returns nonsense;
  use `datetime(created_at/1000,'unixepoch')`.
- **Do not use `status NOT IN ('closed','done','resolved')`** for "open" issues — it counts 349
  `wontfix` rows. The correct list includes `wontfix` and `cancelled`. `qnfo-fleet-dashboard` is
  already correct; ad-hoc SQL is what produced the false "527 open" figure.
- **Windows test harness:** `python3` is the Store stub; hardlink
  `Python312\python3.exe` → `python.exe` and prepend that dir to PATH. `node … > file` loses
  output through a PowerShell pipe — use `cmd /c "node … > %TEMP%\x.txt 2>&1"`. Four suites
  (`multi-file`, `no-eol`, `self-repair` A4, `fail-signature-stop`) fail identically on
  `origin/main` (git-apply CRLF) — compare against a `git worktree` baseline before calling
  anything a regression.
- **A concurrent actor is editing this checkout and deploying.** It pushed one commit straight
  to `main` without its follow-up and deployed `0.18.5` mid-session. `git fetch` and branch from
  `origin/main` immediately before pushing; check `git reflog` on a rejected push.
- **`review-unresolved` ids (`H1..Hn`) are positional, not identities.** Same-looking ids across
  cycles do not prove the same finding.

## DEFINITION OF DONE

- `stage='publish'` is non-empty and `published_at >= date('now')` rises above 8.
- `rerun-route` and `revise-patch` fall while `published` rises.
- Cycle distribution shows values above 3 (proof the cap terminates work).
- No row is parked solely because a checker threw.
- State the count you observed, not the mechanism you expected.

## PRIOR ARTIFACTS

`docs/closeouts/2026-10-17-tick-throughput-closeout.md` (parts 1 and 2);
server-side handoffs `mem:task_outcome:1792265447186:fc5a39f9` and
`mem:task_outcome:1792266890987:ea65a8d7`; issues #2846, #2847;
PRs #1371, #1374, #1378, #1382, #1384, #1387, #1390, #1392.
