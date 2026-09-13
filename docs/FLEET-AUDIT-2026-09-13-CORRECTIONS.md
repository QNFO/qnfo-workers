# Fleet audit 2026-09-13 — CORRECTIONS and late findings

Supplements `docs/FLEET-AUDIT-2026-09-13-stale-workers.md` (sha `ddb195af`).
Both files are runtime-inert: the fleet deployer's `canonical()` resolves
`<worker>/deployed-current.worker.js` then `<worker>/worker.js`, never `docs/`.

## C1. CORRECTION — "ai_model_health is fully recovered" was WRONG

The parent audit said "`ai_model_health` is fully recovered (20/20 `ok`)". That was a
**query artifact, not a finding.** I wrote `MAX(updated_at)` across the whole table and read
the single maximum as if it described every row. Per-row inspection falsifies it:

`last_probe_ts = 1789145063740` (= **2026-09-11T16:44:23Z, 45.5h stale**) for 8 of 20 rows,
all reporting `status='ok'`, `consecutive_failures=0`:

| model_id | status | last_probe_ts | gateway_failures |
|---|---|---|---|
| glm-5.2 | ok | 1789145063740 (45.5h) | 362 |
| qwen2.5-coder-32b | ok | 1789145063740 (45.5h) | **10,836** |
| deepseek-r1-qwen-32b | ok | 1789145063740 (45.5h) | 0 |
| glm-4.7-flash | ok | 1789145063740 (45.5h) | 0 |
| llama-3.2-11b-vision | ok | 1789145063740 (45.5h) | 0 |
| qwq-32b | ok | 1789145063740 (45.5h) | 0 |
| qwen3-30b | ok | 1789144280660 (45.7h) | 0 |
| gemma-4-26b | ok | 1789144284117 (45.7h) | 258 |

12 rows are genuinely fresh (`last_probe_ts=1789308978958` = 2026-09-13T14:16:18Z).
12 fresh + 8 stale = 20. **This independently reproduces agent_issues #727**
("AMH-OK-ON-STALE-PROBE: 8 of 20 ai_model_health rows report ok on 45h-old evidence"),
which was filed by another agent before I checked. I should have queried per-row from the
start; the aggregate hid the defect I was looking for.

**Second defect visible in the same table:** `gateway_failures` is populated (10,836 for
qwen2.5-coder-32b, 362 for glm-5.2) but has **no effect on `status`**. The counter is
recorded and never consulted. That is the structural reason a model can carry five figures
of failures and still report `ok`.

## C2. NEW P0 — the deploy healer is DISABLED

`fleet_deploy_state`:

| key | value | updated_at |
|---|---|---|
| enabled | **0** | 2026-09-13 14:23:10 |
| auto_heal | **0** | 2026-09-13 14:23:10 |

The autonomous deploy loop was switched **off at 14:23:10Z today**, immediately after the
25 failed `qnfo-cloud-ops` redeploys. Consequence: the 25-failure corrupt-canonical loop
(#691) and the personal-companion downgrade loop are no longer being retried — because
nothing is retrying anything. Fleet drift will now accumulate unopposed.
This reproduces agent_issues #731 ("DEPLOY-HEALER-DISABLED-AND-THRASH", `enabled=0`,
`auto_heal=0` as of 14:23:10Z) and contradicts `#724` (`CONTROL-STATE-DRIFT`), which notes
the committed qnfo-fleet-deploy tombstone asserts `auto_heal=1`.

**Do not read "no new deploy failures" as improvement.** It is the healer being off.

## C3. Dead output sinks (confirms agent_issues #733)

| table | rows | note |
|---|---|---|
| media_objects | **0** | never written |
| analytics_daily | **1** | single row |
| social_media_posts | **3** | last write 2026-08-27 (17d) |
| paper_index | 620 | last write 62d ago per #733 |
| personal_radar | 2 | last 2026-09-07 |
| dead_links | **0** | never written |
| subscriber_digest_runs | **0** | never written |
| ipatent_submissions | **0** | never written |

A worker whose sink table has zero rows is not "quiet" — it has never produced anything.

## C4. The drain cannot shrink this backlog — measured, not inferred

`ops_issue_run confirm=true`, run at ~14:26Z:

```
openBacklogBefore: 30 | processed: 30 | closed: 0 | rechecked: 30 | escalated: 0
```

Every row returned `action: recheck`, note `no probe target` or `probe target <name>`.
`qnfo-backlog-exec` auto-closes **only** health-availability rows whose re-probe passes.
All 30 open rows are `infra` / `bug` / `deploy` / `observability` / `monitoring`, so **none
is eligible**. The drain is not failing; it is being asked to do something outside its
design. **The backlog cannot reach zero through this mechanism.**

## C5. Backlog grew during the audit — the decisive number

Measured open `agent_issues` count across this session:

| time | open |
|---|---|
| session start | 15 |
| after first drain | 16 |
| mid-audit | 21 |
| before drain | 26 |
| after drain | 30 |
| audit end | **35** |

Lifetime: 329 closed / 260 wontfix / 105 resolved / **35 open** (729 total).
Growth rate exceeds the drain rate by construction (C4). Filing more tickets — including
this one — makes the headline metric worse.

## C6. Overlapping work by a parallel agent

Between 14:23:12Z and 14:31:00Z another agent bulk-filed #726–#733, several of which
independently match findings in the parent audit: #732 `FLEET-CRON-NOOP` (my
`demo-heartbeat = SELECT 1 AS beat`), #733 `DEAD-SINK-SWEEP` (C3), #727 (C1), #731 (C2).
This is corroboration, not duplication I introduced — but it also demonstrates the sprawl
in #714: two agents auditing the same fleet produced two unreconciled ticket sets in eight
minutes. Deduplication across sessions is absent.

## C7. Self-heal run: clean

`telemetry_analyze hours=24` → `scanned: 11, persistent: [], recovered: 8, filed: 0,
alreadyOpen: 2`. No new tickets were filed by this endpoint's self-heal loop. The 8
"recovered" tools include the `ops_d1_query` failures I generated earlier by querying
non-existent columns — a self-inflicted share of the failure metric.

## C8. Limits of this audit

- **Liveness is inferred from binding probes and the fleet-dashboard, not from
  `wrangler`/CF API.** 45 of 55 workers are unprobed; for those I relied on output-table
  recency. A worker could be healthy and simply unused, or dead — those are
  indistinguishable from this endpoint for the unprobed set.
- **`cf_analytics` worker coverage is poor**: only 8 named workers plus
  `__unknown__ = 20,380` of 281,106 requests/30d. I could not attribute the bulk of
  invocations to a worker, so invocation counts are not a reliable per-worker activity
  measure here.
- **`worker_logs` is frozen**, so the one table that would have given per-request execution
  evidence is 76h dead. Every "is it doing anything" judgement rests on sink-table
  recency as a proxy.
- **I cannot deploy, delete R2 objects, create branches, or mutate CF.** C2 is the reason
  nothing will self-correct: the actuator is switched off, and I am not one.
