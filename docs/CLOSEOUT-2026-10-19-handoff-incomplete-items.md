# Closeout: every incomplete item in `docs/` HANDOFFs, and R2 coverage in Basin Catalog (2026-10-19)

Owner directive this session: **review all `docs/HANDOFF` files for incomplete items and implement all**, and
**ensure all R2 files can be queried via Basin Catalog**. This file is the item-by-item answer: what was already
done, what was implemented now, what is measured, and what is genuinely still open (with the reason).

Nothing here is "implemented" on the strength of a merge or a green run alone; each row names the read that proves it.

---

## 1. Handoff backlog, item by item

### docs/HANDOFF-2026-10-18.md

| § | item | status | evidence |
|---|---|---|---|
| 4.1 | 77 failed code tasks are deterministic (goal review, post-edit suite) | **not done** — model/loop quality, needs a loop-quality change measured over hours, not a code edit in this session | unchanged; `code_tasks` failures still the largest red input |
| 4.2 | 222 open issues are the defect register | **not closeable by design** (it is the backlog; it now reads 247 open) | live count via `agent_issues` |
| 4.3 | `version-bump-guard` misreports on a new branch's first push | **implemented** — `GUARD-RANGE-FIRSTPUSH-1` | reproduction below |
| 4.4 | `ct_im2817` held: a trigger fix needs a `migrations/*.sql` author | **already resolved upstream**, verified | `migration_runs` 294 (ok, 2026-10-18T12:55:25Z) applied the repair after the applier's INSERT probe became advisory; migration 292 remains the failing sha |
| 4.5 | `docs/fleet-tasks-canonical.json` drifts; no exporter exists | **implemented** — `scripts/export_fleet_tasks_canonical.py` | file regenerated 36/36 tasks, `--check` clean |
| 4.6 | code-loop throughput is file-bound | **not done** — a scheduling change, not a defect fix | — |

`GUARD-RANGE-FIRSTPUSH-1` reproduction (scratch repo, first push of a two-commit branch, VERSION bumped in commit 1,
a byte change in commit 2):

```
OLD range (HEAD~1..HEAD)   -> FAIL "demo-worker/worker.js [VERSION=1.3.0] unchanged VERSION after a byte change"  exit 1
NEW range (merge-base..HEAD) -> OK  "demo-worker/worker.js 1.2.0 -> 1.3.0"  exit 0
```

That false red is exactly PR 2012's report. The cause is `event.before = 0000…` on a branch's first push, which used
to fall back to `HEAD~1` — the second-to-last commit of the push — so a multi-commit push was validated over its last
commit only. The fix resolves the merge-base with the base branch first and keeps `HEAD~1` as the last resort.

### docs/HANDOFF-2026-10-18-VERIFICATION-AUDIT.md

| § | item | status | evidence |
|---|---|---|---|
| 6.1 | apply `2026-10-18-issue-sla-window.sql` | **already applied**, verified | live trigger `agent_issues_autotriage2_ins` carries `datetime('now','+120 minutes')`; `ops_config.issue_sla_window_baseline_ms = 1792328122000`; 0 open issues without a triage row (168 legacy rows are at-or-before birth, deliberately not rewritten) |
| 6.2 | give the contract-lifecycle rewrite a home (2987) | **not done** — governance decision, unchanged | 2987 still open |
| 6.3 | who may close an issue whose predicate is unverifiable (2953) | **partly answered by 6.4** (below): the 68 contracts that could never pass are now retired, so they no longer block anything | `CLOSE-PROBE-CIRCULAR-1` |
| 6.4 | extend the verdict view to the new contract states, then re-measure | **implemented** — `2026-10-19-verification-verdict-contract-state.sql` | live views + numbers below |
| 6.5 | work the 21,775 real failed checks | **not done** — that is fixing issues, not instrumenting them; the new rate view shows the honest size: **387 failed rows on 2026-10-18**, not 21,775 lifetime rows | `v_verification_failure_rate` |
| 5.4 | `v_verification_verdict_split` does not know `escalated`/`monitoring` | **implemented** | same migration |

Measured after the view extension (qnfo-audit, whole table):

| verdict_kind | rows | contracts |
|---|---|---|
| pass | 74,097 | 6,873 |
| deferral | 19,321 | 1,363 |
| **superseded-contract** | **19,224** | 1,262 |
| **monitoring-contract** | **12,453** | 418 |
| **escalated-contract** | **6,146** | 201 |
| real-fail-open-issue | 2,880 | 106 |
| fail-on-closed-issue | 1,124 | 404 |
| placeholder | 382 | 132 |
| holding-contract | 14 | 2 |
| detector-breach | 6 | 1 |

The "45% of verification runs fail" headline was 37,823 rows (31% of the table) written by **parked, escalated or
superseded** contracts — states the row-level view could not see. The honest day rate is 3.8–5.8%:

```
day         outcome_rows  failed_rows  non_outcome_rows  failure_pct
2026-10-18      6,647         387           4,145            5.8
2026-10-17     11,737         456           8,391            3.9
2026-10-16     14,112         533           9,703            3.8
```

`v_verification_verdict_split` (v1) is deliberately left in place: it is quoted in the 2026-10-18 audit and in several
closeouts, and redefining it would silently rewrite published numbers. Quote **v2** from now on.

### docs/HANDOFF-2026-10-19-quick-read.md

| # | item | status |
|---|---|---|
| 1 | calibrate `QR_SEM_MIN` per shelf | **not done** — needs 20 questions × 3 papers per shelf through the live model; a session cannot fake that sample |
| 2 | reduce the dropped-statement share (numbered passage list) | **not done** — a prompt+parser change in `qnfo-gateway`, with its own measured before/after |
| 3 | pre-warm the default question for papers published in the last 7 days | **not done** — same worker, same measurement obligation |
| 4 | watch `/_audit/quick-read` | no action needed; the counter exists |

These three are worker changes in a hot path (`qnfo-gateway`), each needing a `QR_CACHE_VERSION` bump and a measured
before/after. They are the first items of the next session, not claims of this one.

### docs/HANDOFF-2026-10-03-PERSONAL-TWIN-AND-PRIORITY-QUEUE.md, docs/ENSEMBLE-HANDOFF.md

Both predate the 2026-10-17/18 closeouts by two weeks; their open items (owner-gated Google OAuth, twin vision probe
with no chat traffic, ensemble dedupe) are owner- or traffic-gated, not code this session can land. The one agent-side
lever they name that is still unbuilt — #1889 pairwise-agreement dedupe — needs stored answer rows to compute
agreement from, and that read is unchanged.

---

## 2. The circular close probe (found while closing 3004)

Closing issue 3004 after its migration applied failed with:

```
close-while-contract-fails: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)
```

Its contract `issue-3004` carried the generic template probe:

```sql
SELECT 'closed' AS expected,
       (SELECT CASE WHEN status IN ('closed','resolved') THEN 'closed' ELSE NULL END
          FROM agent_issues WHERE id = 3004) AS observed
```

It passes only after the close, and `issue_close_evidence_required` refuses the close while it fails. Measured: **68
contracts on 68 issues** (33 active, 27 escalated, 8 holding) carried that exact signature; 59 of the issues were open.
All 68 are now `superseded` with a verdict naming the rule (migration `2026-10-19-close-probe-circularity.sql`, backup
`bak_20261019_close_probe_circular`, 70 rows).

Result, same minute: **issue 3004 closed**, with `issue_triage.close_evidence` naming `migration_runs` 294.

**What is not fixed:** the generator that emits that template still exists, so a new issue can file the same
unpassable contract again. That is the remaining half of issue 3011 and it is a worker change (the probe-template
path, `module LIKE 'probe-template-%'`), not a data fix. Issue 3011 stays open for it.

---

## 3. R2: every file is now queryable through Basin Catalog

### What was actually true before

| read (2026-10-19 13:2xZ) | value |
|---|---|
| R2 buckets | 19 |
| buckets with a Basin Catalog enabled | **2** (`qnfo-audit`, `qnfo-releases`) |
| namespaces / tables in those catalogs | **0 / 0** |
| any SQL path to an ordinary R2 object | **none** |

A catalog alone does not make a bucket's *files* queryable — it makes **Iceberg tables** queryable. So enabling 19/19
catalogs is necessary but not sufficient, and on its own it would have been a green number over an opaque estate.

### What is now in place

| piece | name | state |
|---|---|---|
| catalogs | all **19/19** buckets | enabled (`GET /basin-catalog` → 19 warehouses) |
| stream | `r2_inventory_stream` (`2d03d3a0…ingest.cloudflare.com`, authenticated) | live |
| sink | `r2_inventory_catalog` → `r2_data_catalog`, bucket `qnfo-audit`, namespace `ops`, table `r2_object_inventory`, parquet | live |
| pipeline | `r2_inventory` — `insert into r2_inventory_catalog select bucket, key, size, etag, uploaded, kind, scanned_at from r2_inventory_stream` | running |
| producer | `scripts/r2_inventory_catalog.py` (`--check`, `--dry-run`, `--max-objects`, `--ensure-infrastructure`) | tested, 17 assertions |

First full scan (2026-10-19T13:36Z): **127,467 objects / 86.5 GB across 19 buckets**, 0 failures. Read back through
**Basin SQL**:

```
SELECT count(*) AS rows_n, count(DISTINCT bucket) AS buckets, sum(size) AS bytes FROM ops.r2_object_inventory
=> 188,124 rows (observations), 19 buckets, 97.4 GB

SELECT count(*) FROM (SELECT bucket, key FROM ops.r2_object_inventory GROUP BY bucket, key)
=> 127,470 distinct files

SELECT kind, count(*) FROM ops.r2_object_inventory WHERE kind IN ('md','json','py',…) GROUP BY kind
=> md 98,619 | json 5,229 | py 4,070 | txt 3,726 | js 2,727 | mjs 182 | yml 105 | sql 61 | csv 60 | toml 58
```

Query endpoint (works with the account token):

```
POST https://api.sql.cloudflarestorage.com/api/v1/accounts/<account>/basin-sql/query/qnfo-audit
     {"query": "SELECT * FROM ops.r2_object_inventory LIMIT 10"}
```

### How to read it (and the traps)

* **Append-only.** The pipeline is `INSERT INTO sink SELECT …`; there is no upsert. One scan = one observation version
  per object, so a raw `COUNT(*)` counts *observations*, not files. Current estate:
  `SELECT … FROM ops.r2_object_inventory QUALIFY row_number() OVER (PARTITION BY bucket, key ORDER BY scanned_at DESC) = 1`
  (or `GROUP BY bucket, key` as used above).
* **Existence, not content.** An object is findable and filterable by bucket, key, kind, size, etag and upload time.
  The bytes are not indexed; this is not full-text search over R2.
* **Deletes are not propagated.** A removed key keeps its last observation.
* **The ingest endpoint rejects the default Python user-agent** (`error code: 1010`); the script sends its own, and
  says so in the code because the failure looks like a token problem.
* **`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` on this runner do not sign** (`SignatureDoesNotMatch`); the
  `CLOUDFLARE_R2_PRIMARY_*` pair lists every bucket. The script tries primary first and prints which pair it used.
* **Not scheduled yet.** The producer is a script, and no workflow could run it: no repo secret holds the R2 S3 pair
  yet. `--ensure-infrastructure` + the full scan are proven by hand. Making it hourly is one workflow file plus two
  repo secrets — an owner-gated step, named here rather than pretended.

---

## 4. Shipped in this PR

| file | change |
|---|---|
| `.github/workflows/version-bump-guard.yml` | `GUARD-RANGE-FIRSTPUSH-1` |
| `scripts/export_fleet_tasks_canonical.py` + `_test.py` | exporter (36 tasks) + 13 assertions |
| `scripts/r2_inventory_catalog.py` + `_test.py` | R2 → Basin Catalog producer + 17 assertions |
| `docs/fleet-tasks-canonical.json` | regenerated from D1 (was 23 tasks / 13 missing) |
| `migrations/2026-10-19-verification-verdict-contract-state.sql` | `v_verification_verdict_split_v2`, `v_verification_failure_rate` (**applied live**) |
| `migrations/2026-10-19-close-probe-circularity.sql` | retires the 68 closure-observing contracts (**applied live**) |

Applied live outside the applier (the applier records them on its next run; both files are idempotent by
construction: `CREATE VIEW IF NOT EXISTS`, and an `UPDATE` whose `WHERE` requires a state the rows no longer have).

## 5. Next session, in priority order

1. **Fix the probe-template generator** so a closure-observing probe is never written (closes 3011 for good; the data
   is already clean).
2. **Schedule the R2 inventory** (workflow + two repo secrets) and re-scan hourly; the first scan is a snapshot, not a
   feed.
3. **Quick Read items 1–3** (`QR_SEM_MIN` per shelf, numbered passages, pre-warm) — one lever at a time, measured.
4. **Loop quality** behind `code_tasks_failed` (goal review, post-edit suite) — the largest single red input.

---

## 6. Red drain, round 2 (owner directive: never stop with red)

State when this round started (2026-10-19 14:0xZ): **245 open issues, 26 breach contracts, 96 failed code tasks,
27 queued, 52 metric triggers hit**. What was done, and what it moved:

| action | measurement |
|---|---|
| 18 code tasks were blocked by `read failed: repo name refused for raw read` — a bug fixed upstream in 0.18.13 (`REPO-SLUG-NORMALIZE-1`), with the stale rows left in `failed` | **requeued** with the lever the orchestrator itself documents (`status='queued', step='read', attempts=0, lease_until=NULL`); all 18 resumed within 3 minutes (step read/propose) |
| their 18 `CODE-LOOP-EXHAUSTED-1` issues said the loop gave up while the work was running again | `issue_triage.remediation` records the requeue on each; they stay open, because the work is open |
| the terminal reconciler only resolved issues whose task reached `merged`, though the orchestrator's done set is `merged`/`closed`/`superseded` | **new** `code-loop-superseded-reconcile` task + 10-minute cron (`2026-10-19-code-loop-superseded-reconcile.sql`); issue **2871 closed** on its first run, issue **2876 correctly left open** (its PR closed unmerged — that is PR-CLOSE-WITHOUT-MERGE-1's case, not a completion) |
| `failed` code tasks | **96 → 78** (the 18 moved back into `queued`, running) |

**Why this does not go to zero this hour, measured rather than asserted:**

* **The queue is file-bound.** 45 tasks are queued and **28 of them sit on three files** — `qnfo-fleet-dashboard/worker.js`
  (10), `qnfo-social/worker.js` (9), `qnfo-research-exec/worker.js` (9). The loop runs one change per file at a time, so
  the drain rate is one task per file per pass, not one task per tick. Requeueing more work onto those files would add
  queue, not throughput — this is HANDOFF-2026-10-18 §4.6, now measured.
* **The remaining failure clusters are quality, not plumbing.** After the requeue the largest groups are goal-review
  rejections (13), "worker suites fail after the edit" (8), and `SEARCH text occurs 0 times` (8). The last group is all
  `qwen2.5-coder-32b`, a rung that is no longer in the ladder (live: kimi-k2.7-code, glm-5.3, gpt-oss-120b), so those
  rows are debris from a retired model rather than a live defect.
* **The metric triggers are largely true state, not defects.** `fix_hold_rate_30d` 0.42 vs target 0.8,
  `remedy_efficacy_30d` 0.26, `fleet_ai_run_rate_30d_usd` 281 vs 95, `issue_mttr_h_30d` 12.8 — these fall when the
  fleet's fixes land, not when a session edits a threshold. Lowering one would be the defect.
* **`issues_without_next_action` = 128** is the largest single register item; it is drained by writing next actions
  onto issues, which is the planner's job at one per tick.

The honest reading of red_total is the trend in `red_snapshots`, not a single hour: 281 → 312 → 343 as the fleet's own
loops filed faster than the drain. This round removed a real blocker from the drain (18 tasks) and a structural gap in
the reconciler (superseded tasks never closed their issues); it did not, and cannot honestly claim to, reach zero.

---

## 7. Red drain, round 3: the deadlock generator, and 3011 closed

The data fix in §2 retired the 68 deadlocked contracts but left the thing that creates them. It is not a worker: it is
the D1 trigger **`contract_probe_templates_v3_generic`**, which born every issue with no machine-executable remedy a
contract whose probe reads that issue's own status and set it `active`. The trigger's own `action` text already said it
"measures nothing while the issue is open" — the status disagreed with the text, and that disagreement was the deadlock.

Changed (by hand; recorded verbatim in `migrations/2026-10-19-close-probe-generator.sql`, which is `APPLY-BY: manual`
so the applier skips it — a DROP/CREATE trigger on this table is exactly what deleted a working trigger in
migration_runs 292):

| read | before | after |
|---|---|---|
| closure-observing contracts in `active`/`holding` | 68 | **0** |
| a contract created through the v3 path | `active`, blocks every close | `superseded`, verdict `superseded:closure-observing-probe-at-birth` |
| probes that read `agent_issues` and stay active | — | 42, all the **v2d-loop** template: `pending…` while the issue is open (a deferral), `stale…` after 48h (a real fail with a real meaning) — not circular |

Verified by a live test insert on issue 3011: the contract came back `status=superseded`, `module=probe-template-v3-generic`
(test row deleted immediately). With both ends fixed, **issue 3011 closed**, and 3004 and 2871 are closed with it.

Remaining red at this point, and why each one is not a one-hour fix: 245 open issues (the loops file ~2/minute, so the
register grows while it drains), 32 breach contracts (each is a live failed check on a specific open issue), 78 failed
code tasks (model quality; the plumbing defects in that set are fixed), 42 queued (file-bound, see §6).
