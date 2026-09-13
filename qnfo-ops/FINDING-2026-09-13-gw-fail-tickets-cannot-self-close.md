# FINDING — the `[gw-fail]` / `MODEL-DEGRADED` tickets cannot self-close (double-blocked backlog)

Date: 2026-09-13
Author: qnfo-ops (ops-exec session, 07:16–07:30Z)
Status: **root cause identified for the stuck backlog; closer predicate INFERRED, not read**
Evidence: all figures are live `ops_d1_query` returns from this session

---

## 1. The observation

The open backlog has been stuck at 25 all day. Two independent mechanisms block it, and
**neither is the other's cause**:

| blocker | mechanism | verified? |
|---|---|---|
| **A — drain is a no-op** | `qnfo-backlog-exec` v1.2.6 only auto-closes rows whose re-probe PASSes; these rows have no probe target | **verified**: `ops_issue_run(confirm:true)` → processed 25, **closed 0**, rechecked 25, escalated 0, every row `note:"no probe target"` |
| **B — the close predicate is unsatisfiable** | the 24h-window "no failures" condition can never be met, because the failure table is append-only and always holds ~315 rows in-window | **premise verified**; the predicate itself is **inferred** (source unreadable — see §4) |

Blocker A is documented in earlier artifacts. **Blocker B is the new finding.**

## 2. Evidence for blocker B

`ai_gateway_failures`, live:

| metric | value |
|---|---|
| total rows | **2515** |
| distinct `ts` (sweeps) | **385** |
| first sweep | 2026-09-05T07:30:52.537Z |
| last sweep | 2026-09-13T07:00:44.934Z (0.29 h before the query) |
| span | 7.979 days |
| sweeps/day | **48.25** |
| cadence | **29.8 min** |
| rows/sweep | **6.53** |
| **rows in any 24 h window** | **≈ 315** |

Computed from the above (`run_code`, exact):

```
spanDays 7.979 | sweepsPerDay 48.25 | cadence 29.8 min | rowsPerSweep 6.53
estRowsIn24hWindow 315
```

**Consequence.** Any predicate of the form `COUNT(*) FROM ai_gateway_failures WHERE ts > now - 24h`
returns ≈315, not 0. A ticket whose close condition is "no gateway failures in the last 24 h"
**can never satisfy it**. The table is append-only: it grows by ~6.5 rows every 29.8 minutes and
nothing prunes it.

Schema (verified via `pragma_table_info`):
`id, ts, model, status, count, error_class, sample_detail, source`.
There is **no `fail_count` column** — a per-row `count` exists, but nothing aggregates a
"currently failing" state that could reach zero.

### Per-model rows (live)

| model | rows | sweeps | rows/sweep |
|---|---|---|---|
| `@cf/zai-org/glm-5.2` | **615** | 385 | **1.60** |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | 385 | 385 | 1.00 |
| `@cf/moonshotai/kimi-k2.6` | 385 | 385 | 1.00 |
| `@cf/google/gemma-4-26b-a4b-it` | 384 | 384 | 1.00 |
| `@cf/baai/bge-base-en-v1.5` | 384 | 384 | 1.00 |
| `@cf/qwen/qwen3.8-27b` | 324 | 324 | 1.00 |
| `@cf/moonshotai/kimi-k2.7-code` | 38 | 38 | 1.00 |

**Secondary defect (B5a):** `glm-5.2` writes **1.60 rows per sweep** — 230 rows in excess of one
per sweep. Every other model is exactly 1.00. This is a duplicate-write bug in the sweep writer
for that model, and it inflates `glm-5.2`'s failure signal by ~60%. Earlier artifacts reported
"611/613 duplicate rows"; the correct figure is **615 total, 230 excess**.

## 3. Which open tickets are affected

Of the **25** open issues (live: high 11, medium 13, low 1):

| category | n | blocked by |
|---|---|---|
| `ai-calibration` (`[gw-fail]`, `[ai-cal]`) | 10 | B (and A) |
| `model-health` (`MODEL-DEGRADED`) | 10 | B (and A) |
| `research-pipeline` (`TERMINAL research failure`) | 2 | neither — genuine pipeline defects |
| `infra` (`HTTP-5XX-ELEVATED`) | 1 | A |
| `fleet-self-improve` (`SOCIAL-CHECKER-FAILOPEN`) | 1 | neither |
| `backlog` (`OPEN-ISSUES-BACKLOG`) | 1 | bookkeeping row |

**~20 of 25 open rows are structurally unable to close.** The backlog is not a queue of
unfinished work; it is mostly a ratchet.

Example: ids 654–660 were created 2026-09-11T13:30:46–56Z and are still open ~42 h later.

## 4. What is verified vs. inferred

**Verified by direct observation:** the table's append-only growth, the sweep cadence, the
≈315-rows-in-24h arithmetic, the absence of a `fail_count` column, the 1.60 rows/sweep anomaly
for `glm-5.2`, the drain closing 0 of 25, and the ticket ages.

**Inferred, NOT verified:** that the closer predicate is specifically "zero failures in 24 h".
The closer's source was not read — `qnfo-ops/worker.js` is 161,339 bytes and every read route
caps below that (`github_repo_read` 32,768; `web_fetch` 30,000 — both verified this session, no
bypass found). **A different, equally plausible explanation is that no closer exists for these
categories at all.** The two are not distinguished by the evidence in hand. What *is* established
is that no mechanism has closed them in 42 h despite the underlying table being continuously
appended.

## 5. Recommended fixes

1. **Make the close condition state-based, not event-count-based.** Track a per-model
   `currently_failing` flag (updated per sweep) and close the ticket when the flag clears —
   a condition that *can* reach a terminal value. Counting append-only events cannot.
2. **Or scope the predicate to the model in the ticket title**, not the whole table: a ticket
   for `glm-5.2` should test `glm-5.2`'s latest sweep, not global failure volume.
3. **Fix the `glm-5.2` duplicate write** (B5a) — dedupe on `(model, ts)` in the sweep writer.
   This is independent of the closer and reduces false degradation signal.
4. **Prune or roll up `ai_gateway_failures`** so the table is not unbounded (2515 rows in 8 days
   = ~115k rows/year at current cadence).
5. **Second issue store is unmanaged:** `issue_ledger` holds **open 288 / resolved 21 /
   acknowledged 1 = 310** rows and **no ops tool covers it**. It grew from 270 open to 288 open
   since the previous session's reading. Whatever triages it is not visible from qnfo-ops.

## 6. Related artifact hazard — `deployed-current.worker.js` is not current

`qnfo-ops/deployed-current.worker.js` (sha `110261ac3aeaa1124fdbfc8967707610faeea827`) is
**VERSION 2.13.0, 157,399 bytes**, while the live `qnfo-ops/worker.js` is **VERSION 2.14.0,
161,339 bytes** (sha `cf9bb72e0b4e9a9f98343ea296cf9ae55dff0d13`).

A file named "deployed-current" is two revisions stale. Anyone using it as the patch base would
patch the wrong version. Either refresh it on deploy or rename it to
`deployed-2026-09-XX.worker.js`.

## 7. Related

- `docs/FIX-telemetry-hours-2026-09-12.md` — separate live defect (B1), same worker
- `docs/FIX-listIssues-await-2026-09-08.md` — defect NOT reproducible as of 2026-09-13
- Workspace: `ops-workspace/audits/2026-09-13-REDTEAM-CORRECTIONS-live.md`,
  `ops-workspace/audits/2026-09-13-REDTEAM-EXECUTED-corrections-and-commits.md`
