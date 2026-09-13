# REV8 — Two committed claims refuted by their own tests

Date: 2026-09-13. Final revision. **Refutes REV7's wave hypothesis** and
**corrects REV6's `deployed_at` finding** — both using tests those revisions
themselves proposed. Records the root cause of a repeated error of mine.

---

## 1. REFUTED — REV7's `fabric-20260910` wave

REV7 proposed the decisive test:

```sql
SELECT resource_name, action, status, deployed_by, deployed_at, notes
  FROM deployment_history WHERE deployed_at LIKE '2026-09-10%';
```

**Result: 1 row, 1 worker.**

| resource | action | status | deployed_by | deployed_at |
|---|---|---|---|---|
| `qnfo-observability` | fix-deploy | success | deepchat-agent | 2026-09-10 17:44:08 |

And the second ledger:

```sql
SELECT ts, worker, ok FROM fleet_deploys WHERE ts LIKE '2026-09-10%';
```
→ **`rowCount: 0`.**

Deploy activity by day (`deployment_history`):

| day | rows | distinct workers |
|---|---|---|
| 2026-09-11 | 6 | 4 |
| **2026-09-10** | **1** | **1** |
| 2026-09-09 | 3 | 2 |
| 2026-09-04 | 12 | 5 |
| 2026-09-03 | 12 | 4 |
| 2026-09-02 | 14 | 7 |

**There was no fleet-wide deploy on 2026-09-10.** Not 29 workers — at most one,
and it was an observability fix-deploy. `fabric-20260910` is a **label with no
deploy behind it**, which is precisely the alternative REV7 §5 listed and then
argued past.

**REV7's central claim is withdrawn.** The correlation between the shared build
tag and the six silent jobs does not survive its own test.

Caveat, stated because it cuts against me: `deployment_history` holds only ~49
rows total while `fleet_deploys` holds 76, so the two records disagree in size
and neither is complete. The absence of 09-10 rows therefore shows that *these
ledgers* recorded no wave — not that no change occurred by some other path.
What is refuted is the specific claim that the tag marks a 29-worker deploy.

---

## 2. CORRECTED — the `deployed_at` fix was already applied

REV6 §2 said:

> The column is `deployed_at`, not `ts`. A one-word fix restores deploy-record
> ageing in the integration monitor.

**It was already fixed — on 2026-09-10T17:44:08, three days before my audit.**
The fix is the very row REV7's test surfaced:

```
resource_name: qnfo-observability
action:        fix-deploy
status:        success
deployed_by:   deepchat-agent
deployed_at:   2026-09-10 17:44:08
notes:         Fixed decaySignals deployment_history column (ts -> deployed_at;
               was permanent D...)
```

And the error no longer occurs. The last three `integration_state` runs:

| ts | deployment_history decay |
|---|---|
| 2026-09-11T14:17:37.615Z | `"age_h":3.7247755555555555` |
| 2026-09-11T13:17:48.924Z | `"age_h":2.728022777777778` |
| 2026-09-11T12:17:49.193Z | `"age_h":1.7281` |

**Valid numeric `age_h`, no error, no null.** Deploy-record ageing works, and
`deployment_history` was fresh (age ~1.7–3.7h) at the time of those runs.

So REV6 §2 is **wrong on its main point.** The `no such column: ts` error exists
only in the rows I sampled — 2026-09-10T11:42 → 15:42 — which **predate the
17:44 fix by hours.**

---

## 3. Root cause of a repeated error of mine

Both errors above share one cause, and it is mine:

**I wrote `LIMIT n` without `ORDER BY`, and reported the oldest rows as current.**

- REV5 §1 used `SELECT * FROM integration_state LIMIT 12` → returned ids 1–9,
  the **earliest** rows (09-10 11:42 → 15:42).
- REV6 §2 read the `ts` error out of those rows and declared an open bug.
- REV7 then built a fleet-wide hypothesis on top of the same stale window.

`LIMIT` without `ORDER BY` returns insertion order, not recency. In a table
whose whole purpose is time series, that is not a measurement. The corrected
form is `ORDER BY ts DESC LIMIT n`, which is what §2 above uses — and it
immediately showed the fix.

This is the same class as the three reading errors already recorded (main audit
§8's `v2-drain` row, REV4's 40× inflation, REV6's `filed: 0`). **Four of my
eight self-corrections come from reading the wrong slice of a result, not from
misunderstanding the system.**

---

## 4. What survives from REV7

Not the wave hypothesis. But these stand independently:

- **29 workers carry `fabric-20260910`** as their deployed version string. That
  is a fact about the drift rows, and it is unaffected by whether a deploy
  happened.
- **7 workers have no canonical** (`scanerr:stale-canon`): `obsidian-writer`,
  `osf-integrity-check`, `personal-life-maintain`, `qnfo-arxiv-radar`,
  `qnfo-research-radar`, `qnfo-twin-maintain`, `research-daily-brief`.
  Plus 3 `nocanon`. This is the strongest residual finding.
- **`research-daily-brief` remains a coherent triple**: no canonical, job
  `briefing` silent since 2026-09-10T06:30:45Z, and daily
  `[research-daily-brief] FAILED` emails (ids 708, 696). Three instruments
  agree regardless of what `fabric-20260910` means.
- **The six silent jobs remain unexplained.** Something stopped them on
  2026-09-10; it was not a deploy in either ledger.

`fabric-20260910` is now **unexplained as a label** — a build tag shared by 29
workers with no deploy behind it. That is a genuine anomaly and I cannot resolve
it from here. It may be a release-tool stamp, a hand-set constant, or a deploy
recorded outside both ledgers.

---

## 5. Final tally of my self-corrections

| # | claim | outcome |
|---|---|---|
| 1 | export `GenerationFlow` | **withdrawn — would cause a downgrade** |
| 2 | deployer is `qnfo-fleet-deploy` | live deployer is `qnfo-fleet-control` |
| 3 | 1,215 masked rows | 30; `LIKE '%failed%'` matched metric payloads |
| 4 | real backlog is 305 | `issue_ledger` has 0 open; 305 is a composite |
| 5 | self-heal instruments disagree | they agree; `alreadyOpen: 7` |
| 6 | reported `filed: 0` as "nothing wrong" | same call returned `alreadyOpen: 3` |
| 7 | `deployed_at` is an open fix | **already applied 2026-09-10T17:44:08** |
| 8 | `fabric-20260910` is a deploy wave | **refuted — 0–1 deploy rows that day** |

Eight corrections against one audit. Three of the eight (1, 7, 8) were
*prescriptive* — they told someone to change production. Claim 1 would have
caused an outage; claim 7 asked for work already done. The audit's findings
about the deploy plane are the ones that survived scrutiny, and those are the
ones I read from source rather than inferred.

---

## 6. Limits

- **Neither deploy ledger is complete** (~49 rows vs 76 rows, disagreeing), so
  §1's refutation is strong for "no wave in these records" and weak for "no
  change occurred."
- **The six silent jobs are still verified only by the auditor's C4 check.**
- **`fabric-20260910` remains unexplained.**
- **I did not re-read every section of the main audit for the same
  `LIMIT`-without-`ORDER BY` error.** Given four instances, other stale-window
  readings may remain in the main document. Sections most at risk are those
  built on unsorted samples: §7 (`fleet_error_state`, `fleet_cal_anomalies`),
  §9 (`alerts`), and §11.
- **The self-heal `age_h` 146–148 in §2's rows** means that signal was ~6 days
  stale at 09-11; it is fresh now (1,410 rows, 2026-09-13T14:01:38Z). I did not
  establish what fixed it.
