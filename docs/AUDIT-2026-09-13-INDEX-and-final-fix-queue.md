# READ FIRST — Fleet error audit, 2026-09-13: consolidated position and final fix queue

This is the entry point. The audit is spread over nine documents, and **three of
my own claims were retracted across revisions** — a reader who opens only the
main audit will see advice that would cause a production outage. Read this file
first, then follow the links only for the raw evidence.

---

## 1. Documents, in order

| # | file | what it adds |
|---|---|---|
| 1 | `AUDIT-2026-09-13-fleet-errors-warnings-alerts.md` | The main audit. **Rev 2.** Its FIX-1 is struck — see §2. |
| 2 | `…-REV3-deploy-plane-source-verified.md` | Corrects the deployer identity; source-verifies the comparator; adds the `direction`-never-read defect. |
| 3 | `…-REV4-masked-failure-class.md` | `v2-drain`: 40 failures recorded as `ok`. Corrected from an inflated 1,215. |
| 4 | `…-REV5-integration-monitor-and-register.md` | `integration_state` dead since 09-11; identifies `task_dod_register`. |
| 5 | `…-REV6-fleet-audit-runs.md` | `fleet_audit_runs` — the highest-signal table, missed by the main audit. |
| 6 | `…-REV7-fabric-wave.md` | **Hypothesis refuted by REV8.** Kept for the residual facts in §4. |
| 7 | `…-REV8-refutations.md` | Refutes REV7; corrects REV6's `deployed_at`; names my root-cause error. |
| 8 | `…-REV9-unsorted-sample-reaudit.md` | Re-audits unsorted samples; `fleet_error_state` is volatile. |

---

## 2. DO NOT DO THIS

**Do not apply the main audit's FIX-1** — *"export the Workflow class from the
deployed bundle entrypoint"* for `personal-companion`.

That failure is the only thing preventing an hourly downgrade of a live
`v1.1.0` worker to `1.0.0`. Verified: `auto_heal=1`, `enabled=1` (set
2026-09-08 16:25:49), deploy target `1.0.0`, production `v1.1.0`. A prior finding
on that worker is titled `DO-NOT-FIX-10021`.

**Do not normalise the `fabric-20260910` label first.** REV7 argued it was a
deploy-wave marker; REV8 refuted that (0 rows in `fleet_deploys` on 09-10, 1 in
`deployment_history`). It is an unexplained 29-worker build tag. Normalising it
destroys the only fleet-wide record of what changed on 09-10.

---

## 3. Final fix queue

### Tier 0 — unblocks everything else

**F0. Disarm the deploy kill-switch.** Two rows, reversible, highest leverage.

```sql
UPDATE fleet_deploy_state
   SET value='0', updated_at=datetime('now')
 WHERE key IN ('auto_heal','enabled');
```

`fleet_deploy_state` has **only these two non-`scanerr` keys**, both `1` against
a README default of `0` (fail-closed), with 1,492 drift rows across 50 workers —
so the documented precondition ("do NOT enable auto_heal until canonical bundles
are synced ahead") is unmet.
**Blocker: this is a D1 write. qnfo-ops is SELECT/WITH only.**

### Tier 1 — code fixes, each independently deployable

| # | fix | owner | note |
|---|---|---|---|
| F1 | Comparator leading-`v` fix | `qnfo-fleet-control` | `version-compare.mjs` **committed, not live**; worker cannot self-deploy (`NO_SELF`) → needs manual `wrangler deploy` |
| F2 | Gate ensemble on non-empty src/bib context; cap `attempt` | `qnfo-research-exec` | fixes issues 687/688, ~192 criticals |
| F3 | Fix `deepseek-direct/models` probe assertion + digest | `qnfo-ai-calibration` | fails 1/28 **every** run |
| F4 | Make `gateway-sweep` fail on error thresholds | `qnfo-ai-calibration` | currently `pass` while listing `x42 content-shape` |
| F5 | Require measured counter before `degraded` | `qnfo-ai-calibration` | 5 of 10 probes frozen at 09-11T16:44 |
| F6 | workers.dev fetch → service binding | `qnfo-auditor-health` | CF error 1042, open since 09-12 |
| F7 | Bundle `fleet.js` | `qnfo-observability` | file exists; single-file deployer can't bundle it |
| F8 | Apply `apply-research-exec-fix.mjs` (NL + status default) | `qnfo-research-exec` | **will not clear the stall** — newest failures are Zenodo 504s |
| F9 | Correct the INTAKE-STALL label | `qnfo-signal-loop` | reads "stuck new", actual state `triaged_hold` |
| F10 | Unstick `version_queue` id 18 | jnl/zenodo publisher | issue 677 |

### Tier 2 — needs storage or DNS access

| # | fix | note |
|---|---|---|
| F11 | Rebuild + re-upload `r2:qnfo-canonical/qnfo-cloud-ops.js` | R2 write; the object is a `404:` tombstone |
| F12 | Bind custom domain or repoint health check | `qnfo-ai`/`personal-api` return **530** daily and **404** in `feedback_probes` |

### Tier 3 — investigate, do not yet fix

| # | question | why it matters |
|---|---|---|
| F13 | What stopped six jobs on 2026-09-10? (`briefing`, `radar`, `research-scan`, `outreach`, `email-triage`, `gmail-triage`) | It was **not a deploy** — 0 rows in `fleet_deploys` that day |
| F14 | Why did `integration_state` die at 2026-09-11T14:17:37Z? | The integration monitor is the fleet's own health reporter |
| F15 | What is `fabric-20260910`? | 29 workers share it; no deploy behind it |
| F16 | Why is the probe frozen for exactly 5 models? | all with non-zero gateway failures except `kimi-k2.6` |
| F17 | Reconcile 44 `scanerr:*` keys — **7 workers have no canonical** | `obsidian-writer`, `osf-integrity-check`, `personal-life-maintain`, `qnfo-arxiv-radar`, `qnfo-research-radar`, `qnfo-twin-maintain`, `research-daily-brief` |

---

## 4. Verified facts, strongest first

1. **`ops_issue_run` — the backlog drain — is itself broken** (`failing x11`, 24h,
   per `fleet_audit_runs`). `email_respond` failing 168h. `web_fetch x266`.
2. **Six scheduled jobs silent since 2026-09-10**, flagged `high` in two
   independent audit runs.
3. **`research-daily-brief`** is a coherent triple: no canonical, job silent
   since 09-10T06:30:45Z, daily `FAILED` emails (ids 708, 696).
4. **Deploys: 54 fail / 22 ok.** `personal-companion` 26/30 (do-not-fix),
   `qnfo-cloud-ops` 25/25, `qnfo-observability` 1/1.
5. **`direction` is computed and never read**; `POST /redeploy` bypasses
   `scan()`'s caller-side guard. **518 deployed-ahead rows across 18 workers**,
   including this auditor (`qnfo-ops` 2.15.7 vs canonical 2.15.6).
6. **`v2-drain`: 40 rows, `GROUP BY status` returns one row — `ok`.** 30 carry
   `"ok":false`. `NL is not defined` (19) + Zenodo 504s.
7. **Register = `task_dod_register`**: 99 open, 26 overdue — confirmed
   independently; the alert's `0 no-executor` means they have owners.
8. **`fleet_error_state` held 8 rows at 14:08Z and 0 rows at ~14:25Z** — a
   self-emptying error table cannot track persistent errors.
9. **44 `scanerr:*` keys**; `fleet_crons` is a **third roster** (6 rows).
10. **Clean surfaces:** `errata_queue` (2 terminal), `dead_links` (0),
    `calibration_register` (all future-dated).
11. **Positive:** the intake stall cleared mid-session — `intake_new`
    **496 → 0**, `triaged` **62 → 558**.

---

## 5. Retracted claims — do not cite these

| claim | where | status |
|---|---|---|
| export `GenerationFlow` | main audit FIX-1 | **withdrawn — causes a downgrade** |
| deployer is `qnfo-fleet-deploy` | main audit §1 | live deployer is `qnfo-fleet-control` |
| "1,215 masked rows, fleet-wide" | REV4 draft | **30 rows, one stream** |
| "real backlog is 305, not 3" | REV6 draft | `issue_ledger` has **0 open** |
| "the two self-heal instruments disagree" | REV6 draft | they agree (`alreadyOpen: 7`) |
| "`deployed_at` is an open fix" | REV6 §2 | **already applied 2026-09-10T17:44:08** |
| "`fabric-20260910` is a deploy wave" | REV7 | **refuted by REV8** |
| "`fleet_error_state`: 8 workers with errors" | main audit §7 | **does not reproduce** |

---

## 6. The one process lesson

**Four of my eight errors came from `LIMIT` without `ORDER BY`.** In time-series
tables that returns insertion order, not recency — so I read the oldest rows and
reported them as current. It produced a phantom bug (REV6), a stale window
(REV5), and a refuted hypothesis (REV7).

**Query rule for this fleet: always `ORDER BY <time column> DESC LIMIT n`.**

Corollary for triage: **`fleet_audit_runs` is the highest-signal table on this
fleet.** It retains per-run history and aggregates `alerts`, `selfheal`,
`gwfail`, `errata` and `issue_ledger` fingerprints. Query it first.

---

## 7. Actuators qnfo-ops does not have

No deploy, no D1 write, no R2 write/delete, no git ref creation. **Every fix
above is a specification.** F0 (the highest-leverage action) is a two-row D1
write. Nothing in this audit changed production.
