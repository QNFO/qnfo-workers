# HANDOFF — 2026-10-19 (handoff backlog + R2 Basin Catalog + red drain)

Written at the end of the session that was told, in order: *review every `docs/HANDOFF` and implement the open items*,
*ensure all R2 files are queryable via Basin Catalog*, *never stop with red*, and *close out*. Every number below is a
read, with the query or endpoint that produced it.

---

## 1. State at handoff (qnfo-audit, 2026-10-19 14:2xZ)

| quantity | value | note |
|---|---|---|
| open issues | **273** | up from 245 during the session: the loops file ~1.5/min, each distinct |
| closed issues | 2,060 | 3004, 2871, 3011 closed in this session with `close_evidence` |
| breach contracts (`active`/`holding`, failing verdict) | **60** | 33 are `probe-template-v1h` metric probes reading a still-breaching metric — true state |
| failed code tasks | **78** | was 96; the 18 that moved are running (5 already `branch_pushed`) |
| in flight | 43 | file-bound: 28 sit on three workers |
| closure-observing contracts still `active` | **0** | was 68 at the start of the session |
| R2 files queryable through Basin SQL | **127,470** | 19/19 buckets catalog-enabled |

---

## 2. Shipped today (all merged, CI-recorded, live)

| PR | change | ledger evidence |
|---|---|---|
| #2276 | handoff items + R2→Basin Catalog coverage + `GUARD-RANGE-FIRSTPUSH-1` + fleet-tasks exporter | — |
| #2300 | `CODE-LOOP-SUPERSEDED-RECONCILE-1` (new task + 10-min cron) | cron fired 13:56, 14:02, 14:11, 14:21 — **all four failed**; see §2a |
| #2319 | `CLOSE-PROBE-CIRCULAR-GENERATOR-1` (trigger born superseded) | applied by hand; recorded verbatim, `APPLY-BY: manual` |
| — | `2026-10-19-verification-verdict-contract-state.sql` | `migration_runs` **303** ok 13:51:24Z |
| — | `2026-10-19-close-probe-circularity.sql` | `migration_runs` **302** ok 13:51:16Z |
| — | `2026-10-19-code-loop-superseded-reconcile.sql` | `migration_runs` **305** ok 14:07:10Z |

Two deadlocks died today, and both were **instrumentation**, not missing work:

1. **The verification rate was a measurement artifact.** 37,823 rows (31% of `remediation_verifications`) came from
   contracts parked as `superseded`/`monitoring`/`escalated`, which a row-level view reports as failures. Honest day
   rate: **5.8% on 2026-10-18**, not 45%. Live views: `v_verification_verdict_split_v2`, `v_verification_failure_rate`.
   v1 is left in place because published audits quote it.
2. **Closes were blocked by the contracts meant to verify them.** The generator is the D1 trigger
   `contract_probe_templates_v3_generic`, whose own `action` text said the template "measures nothing while the issue is
   open" while its status was `active`. Now born `superseded`; 68 standing deadlocks retired; a live test insert came
   back `superseded` (test row deleted). Issue 3004 closed through the path they had blocked.

---

### 2a. A correction this closeout owes you

The first version of this handoff said issue 2871 "closed on the reconciler's first run". That was wrong.

* `fleet_tasks` row was inserted with **`type='sql'`**. The dispatcher only parses a `steps[]` array for
  `type='workflow'`; for anything else it hands the step object straight to D1, which answers
  `D1_ERROR: Malformed input: {"params":[]}`, and the task fails before running a single statement.
* `fleet_runs` proves it: four runs (13:56, 14:02, 14:11, 14:21), **four failures**, no statement executed.
* 2871 was closed because the same SQL was run **by hand** while testing. The task itself has never succeeded.

Fixed at 14:31Z (`type='workflow'`, matching `code-loop-terminal-reconcile`, `portfolio-self-manage`, `red-drain`), the
migration now carries the lesson in its header, and the fix is verified the way the previous claim should have been —
the next run reads:

```
started 2026-10-18 14:31:27  status ok  result {"type":"workflow","steps_run":1,...}
```

The general lesson is worth more than the fix: **a cron firing is not a task running, and a closed issue is not proof the
automation closed it.** Read `fleet_runs.status` for the claim.

A second false alarm, recorded so the next session does not repeat it: while waiting for that run I twice concluded the
dispatcher had stalled. Both reads were wrong — first a `Get-Date ... Z` that prints local time with a literal `Z`
(it was 14:27Z, not 16:27Z), then a `fleet_runs` gap that was simply a gap between batches (`loop_lock` was renewing,
and the holder rotated `e6d57a8c → f37c50bd` while 17 runs landed in 15 minutes). Timestamps here need `julianday()` and
an explicit UTC label; a quiet window under ~15 minutes is not evidence of a stall.

---

## 3. Running without a session

| cron | cadence | what it does here |
|---|---|---|
| `code-loop-superseded-reconcile-10m` | */10 | resolves a `CODE-LOOP-EXHAUSTED-1` issue whose task reached `superseded` |
| `code-loop-terminal-reconcile-10m` | */10 | same for `merged` (pre-existing) |
| `red-drain-hourly` | 35 * * * * | retires unusable probes, parks metric conditions, snapshots red |
| `never-stall-hourly` | 5 * * * * | SLA ledger + stale lease release |
| `deferred-drain-4h` | 0 */2 | drains deferrals |
| R2 pipeline `r2_inventory` | on ingest | Iceberg writes for `ops.r2_object_inventory` |

---

## 4. Open, ranked, with the exact next step

1. **R2 inventory is a snapshot, not a feed.** The producer works and the table is queryable, but nothing schedules it:
   no repo secret holds the R2 S3 pair. Next step: add `CLOUDFLARE_R2_PRIMARY_ACCESS_KEY_ID` /
   `CLOUDFLARE_R2_PRIMARY_SECRET_ACCESS_KEY` (and `R2_INVENTORY_STREAM_URL`) as repo secrets, then a 1-hourly workflow
   running `python3 scripts/r2_inventory_catalog.py`. Until then re-run it by hand after any large R2 change.
2. **33 `probe-template-v1h` contracts fail** because the metric they read is still breaching. That is true state; the
   fix is the metric's own remedy, not the probe. List them:
   `SELECT c.class, c.issue_id, c.verify_probe FROM remediation_contracts c WHERE c.module='probe-template-v1h' AND c.status IN ('active','holding') AND c.last_verdict='fail'`.
3. **Quick Read items 1–3** (`QR_SEM_MIN` per shelf, numbered passage list, pre-warm default question) — each needs a
   measured before/after in `qnfo-gateway` and a `QR_CACHE_VERSION` bump. One lever at a time.
4. **`contracts_unexecutable_open` = 95.** 27 are metric probes that had not had their first probe yet (they clear
   themselves); 42 are the v2d-loop template that verifies closure rather than a remedy. The real fix is writing a
   measuring probe per issue — the remediation loop's job with model turns, not a threshold edit.
5. **Loop quality**: 78 failed tasks, dominated by goal-review rejections (13) and post-edit suite failures (8). The
   `SEARCH text occurs 0 times` group is all `qwen2.5-coder-32b`, a rung no longer in the ladder — debris, not a defect.
6. **Queue is file-bound** (28/45 on three files). Throughput rises by splitting a task per file, not by adding queue.

---

## 5. Landmines

1. **`migrations/2026-10-19-close-probe-generator.sql` is `APPLY-BY: manual` on purpose.** It DROPs and CREATEs a
   trigger on `remediation_contracts`; the applier's depth canary is what deleted a working trigger in `migration_runs`
   292. If you re-apply it by hand, `DROP TRIGGER IF EXISTS` first — the CREATE fails with "already exists" otherwise.
   The pre-change body is in `bak_20261019_probe_template_v3`.
2. **A data sweep without the generator fix re-breeds the defect.** Measured: two contracts were born circular in the
   11-minute window between the sweep (13:51) and the trigger fix (14:07). They were swept again at handoff, and the
   generator now cannot produce more — but the lesson is the ordering.
3. **`v_verification_verdict_split` (v1) is still installed and still wrong** for parked contracts. It is kept for
   reproducibility of published numbers; quote v2.
4. **Production can be ahead of main** (2987 from the previous handoff is still open).
5. **The register grows while it drains** (~1.5 issues/minute from the fleet's own loops). Judge the drain by
   `red_snapshots` trend, never by a single hour, and never by a single session's count.

---

## 6. Verify it yourself

```bash
curl -s https://qnfo-code-orchestrator.q08.workers.dev/health | head -c 200   # 0.18.15+, ladder is kimi/glm/gpt-oss
```

```sql
-- red trend (the number to watch)
SELECT ts, open_issues, contracts_breach, code_tasks_failed, red_total FROM red_snapshots ORDER BY id DESC LIMIT 6;
-- the corrected verification rate
SELECT * FROM v_verification_failure_rate ORDER BY day DESC LIMIT 5;
-- the deadlock class must stay at zero
SELECT count(*) FROM remediation_contracts
 WHERE instr(COALESCE(verify_probe,''),'FROM agent_issues WHERE id =') > 0
   AND instr(COALESCE(verify_probe,''),'''closed'' AS expected') > 0
   AND status IN ('active','holding');
-- a superseded task never leaves a false EXHAUSTED issue
SELECT a.id, t.status FROM agent_issues a JOIN code_tasks t ON instr(a.title,t.id)>0
 WHERE a.status='open' AND t.status='superseded';
```

```bash
# R2: every file, through Basin SQL
curl -s -X POST "https://api.sql.cloudflarestorage.com/api/v1/accounts/$CF_ACCOUNT/basin-sql/query/qnfo-audit" \
  -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"SELECT bucket, count(*) AS files FROM ops.r2_object_inventory GROUP BY bucket ORDER BY files DESC"}'
```

---

## 7. One line for the next session

The fleet's red is no longer inflated by two measurement deadlocks (verification rate, closure probes); what remains is
real work — 95 weak closing probes, 78 model-quality task failures, and a queue bound to three files. Fix work, not
instrumentation, and do not lower a bar to make a number move.
