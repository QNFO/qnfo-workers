# READ FIRST — Fleet error audit, 2026-09-13: consolidated position and final fix queue

This is the entry point. The audit spans eleven documents, and **three of my own
claims were retracted and two headline findings qualified** across revisions — a
reader who opens only the main audit will see advice that would cause a
production outage. Read this file first, then follow the links only for the raw
evidence.

---

## 1. Documents, in order

| # | file | what it adds |
|---|---|---|
| 1 | `AUDIT-2026-09-13-fleet-errors-warnings-alerts.md` | The main audit. **Rev 2.** Its FIX-1 is struck — see §2. |
| 2 | `…-REV3-deploy-plane-source-verified.md` | Corrects the deployer identity; source-verifies the comparator; adds the `direction`-never-read defect. |
| 3 | `…-REV4-masked-failure-class.md` | `v2-drain`: 40 failures recorded as `ok`. Corrected from an inflated 1,215. |
| 4 | `…-REV5-integration-monitor-and-register.md` | `integration_state` dead since 09-11; identifies `task_dod_register`. |
| 5 | `…-REV6-fleet-audit-runs.md` | `fleet_audit_runs` — the highest-signal table, missed by the main audit. |
| 6 | `…-REV7-fabric-wave.md` | **Hypothesis refuted by REV8, replaced by REV10.** Kept for residual facts. |
| 7 | `…-REV8-refutations.md` | Refutes REV7; corrects REV6's `deployed_at`; names my root-cause error. |
| 8 | `…-REV9-unsorted-sample-reaudit.md` | Re-audits unsorted samples; `fleet_error_state` is volatile. |
| 9 | `…-REV10-merge-waves-and-registry.md` | Merge waves explain two silent jobs; registry drift; blocker confirmed from route tables. |
| 10 | `…-REV11-silent-jobs-dissolve.md` | **The six "silent jobs" largely dissolve; one real failure pinned to a stack trace.** |

---

## 2. DO NOT DO THIS

**Do not apply the main audit's FIX-1** — *"export the Workflow class from the
deployed bundle entrypoint"* for `personal-companion`. That failure is the only
thing preventing an hourly downgrade of a live `v1.1.0` worker to `1.0.0`.
Verified: `auto_heal=1`, `enabled=1`, deploy target `1.0.0`, production `v1.1.0`.
A prior finding on that worker is titled `DO-NOT-FIX-10021`.

**Do not trust the service registry for deploy decisions on
`personal-companion`.** It records **1.0.0** — the version the loop is pushing
over the live `v1.1.0` (REV10 §2).

**Do not chase the six "silent jobs".** Four are explained without fault:
`radar`/`research-scan` merged into `radar-hub`; `briefing` is running (email 710
proves it); `outreach` is dormant by design (`ACTIVATION_AT 2026-09-15`).
REV11 §4.

**Do not normalise the `fabric-20260910` label before understanding it.** It is a
29-worker build tag on one date, likely a merge-wave release (REV10 §1).

---

## 3. Final fix queue

### Tier 0 — unblocks everything else

```sql
UPDATE fleet_deploy_state
   SET value='0', updated_at=datetime('now')
 WHERE key IN ('auto_heal','enabled');
```

Two rows, reversible, highest leverage. `fleet_deploy_state` has **only these two
non-`scanerr` keys**, both `1` against a README default of `0`. **Blocker
confirmed from route tables (REV10 §3):** `qnfo-ops` publishes no D1-write route;
`qnfo-fleet-control` publishes `routes: null`.

### Tier 1 — code fixes

| # | fix | owner | note |
|---|---|---|---|
| F1 | Comparator leading-`v` fix | `qnfo-fleet-control` | `version-compare.mjs` **committed, not live**; worker cannot self-deploy → manual `wrangler deploy` |
| F2 | Gate ensemble on non-empty src/bib context; cap `attempt` | `qnfo-research-exec` | issues 687/688, ~192 criticals |
| F3 | Fix `deepseek-direct/models` probe assertion + digest | `qnfo-ai-calibration` | fails 1/28 **every** run |
| F4 | Make `gateway-sweep` fail on error thresholds | `qnfo-ai-calibration` | `pass` while listing `x42 content-shape` |
| F5 | Require measured counter before `degraded` | `qnfo-ai-calibration` | 5 of 10 probes frozen at 09-11T16:44 |
| F6 | workers.dev fetch → service binding | `qnfo-auditor-health` | CF error 1042 |
| F7 | Bundle `fleet.js` | `qnfo-observability` | file exists; single-file deployer can't bundle it |
| F8 | Apply `apply-research-exec-fix.mjs` (NL + status default) | `qnfo-research-exec` | **will not clear the stall** — newest failures are Zenodo 504s |
| F9 | Correct the INTAKE-STALL label | `qnfo-signal-loop` | reads "stuck new", actual state `triaged_hold` |
| F10 | Unstick `version_queue` id 18 | jnl/zenodo publisher | issue 677 |
| F19 | Retry-with-backoff on arXiv 429 in `fetchArxiv` | `research-daily-brief` | `worker.js:45:20`; **no canonical exists** to commit to |

### Tier 2 — storage or DNS

| # | fix | note |
|---|---|---|
| F11 | Rebuild + re-upload `r2:qnfo-canonical/qnfo-cloud-ops.js` | R2 write; object is a `404:` tombstone |
| F12 | Bind custom domain or repoint health check | `qnfo-ai`/`personal-api` return **530** daily, **404** in `feedback_probes` |
| F20 | De-duplicate the failure alert | emails 708 and 709 are identical, 0.4s apart |

### Tier 3 — investigate

| # | question |
|---|---|
| F13 | What are `email-triage` and `gmail-triage`? They emit **no email and no event** — the only two of the six still unexplained |
| F14 | Why did `integration_state` die at 2026-09-11T14:17:37Z? |
| F15 | What is `fabric-20260910`? (merge-wave label, inferred) |
| F16 | Why is the probe frozen for exactly 5 models? |
| F17 | Reconcile 44 `scanerr:*` keys — **7 workers have no canonical** |
| **F18** | **Fix the auditor's C4 job-silence check.** It watches merged-away job names, measures event emission rather than execution, and ignores scheduled dormancy. It fires `high` on jobs that are working, merged, or dormant. |

---

## 4. Verified facts, strongest first

1. **`ops_issue_run` — the backlog drain — is itself broken** (`failing x11`,
   24h, per `fleet_audit_runs`). `email_respond` failing 168h. `web_fetch x266`.
2. **`research-daily-brief` fails daily with `Error: arxiv 429`** at
   `fetchArxiv (worker.js:45:20)` — upstream rate limit, confirmed from the email
   body's stack trace. It also has **no canonical**.
3. **The six "silent jobs" largely dissolve:** 2 merged away, 1 running, 1
   dormant by design, 2 unexplained. **Zero confirmed broken.** The real defect
   is the C4 check (F18).
4. **Deploys: 54 fail / 22 ok.** `personal-companion` 26/30 (do-not-fix),
   `qnfo-cloud-ops` 25/25, `qnfo-observability` 1/1.
5. **`direction` is computed and never read**; `POST /redeploy` bypasses
   `scan()`'s caller-side guard. **518 deployed-ahead rows across 18 workers**,
   including this auditor.
6. **`v2-drain`: 40 rows, `GROUP BY status` returns one row — `ok`.** 30 carry
   `"ok":false`. `NL is not defined` (19) + Zenodo 504s.
7. **Register = `task_dod_register`**: 99 open, 26 overdue — confirmed
   independently; `0 no-executor` means they have owners.
8. **Three version values per worker in places:** `qnfo-backlog-exec`
   registry 1.2.7 / deployed 1.2.8 / canonical 1.2.4.
9. **`fleet_error_state` held 8 rows at 14:08Z and 0 rows at ~14:25Z** — a
   self-emptying error table cannot track persistent errors.
10. **44 `scanerr:*` keys**; `fleet_crons` is a third roster (6 rows); 6 merge
    products record **no purpose, capabilities, routes or deps**.
11. **Clean:** `errata_queue` (2 terminal), `dead_links` (0),
    `calibration_register` (all future-dated).
12. **Positive:** the intake stall cleared mid-session — `intake_new`
    **496 → 0**, `triaged` **62 → 558**.

**Useful source discovered:** `emails.body_text` holds **full message bodies**
with `headers_json`. The main audit only used `email_stats`. For any future
diagnosis, read the bodies.

---

## 5. Retracted, revised and qualified claims — do not cite these

| claim | where | status |
|---|---|---|
| export `GenerationFlow` | main audit FIX-1 | **withdrawn — causes a downgrade** |
| deployer is `qnfo-fleet-deploy` | main audit §1 | live deployer is `qnfo-fleet-control` |
| "1,215 masked rows, fleet-wide" | REV4 draft | **30 rows, one stream** |
| "real backlog is 305, not 3" | REV6 draft | `issue_ledger` has **0 open** |
| "the two self-heal instruments disagree" | REV6 draft | they agree (`alreadyOpen: 7`) |
| "`deployed_at` is an open fix" | REV6 §2 | **already applied 2026-09-10T17:44:08** |
| "`fabric-20260910` is a deploy wave" | REV7 | **refuted**; merge-wave reading replaces it |
| "`fleet_error_state`: 8 workers with errors" | main audit §7 | **does not reproduce** |
| **"six jobs silent since 09-10" (headline)** | **main audit, REV5/6/7/10** | **qualified — four of six explained without fault (REV11)** |

---

## 6. The one process lesson

**Four of my eight errors came from `LIMIT` without `ORDER BY`.** In time-series
tables that returns insertion order, not recency — so I read the oldest rows and
reported them as current. It produced a phantom bug (REV6), a stale window
(REV5), and a refuted hypothesis (REV7).

**Query rule for this fleet: always `ORDER BY <time column> DESC LIMIT n`.**

**Triage rule:** query **`fleet_audit_runs`** first — it retains per-run history
and aggregates `alerts`, `selfheal`, `gwfail`, `errata` and `issue_ledger`
fingerprints. But treat its C4 job-silence rows as unreliable until F18 is fixed.

---

## 7. Actuators qnfo-ops does not have

No deploy, no D1 write, no R2 write/delete, no git ref creation. **Every fix
above is a specification.** F0 is a two-row D1 write and the route tables confirm
no write path exists here (REV10 §3). Nothing in this audit changed production,
and no issue was closed — `ops_issue_run` refused on the affirmation gate and is
independently failing 11×/24h.
