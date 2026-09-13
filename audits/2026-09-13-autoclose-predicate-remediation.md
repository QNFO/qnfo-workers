# Autoclose-predicate remediation — 2026-09-13 (continuation turn, qnfo-ops)

**Scope of this document.** The previous turn in this session produced the fleet-consolidation
manifest (rev 7, blob `de4fb199`, commit `29bd0fd3`) and concluded "no defect is fixed". This turn
found, verified, and repaired the single highest-consequence *live* defect in the fleet, and
corrected three claims made by the previous turn.

---

## 1. The headline: the drain was destroying defect tickets, live

`qnfo-backlog-exec` decides a ticket is an "availability ticket" from its **title alone**:

```js
const isHealthAvailability =
  /health|heartbeat|availability|endpoint down|is down|reachable/i.test(title) &&
  /health|availability|reachable|down/i.test(title);
```

…and then **closes** the ticket when the named target re-probes PASS. For a ticket whose *subject*
is "the prober reports wrongly", the probe passes **by construction**, so the ticket is closed
without the defect being touched.

**Measured, from `cloud_ops_events` (kind=`job-run`, job=`qnfo-backlog-exec`):**

| time (Z) | event |
|---|---|
| 14:21:25 → 14:35:57 | **19 drain runs** (~1.4/min, driven by concurrent ops-exec jobs — #760, #779) |
| 14:29:12 | **#748 closed** by probing `qnfo-fleet-control` |
| 14:31:21 | **#755 closed** by probing `qnfo-agent-ws` |
| 14:31:22 | **#758 closed** by probing `qnfo-lifecycle` |
| 14:35:57 | **#755 closed again** |
| after 14:35:57 | **0 runs** (verified 14:45Z) — the burst has stopped |

Three defect tickets destroyed in 6 minutes. Each one closed by probing an **unrelated healthy
worker**:

- **#748** *FLEET-PROBE-FAIL-OPEN* — the subject is the advisor's `probeHealth`, which returns
  `ok:true` for any worker present in the Cloudflare account list and never calls a health endpoint
  (source-verified, `qnfo-fleet-control/worker.js` sha `d9d438f0` VERSION 0.3.3). **The defect was
  used as its own dismissal.**
- **#755 / #792** *MISSING-SECRET* — the subject is a **missing secret**. An availability probe
  cannot observe secret presence. Live re-check 2026-09-13: `GET
  https://qnfo-agent-ws.q08.workers.dev/health` → `version 1.3.9`, `deepseek_key: **false**`.
  **Defect confirmed still present.**
- **#758** *DRIFT-VERSION-SOURCE-CONFLICT* — the subject is the scanner disagreeing with live
  versions. The scanner's own row agrees: `fleet_drift_report` id 1708 (`14:05:46`) records
  `healthVer=10`.

### Why a title tweak cannot save this branch

`category` across **all 85 open tickets**:

`infra 27, observability 12, deploy 11, monitoring 8, productivity 5, bug 5, ai-gateway 4,
config 3, security 3, other 4`

**There is not one availability ticket in the corpus.** A title match on the word *health* can
therefore only ever close a defect. The branch is mis-targeted by construction.

---

## 2. The fix (authored, verified, committed)

**`qnfo-backlog-exec/apply-backlog-exec-autoclose-fix.mjs`** — commit `72088dcf`, VERSION `1.3.1`.

Requires a **positive unavailability assertion** and excludes monitor-defect framings. Polarity is
deliberately **fail-closed**: an ambiguous title is *rechecked*, never closed.

**Verified with `run_code` against all 85 open titles:**

| | closes |
|---|---|
| current predicate | **7** — #693, #755, #758, #770, #791, #792, #795 (every one defect-class) |
| corrected predicate | **0** |

**Regression set — genuine availability phrasings that must still close, and do:**

- `qnfo-ai DOWN: /health returns 502, service unreachable`
- `personal-api heartbeat missing for 3h`
- `qnfo-gateway availability: endpoint down since 09:00Z`
- `qnfo-pdf not responding after deploy, requests time out`
- `qnfo-social offline since 06:00Z, outage`

**Boundary:** `qnfo-qwav unreachable` → closes (correct). `…are unreachable at q08.workers.dev` →
keeps (correct, #770).

**Anchor integrity:** all three anchors compared byte-for-byte against the live source —
`isHealthAvailability` 163 chars / 4 leading spaces, orphan branch 57 / 8, VERSION 24 / 0 — all
`MATCH`. The emitted regex compiles and behaves correctly.

### Self-correction: my first fix was falsified by my own test

The first version used a monitor-defect *blacklist*. The unit test showed it **still closed #748**
(`FLEET-PROBE-FAIL-OPEN`) and **#758** (`DRIFT-VERSION-SOURCE-CONFLICT`), and it **regressed** on
#772 (`NEVER-WAS-A-FLEET-OUTAGE`) because the exclusion used `never was` with a space while the
title carries hyphens. Replaced with the positive-assertion form and re-verified before commit.

### Mirror safety (#786)

The resolver tries `deployed-current.worker.js` **before** `worker.js`. For this worker both files
are byte-identical (sha `fc0eb745`, 31,806 B) — so patching one alone would *create* the stale
mirror that shadows the canonical. The patcher **refuses** unless the mirror is byte-identical, then
writes the same bytes to **both**. It will not overwrite a divergent mirror, because a mirror that
is legitimately ahead would make the patched `worker.js` a **downgrade** (#738, #803).

---

## 3. Data repairs executed (5 D1 writes, all verified)

| # | repair | evidence |
|---|---|---|
| 1 | **#748 reopened** + annotated | closed 14:29:12Z by the predicate class it describes |
| 2 | **#780 corrected** | its claim (7 open rows, future `created_at`, up to 51 min) **does not reproduce — 0 rows** |
| 3 | **4 future `updated_at` normalised** | #701/#734 at `15:25:00.000Z` (+41.7 min), #722 `14:47:30`, #731 `14:46:40` |
| 4 | **#783 appended** with live-harm evidence | the 19-runs/3-tickets measurement and the 0-of-85 result |
| 5 | KV `ops/outcomes/2026-09-13-autoclose-remediation` | supersedes the stale rev-6 fields in the consolidation key |

Clocks were verified agreeing within 1 s before any timestamp claim: D1 `strftime now` =
`1789310599` vs isolate `Date.now()` = `1789310600191`, both `2026-09-13T14:43Z`.

**Correction to the previous turn's claims:** backlog is **85 open**, not 77. The KV consolidation
record still holds **rev 6** fields (13 writes, 6 commits) while the manifest on disk is **rev 7** —
the record was written before the rev-7 commit and never updated. And the mirror is **identical**
for `qnfo-backlog-exec`, so #786 does not apply to this worker specifically.

---

## 4. What is NOT fixed, and why

**The fix is committed but production still runs v1.2.8** (repo source is v1.3.0). v1.2.9 (zenodo /
research predicates) and v1.3.0 (ops_jobs reaper) are likewise committed and undeployed. The only
deploy route is `.github/workflows/apply-staged-patchers.yml`, which is `workflow_dispatch`-only
**by design**, and no tool on this endpoint can POST a workflow dispatch. That is the human step
tracked as `task_dod_register` **P7.H3** (due 2026-09-16).

**No stopgap was applied, deliberately.** Every option corrupts something:

- rewriting titles to dodge the regex **breaks the open-title dedupe index** (#784) and would cause
  re-filing of duplicates;
- changing `status` away from `open` **hides the row** from `openBacklog` and every dashboard;
- touching `updated_at` to push rows past the 40-row window buys **about 1–2 minutes** at 1.4
  runs/min.

The burst has stopped, so the next exposure is the daily cron (`10 1 * * *`).

**Stale workers are not repairable from here.** `fleet_status` reports **12 of 55 probed healthy,
43 unprobed**. The known fix (deploy the repo `registry.js` to restore the 44-probe roster) is
**#746**: it would simultaneously blind the fleet to **13 workers carrying 50.3 % of measured
traffic**. That is a fix-ordering hazard, not an oversight.

**Residual risk in the fix itself, stated.** v1.3.1 is a *title heuristic*. It narrows the
wrong-close class; it does not abolish it. A future ticket that asserts unavailability in its title
while its real subject is a monitoring defect can still be closed. The complete fix is to bind the
branch on `agent_issues.category` instead of the title — which needs the full 31,806-byte file and
is therefore left to a runner that can see all of it.
