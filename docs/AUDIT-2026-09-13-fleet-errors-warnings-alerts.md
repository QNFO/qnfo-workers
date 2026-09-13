# Fleet Error / Warning / Alert Audit — 2026-09-13

Auditor: qnfo-ops (ops-exec). Window: live state at 2026-09-13T14:08Z.
Sources: qnfo-audit D1, fleet_status, telemetry_report, email_stats, backlog_status.
Every count below is a tool result, not an estimate.

> **REVISION 2 (2026-09-13T14:20Z).** Revision 1 prescribed "export the Workflow
> class" for `personal-companion`. **That advice is withdrawn and must not be
> applied — it would cause a production downgrade.** See §0.5. Read §0.5 before
> acting on any fix in this document.

---

## 0. Headline

| Surface | Count | Status |
|---|---|---|
| Open agent_issues | 3 | 677, 687, 688 |
| agent_issues lifetime | 686 | 320 closed / 258 wontfix / 105 resolved |
| Chronic fleet_issue_log rows | 10 | each 84–93 occurrences |
| Deploys failing | 54 of 76 | 71% failure rate |
| Calibration probes failing | 1 of 28 | persistent, every run |
| Research queue terminal failures | 2 | 6 cumulative re-arms |
| Queue items stuck | 2 | version_queue 1, research_queue 1 |
| Tool failures 24h | 658 of 7,539 | 8.7% |
| Worker-health FAILED events | 13 | qnfo-ai + personal-api, 530 |
| Register overdue | 26 | regOpen 99, regDue7 51, regEscalated EMPTY |
| `scanerr:*` keys in fleet_deploy_state | **44** | 3 `nocanon`, 7 `stale-canon` |

The open backlog is 3, down from 15 two days ago. That number is **not** a
health signal: `fleet_issue_log` shows 10 chronic issues each firing 84–93
times, i.e. once per ~20-minute advisor cycle. The backlog drained; the
causes did not.

---

## 0.5 SAFETY CORRECTION — a failing deploy is not always a defect

**Revision 1's FIX-1 is withdrawn.** It read:

> FIX-1 personal-companion (hourly loop, 26 failures) — Fix: export the
> Workflow class from the deployed bundle entrypoint, or add `script_name`.

That is exactly backwards. A prior finding on this worker
(`personal-companion/FINDING-2026-09-13-deploy-loop-DO-NOT-FIX-10021.md`)
establishes that **the 10021 failure is the only thing preventing a downgrade**.
Verified this session:

| what | how | value |
|---|---|---|
| `auto_heal` | `fleet_deploy_state` | **`1`**, set 2026-09-08 16:25:49 |
| `enabled` | `fleet_deploy_state` | **`1`**, same timestamp |
| production version | drift row, 13:01:22 | deployed **`v1.1.0`** |
| deploy target | `fleet_deploys` rows 28→74 | **`1.0.0`** — lower |

Three defects are stacked on one worker:
1. the artifact is **older than production** (`1.0.0` vs `v1.1.0`);
2. the artifact is **structurally undeployable** (no `GenerationFlow` export);
3. the **comparator** misparses the version strings.

**Defect 2 is currently cancelling defects 1 and 3.** Removing defect 2 lets
`1.0.0` replace `v1.1.0` on the live worker, hourly, with `auto_heal=1` and
nothing to stop it.

### Defect 3 is now proven, not inferred

The comparator emits **opposite labels for the identical state**, differing
only by a leading `v`:

| ts | deployed_version | canonical_version | note |
|---|---|---|---|
| 13:01:22 | `v1.1.0` | `1.0.0` | **`canonical-ahead`** |
| 14:02:05 | `1.1.0` | `1.0.0` | **`deployed-ahead`** |

Same worker, same canonical, same 62-minute window. `v1.1.0` is parsed as
behind `1.0.0`; `1.1.0` is parsed as ahead of it. The leading `v` flips the
verdict. This is direct evidence for the comparator misparse previously
recorded as inference.

### Correct order of operations

1. `UPDATE fleet_deploy_state SET value='0' WHERE key='auto_heal'` — one row,
   reversible, and the only change that makes every later step safe.
2. Reconcile the canonical so it is **≥ v1.1.0** *and* exports `GenerationFlow`.
3. Fix the comparator (`qnfo-fleet-control/version-compare.mjs`).
4. Only then restore `auto_heal=1`, and re-verify from `/health`.

**Step 1 is a D1 write and this endpoint is SELECT/WITH only. I cannot perform
it.** Until it lands, do not act on FIX-1 or FIX-2.

### This endpoint is also a downgrade target

`qnfo-ops` (this auditor): deployed `2.15.7` / canonical `2.15.6`,
`deployed-ahead` at 14:04:05 — and at 13:03:10 the same worker read
`2.15.1` / `2.13.0`. A redeploy of this endpoint would regress it. Any
fleet-wide "heal the drift" sweep would downgrade the auditor.

---

## 1. Deploy plane — 54 failures / 22 successes

`fleet_deploys`: ok=0 → 54 rows (2026-09-09 18:02 → 2026-09-13 14:04),
ok=1 → 22 rows.

| Worker | fail/total | Exact error |
|---|---|---|
| personal-companion | 26/30 | `HTTP 400 code 10021: Workflow GenerationFlow must be exported or a script_name must be specified` |
| qnfo-cloud-ops | 25/25 | `HTTP 400 code 10021: Uncaught SyntaxError: Invalid or unexpected token at worker.js:1:2` |
| qnfo-fleet-advisor | 2/3 | `HTTP 415: Content-Type must be one of: application/javascript, text/javascript, multipart/form-data` |
| qnfo-observability | 1/1 | `HTTP 400 code 10021: Uncaught Error: No such module "fleet.js". imported from "worker.js"` |

### FIX-1 personal-companion — **DO NOT APPLY** (see §0.5)
The correct action is to disable `auto_heal`, not to make the deploy succeed.

### FIX-2 qnfo-cloud-ops (25/25, never succeeded)
`worker.js:1:2` SyntaxError is the signature of a `404:`-prefixed body being
uploaded as JavaScript. Every row's `source_path` is
`r2:qnfo-canonical/qnfo-cloud-ops.js`, and the deployer resolves R2 before
GitHub — so the GitHub canonical is correct and unused while the R2 object is
poisoned.

Drift direction: deployed `1.14.1` / canonical `1.14.1-gtd-guard`,
`canonical-ahead` — a suffix variant, so unlike FIX-1 this is not a downgrade.

**But clearing the R2 object alone does not fix it.** That requires a *valid*
`1.14.1-gtd-guard` artifact to upload; the object currently holds a tombstone,
and I do not hold the good bytes. Fix = rebuild the bundle, then overwrite the
R2 object, then confirm the deploy. Two of those three steps are outside this
endpoint.

### FIX-3 qnfo-observability (new, 2026-09-13T14:04:01Z)
`No such module "fleet.js"`. The repo directory **contains `fleet.js`**, so the
module exists in source. The deployer uploads a single file
(`<worker>/worker.js` or `<worker>/deployed-current.worker.js`) and does not
bundle sibling modules. So this is not a missing file — it is a
**multi-module worker the single-file deployer cannot express**.

Fix: either bundle `worker.js` + `fleet.js` into one artifact, or move
`fleet.js` to a separate worker reached by a service binding. Deployed 1.1.3,
canonical 1.1.4 — the canonical is the broken one, so this is not a downgrade.

### FIX-4 qnfo-fleet-advisor
Upload Content-Type is not a JS MIME type. Fix: set
`Content-Type: application/javascript` on the upload.

---

## 2. Version-format drift — 14 errors

Latest scan `2026-09-13 14:05:46`: `scanned=55 clean=33 drifted=9 ahead=9
healed=1 errors=0 staleCanon=4 healthVer=10
errKinds={"version-format":14,"stale-canon":4,"health-ver":10}`
`regOpen=99 regOverdue=26 regDue7=51 regEscalated=` (empty).

The `version-format` class is a **single label defect**: deployed version
strings read `<worker-name>/fabric-20260910` — name-prefixed and containing a
slash, instead of a bare version.

Affected (deployed vs canonical):
- qnfo-lifecycle `qnfo-lifecycle/fabric-20260910` vs `1.6.1-memory-maintain-fixed`
- qnfo-qwav `qnfo-qwav/fabric-20260910` vs `2.1.0`
- qnfo-paper-indexer `qnfo-paper-indexer/fabric-20260910` vs `2.2.0+scheduled-daily`
- qnfo-email `qnfo-email/fabric-20260910` vs `0.3.4-glm53`
- qnfo-ddocs-indexer `qnfo-ddocs-indexer/fabric-20260910` vs `1.0.0+server-side`

`fleet_heartbeat` has exactly one row: qnfo-lifecycle, version
`fabric-20260910`, ok=1. So `fabric-20260910` is a fleet-wide version label
written on 2026-09-10, not a worker name.

### FIX-5
Have the label writer emit bare semver (e.g. `1.6.1`) and set the worker-name
field separately. One change clears all 14 `version-format` errors plus the
4 `stale-canon` and 10 `health-ver` rows that depend on the same field.
Note this interacts with §0.5 defect 3: the comparator already mis-handles
prefixes, so fix the comparator before mass-normalising labels.

Also drifting: qnfo-signal-loop (1.1.2 vs 1.1.0), qnfo-research-exec (0.8.1 vs
0.5.17-research-restored), qnfo-ops (2.15.7 vs 2.15.6), qnfo-fleet-dashboard
(1.5.1 vs 1.1.0), qnfo-fleet-control (0.3.4 vs 0.3.3).

### FIX-5b roster reconciliation
`fleet_deploy_state` carries **44** `scanerr:*` keys. Three are `nocanon`
(no canonical at all): `qnfo-container-executor`, `qnfo-scorecard`,
`qnfo-wrangler-test`. Seven are `stale-canon`: `obsidian-writer`,
`osf-integrity-check`, `personal-life-maintain`, `qnfo-arxiv-radar`,
`qnfo-research-radar`, `qnfo-twin-maintain`, `research-daily-brief`.
The same keys include names the service registry describes as merged into
`fleet-exec` / `errata-hub`. Two rosters, unreconciled.

---

## 3. Calibration — 1 persistent failure, and a pass that masks failures

Latest 5 runs (30-min cadence, ~45–64s each):
`cal-1789308077063-700724`, `cal-1789306257835-da70bf`, `cal-1789304457836-60b969`,
`cal-1789302657835-6dca53`, `cal-1789300857837-4853f1` — **all identical:
total 28, pass 27, fail 1, digest `{"failing":[],"drift_models":[]}`**.

The failing probe (row id 15975):

```
probe=endpoint  target=deepseek-direct/models  status=fail  latency_ms=164  detail="http=200"
```

### FIX-6
The probe receives HTTP 200 and still reports `fail`, so its assertion tests a
field the endpoint does not return. Fix the assertion. Note the digest reports
`failing:[]` while a probe is failing — the digest does not read its own
results, so this failure is invisible in every summary.

### FIX-7 gateway-sweep is a pass-through
Row id 15948: `probe=gateway-sweep status=pass` with detail:

```
400 @cf/qwen/qwen3.8-27b x18 [upstream];
429 @cf/moonshotai/kimi-k2.6 x6 [rate-capacity];
429 @cf/moonshotai/kimi-k2.7-code x2 [rate-capacity];
429 @cf/zai-org/glm-5.2 x1 [rate-capacity];
400 @cf/qwen/qwen2.5-coder-32b-instruct x42 [content-shape];
400 @cf/zai-org/glm-5.2 x1 [tool-args-json]
```

It records hundreds of gateway failures and reports `pass`. Make the probe
fail (or warn) when the error classes exceed a threshold.

---

## 4. Model health — stale counters, no recovery path

`ai_model_health`:

| model_id | status | gateway_failures | last_probe_ts |
|---|---|---|---|
| qwen2.5-coder-32b | ok | **10,836** | 1789145063740 |
| kimi-k2.6 | ok | 516 | 1789308100157 |
| glm-5.2 | ok | 362 | 1789145063740 |
| gpt-oss-120b | ok | 0 | 1789308100179 |
| deepseek-v4-pro-wa | ok | 0 | 1789308101323 |

`1789145063740` = 2026-09-11T16:44:23Z — **~2 days stale** — yet `status=ok`.
`consecutive_failures=0` on every row, including the one with 10,836 gateway
failures.

`ai_gateway_failures` (aggregate rows) still shows the same classes:
`@cf/qwen/qwen2.5-coder-32b-instruct` 400, `@cf/baai/bge-base-en-v1.5` 429.

### FIX-8
`status` is written without a measured counter and nothing clears it. Require
`consecutive_failures` before setting a degraded status, and add
recovery-on-probe-pass. As-is the column cannot distinguish a healthy model
from an abandoned one.

---

## 5. Research pipeline — 2 terminal failures, 1 infinite retry

`research_queue` by status/stage:

| status | stage | count | re-arms | max attempt |
|---|---|---|---|---|
| published | done | 19 | 3 | 3 |
| ensemble-draft | reconciled | 3 | 0 | 0 |
| **failed** | ensemble | **2** | **6** | 3 |
| **pending** | ensemble | **1** | 0 | **12** |

The two failed rows:

- `44c884d7-23ae-4aeb-968d-cc7011688619` (source_id 51) — status `failed`,
  stage `ensemble`, attempt 3, `recover_count: 2`, `terminal_rearms: 3`,
  `error: "ensemble: only 0/3 legs produced drafts"`,
  `context: {"pipeline":"0.8.0-artifact-deposit","bibCount":0,"srcFetched":false}`
- `8506ba43-be2c-4ada-be7d-70c4d79f35d3` (source_id 45) — identical signature.

These are open issues **687** and **688**, and they generate the two largest
critical alert streams: `terminal research failure 45 -> agent_issues dup`
×121 and `terminal research failure 51 -> agent_issues dup` ×71, re-fired every
15 minutes (latest 2026-09-13 14:01:20/14:01:21).

The third row `9e5dd9e1-0d77-479a-b581-becdaa140965` (source_id 40) is
`pending` with **`attempt: 12`** — it loops without ever going terminal. Note
its context has `bibCount:1, srcFetched:true` while both failures have
`bibCount:0, srcFetched:false`.

### FIX-9
The failures carry `srcFetched:false` and `bibCount:0` — the ensemble legs run
with no source material. Gate the ensemble stage on a non-empty source/bib
context, or make leg dispatch surface its own error instead of collapsing to
`0/3 legs`. Also cap `attempt` for the pending row; 12 attempts with no
terminal transition is an unbounded loop.

Related chronic issues (`fleet_issue_log`, each ~93 occurrences):
`integration-chain Research execution (queue -> papers)`,
`integration-chain Research intake (radar -> ideas -> triage)`,
`integration-chain Telemetry (trace -> worker_logs)`.

---

## 6. Stuck queues

- `version_queue` id 18 — status `drafted`, created 2026-09-11 10:22:29,
  updated 2026-09-13 14:05:07 (still churning after 2 days),
  `10.5281/zenodo.22706406 -> 2.0.2`, new DOI `10.5281/zenodo.22732639`.
  This is open issue **677**. `recover_count: 1`.
- `research_queue` — 1 pending at attempt 12 (see FIX-9).
- `idea_proposals` — **543 `triaged_hold`**, 14 `triaged_accepted`, 1
  `ensemble-registered`.

`fleet_issue_log`: `Queue version_queue` **err** ×84,
`Queue research_queue` **err** ×93, `Queue outreach_queue` warn ×93.

### FIX-10
The INTAKE-STALL alert text reads `496 proposals stuck new` while the actual
status is `triaged_hold` (543). The alert mislabels the state, so its count
cannot be reconciled. Fix the label; then decide whether `triaged_hold` is a
terminal state or needs an executor.

---

## 7. Health probes — CF error 1042 and HTTP 530

`fleet_cal_anomalies` id 3 — **status: open**:
```
probe_id=qnfo-auditor-health  metric=latency_ms  severity=high
detail="probe-failure status:404 body:error code: 1042 retry-failed"
first_seen=2026-09-12T03:01:13.335Z  last_seen=2026-09-13T03:31:09.457Z
```

CF **error 1042** is a Worker attempting to fetch a `*.workers.dev` URL.
The probe is using a public URL where a service binding is required.

### FIX-11
Replace the workers.dev fetch in `qnfo-auditor-health` with a service binding.
This is the documented fleet rule and the only correct fix.

`cloud_ops_events` — `worker-health FAILED` ×13, all at 03:05 daily, latest
2026-09-13T03:05:43.922Z, payload:
```
{"worker":"qnfo-ai","status":530,"error":"HTTP 530 body:error code: 1016"},
{"worker":"personal-api","status":530,...}
```
HTTP 530 / CF 1016 = origin DNS failure — the custom-domain route is not
bound for those hosts. It surfaces as the daily email
`QNFO AI endpoint health alert` (emails 705 on 09-13T03:05, 702 on 09-12T15:05).

### FIX-12
Either bind the custom domain or point the health check at the workers.dev
host. A daily 530 on the AI gateway is a false alarm that trains operators to
ignore the alert.

`fleet_error_state` (8 rows, most recent seen_at):
`personal-api` 2, `qnfo-container-executor` 3, `calendar-api` 1,
`job-market-watch` **9**, `__unknown__` 2, `qnfo-fleet-dashboard` 4,
`qnfo-fleet-advisor` 3, `qnfo-citation-watch` 2.
`fleet_issue_log`: `9 worker(s) with 24h errors` — sev **err**, ×93.

---

## 8. Tool-failure telemetry

`telemetry_report` 24h: **7,539 calls, 658 failures (8.7%)**, 199 chats,
26 chat failures.

| tool | 24h failures | lifetime failures |
|---|---|---|
| web_fetch | 276 | 633 |
| ops_d1_query | 181 | 626 |
| github_repo_read | 66 | 128 |
| github_file_write | 66 | 88 |
| web_search | 28 | 55 |

Hourly distribution (`cloud_ops_events`, kind `ops_ai_tool`, status `error`):
`2026-09-13T13`=255, `T06`=243, `T07`=109, `T14`=48, `T12T13`=77.
Failures cluster in agent-session hours — this is agent-driven traffic, not
cron traffic.

`telemetry_analyze` (24h): `scanned=11 persistent=[] recovered=7 autoResolved=0
filed=0 alreadyOpen=3`. **No persistent tool failure** — the analyzer found
7 recoveries and filed nothing. The failures are transient, so no new
self-heal ticket is warranted. Do not read the 658 as 658 distinct defects.

Known schema defect: `ops_d1_query` rejects valid SQL when the table/column is
wrong and its errors are counted as tool failures. Several of the 181 were
caused by probing columns that do not exist (`failures`, `model`), which is a
discoverability gap, not a service fault.

---

## 9. Alerts table

`alerts`: critical **802**, warning 171, info 92, warn 15, error 16, HIGH 4.
Latest critical 2026-09-13 14:01:22.

The 802 criticals are dominated by the research-pipeline re-fires:
`terminal research failure 45` ×121, `research pipeline: failed=1 ...` ×103,
`terminal research failure 40` ×72, `terminal research failure 51` ×71,
`INTAKE-STALL escalated` ×24, `research pipeline: failed=2 ... vqErr=1` ×23.

Three causes produce the bulk: FIX-9 (ensemble), FIX-10 (intake), FIX-6/7
(calibration). The alert volume is a function of the 15-minute re-fire cadence,
not of independent faults.

---

## 10. Fix queue, ranked (corrected)

| # | Fix | Owner | Blocks | Safe to apply now? |
|---|---|---|---|---|
| 0 | `auto_heal='0'` (§0.5 step 1) | D1 write | **everything else** | needs D1 write |
| 1 | Comparator leading-`v` fix (FIX-5 / §0.5) | qnfo-fleet-control | wrong drift labels | yes, code |
| 2 | Emit bare semver, drop `<name>/` prefix (FIX-5) | label writer | 14+4+10 drift rows | after #1 |
| 3 | Gate ensemble on src/bib context; cap attempt (FIX-9) | qnfo-research-exec | 687/688, ~192 criticals | yes, code |
| 4 | Fix `deepseek-direct/models` assertion + digest (FIX-6) | qnfo-ai-calibration | 1/28 probes | yes, code |
| 5 | workers.dev fetch → service binding (FIX-11) | qnfo-auditor-health | open anomaly | yes, code |
| 6 | Rebuild + re-upload qnfo-cloud-ops R2 object (FIX-2) | R2 write + build | 25 deploys | needs R2 write |
| 7 | Bundle `fleet.js` (FIX-3) | qnfo-observability | 1 deploy | yes, build |
| 8 | Require measured counter for degraded (FIX-8) | qnfo-ai-calibration | model health | yes, code |
| 9 | Make gateway-sweep fail on thresholds (FIX-7) | qnfo-ai-calibration | masked errors | yes, code |
| 10 | Unstick version_queue id 18 (FIX-10) | jnl/zenodo publisher | issue 677 | yes, code |
| 11 | Fix 530 custom-domain health check (FIX-12) | DNS / health prober | 13 FAILED/day | needs DNS |
| 12 | Correct INTAKE-STALL label (FIX-10) | qnfo-signal-loop | 24 criticals | yes, code |
| — | ~~Export `GenerationFlow` (old FIX-1)~~ | — | — | **DO NOT APPLY** |
| 13 | Reconcile 44 `scanerr:*` keys / two rosters (FIX-5b) | registry owner | 3 nocanon, 7 stale | yes, code |

---

## 11. What this audit could NOT establish

- The `personal-companion` **live** version is asserted from `/health` in the
  prior finding, not re-fetched this session. Its downgrade attempts are
  proven; its present state is corroborated by the drift row only.
- The R2-first resolution order in `qnfo-fleet-deploy` is **inferred** from
  `source_path` values and the 404-prefixed body, not read from the resolver.
- The pre-fix comparator source is **unavailable** — the documented archive
  pointer `qnfo-fleet-deploy/worker.js@ed539ec3` returns `path not found`
  (retried with the full sha and alternate paths). The leading-`v` misparse is
  therefore supported by the two contrary drift rows in §0.5 rather than by
  reading the comparator.
- The ensemble root cause is **inferred** from `srcFetched:false`/`bibCount:0`
  in the failed rows. The leg-level dispatch logs were not available.
- `ai_queries` is a capped sample (~2,600 rows) against ~264k worker requests
  per 30d, so any routing percentage is sample-based.
- Direct-API model spend (claude/gpt/deepseek-direct) is invisible to
  `cf_analytics`, which only counts Workers AI neurons (790,847 ≈ $8.70/30d).
  That figure is **not** total fleet AI spend.
- `fleet_deploys` is **not** the complete deploy record: `personal-companion`
  `modified_on` = 2026-09-13T13:32:01.743Z while its newest ledger row is
  13:01:23. Scripts change with no ledger row.
- `ops_issue_run` refused to execute: it requires explicit affirmation in the
  latest user message and returned `dryRun:true, openBacklog:3`. No issue was
  closed by this audit.

## 12. Actuators this endpoint does not have

No deploy, no D1 write, no R2 write/delete, no git ref creation. Every FIX
above is a specification. Critically, **§0.5 step 1 is a D1 write** — so the
single highest-leverage action in this document is outside my reach, and
FIX-1/FIX-2 must remain untouched until someone performs it.
