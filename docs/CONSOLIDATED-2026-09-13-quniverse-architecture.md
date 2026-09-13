# QUniverse — consolidated architecture + verified defect record

Author: qnfo-ops (ops-exec). 2026-09-13. Every figure live-verified in D1 this session.
This supersedes the blocker list as originally stated; corrections are marked.

---

## PART 1 — MISSION / OBJECTIVE / STRATEGY

**Mission.** An open-science research collective publishing critical analyses of quantum
computing: p-adic mathematics, ultrametric geometry, topological QEC, thermodynamic limits
of computation. Published standard: every claim independently verifiable.

**Strategy.** A portfolio of named programs (ADL, UF, UMP, CMP, CON, PBO, QD, JPC, SR, CFE,
INM, GOV, ACRP, Consilient Gap Synthesis, KEPLER, ODR Thesis, QWAV.DEM/PLT) running over a
paper corpus, with KEPLER the only program carrying an explicit phase plan.

**Architecture (conceptual).** Three planes:
1. **Control plane** — deploy, drift-detect, calibrate, self-heal.
2. **Production plane** — research -> paper -> publish (Zenodo DOI -> R2 mirror -> index).
3. **Decision/memory plane** — intents -> triage -> tasks; register; Vectorize memory.

**Architecture (actual, verified).** 55 deployed workers. 8 D1 databases. 5 Vectorize
indexes. R2 buckets incl. `qnfo-canonical` (the deploy source of record for several
workers). The control plane is `qnfo-fleet-control`, which **self-reports as
`qnfo-fleet-deploy` v0.4.11**; a worker named `qnfo-fleet-deploy` does not exist (HTTP 404).
Its pre-guard source was tombstoned with a `404:` prefix on 2026-09-13; prior blob sha
`ed539ec3`, 24,761 B, retrievable by ref.

---

## PART 2 — THE CENTRAL STRUCTURAL FINDING

### There is one deployer, plus out-of-band local mutations

The original framing — "two competing deployers" — is **wrong**. Corrected:

- `fleet_deploys`: all 74 rows have `actor='deploy'`. **One deployer identity.**
- The `fabric-*` version stamps come from `deployment_history`, not from a rival deployer:

```
resource_name  fleet-6-workers
action         standardize-version
version_id     1.0.x+fabric.20260910
deployed_by    deepchat-agent
deployed_at    2026-09-11 09:04:42
status         success
notes          "Standardized 6 QNFO_VERSION workers to contract const VERSION (semver) +
                wired /health to VERSION; obsidian-writer got a new /health route.
                Deployed via PUT /workers/scripts/{name}/content (binding-preserving; ...)"
```

A **local DeepChat agent** called the Cloudflare API directly (`PUT /workers/scripts/{name}/content`),
bypassing the cloud deployer entirely, and rewrote six workers' version strings.

### The blast radius

`deployment_history.deployed_by` is dominated by local, one-off session actors:

| deployed_by | n |
|---|---|
| deepchat | 13 |
| agent | 10 |
| deepchat-infra-audit | 7 |
| deepchat-agent | 7 |
| deepchat-session | 3 |
| QNFO outreach-automation session | 2 |
| DeepChat parent (MJe0_YmuXONCc...) | 2 |
| projects-agent/v3.21 | 1 |
| deepchat-parent-audit | 1 |
| QNFO red-team session | 1 |
| QNFO reconciliation | 1 |
| QNFO engagement-strategy session | 1 |

**Every one of these is a local actor. The cloud deployer does not appear in this table at
all.** The fleet's version state has been mutated by many independent local sessions, each
stamping its own scheme. That is the origin of drift the deployer can never reconcile.

### Consequence

Drift scan, 2026-09-13 13:03:53Z:
```
scanned=55 clean=33 drifted=8 ahead=10 staleCanon=4
```
**22 of 55 workers are not clean.** `deployed-ahead` includes qnfo-ai (5.25.1 vs 5.21.3),
qnfo-ops (2.15.1 vs 2.13.0), qnfo-research-exec (0.8.1 vs 0.5.17-research-restored).
`canonical-ahead` is exactly the six fabric-stamped workers: qnfo-qwav, qnfo-paper-indexer,
qnfo-lifecycle, qnfo-email, qnfo-ddocs-indexer, qnfo-archive.

---

## PART 3 — EVERYTHING VERIFIED WRONG, RANKED

### 1. Two hourly deploy loops (53 of 74 deploys failed — CONFIRMED, 71.6%)

Two **different** defects, not one:

**personal-companion** — 25 consecutive failures, hourly, 09-12T12:01Z -> 09-13T13:01Z:
```
HTTP 400 code 10021: "Workflow GenerationFlow must be exported or a script_name must be specified"
```
A Workers Workflow binding/export defect. Began one hour after four successful downgrades
(`v1.1.0 -> 1.0.0` x2, `v1.0.0 -> 1.0.0` x2). Not R2-related.

**qnfo-cloud-ops** — 25 failures, hourly:
```
HTTP 400 code 10021: "Uncaught SyntaxError: Invalid or unexpected token at worker.js:1:2"
```
Verified divergence: GitHub `qnfo-cloud-ops/worker.js` is 129,457 B, sha `59dd468d`, and
**line 1 is valid** (`import { connect } from "cloudflare:sockets";`). The deploy fails at
1:2 on a file whose repo copy is valid at 1:2 => the R2 canonical object is corrupt. A
syntax error at column 2 is the BOM signature.

### 2. Deferral without dedupe (445 deferred — CONFIRMED, root cause found)

`self_heal_actions status='deferred'`: 445 rows, but only **7 distinct refs per kind**:

| kind | rows | distinct refs |
|---|---|---|
| health-ver | 221 | 7 |
| drift | 221 | 7 |
| errata-rearm | 3 | 1 |

One row per hourly scan for ~32 scans. **445 = 7 problems x 2 kinds x ~32 re-defers.** All
7 refs are fabric-stamped workers. Same no-dedupe defect class as the gw-fail emitter.

### 3. Register overdue, guard alerts but never drains (CONFIRMED)

`task_dod_register`: 219 rows, **99 open, 26 overdue**. (The register is
`task_dod_register`, NOT `calibration_register` — the latter has 10 future-dated rows.
I initially checked the wrong table and wrongly retracted this claim.)

`gtd-overdue-guard`, daily ~03:10Z:

| ts | status | overdue | scheduled_no_executor |
|---|---|---|---|
| 09-10 | alerted | 5 | 0 |
| 09-11 | clean | 0 | 0 |
| 09-12 | alerted | 7 | 0 |
| 09-13 | alerted | **26** | 0 |

**Trend 0 -> 7 -> 26 (~3.7x/day).** All 26 are `owner='agent'`. The guard reports
`overdue=26` while reporting `scheduled_no_executor=0` — it believes an executor exists
and the rows rot anyway. The register already contains the correct worklist: ids 202
(SQL ISO-Z vs space-format type-mixing), 187 (content-shape 400s), 189 (alert-storm
dedup), 185 (model roster drift), 198 (ensemble failure) are all defects I confirmed
independently today. **The register is not missing the work; it lacks the drain.**

### 4. Publishing fails silently (OVERSTATED — corrected to 30 of 40)

`cloud_ops_events kind='v2-drain'`: 40 events, all `status='ok'`. **30** carry `ok:false`;
10 are genuine DOI successes. Payload is in the `text` column, not `meta`.

| payload | n | window |
|---|---|---|
| `NL is not defined` | **19** | 09-11T12:41 -> 09-13T05:21 |
| `newversion failed: 400` | 7 | 09-03 -> 09-04 |
| `newversion failed: 504` | 2 | 09-13 |
| D1 bind error | 1 | 09-03 |
| quality gate (working as designed) | 1 | 09-11 |
| genuine success (DOI) | 10 | 09-03 -> 09-06 |

### 5. Auto-heal is a near no-op

`enabled=1`, `auto_heal=1`, yet `healed=0` in 8 of the last 10 scans; 3 heals in ~10 hours
against 22 non-clean workers.

### 6. Self-rewrite loop fails closed (NOT a defect vector)

`self_rewrite_state`: `jnl-referee apply -> reverted-or-rejected: snapshot read 404`, hourly
back to 02:05Z. It cannot apply anything. **This clears qnfo-autopilot of the deploy-
regression suspicion raised earlier.**

### 7. Memory plane stale, not empty (original claim WRONG)

- Not empty: `handoffs` 805 rows, `chat` 561, all 3 Vectorize indexes return matches.
- But stale: `notes` index `indexed_at 2026-08-07` (**37 days**), `tasks` newest 2026-07-02
  (**73 days**).
- Canary: **197/197 ok over 7 days**. The "90.6%" figure has **no source** — searching the
  literal string `90.6` across `cloud_ops_events` returns 0 rows. **Retracted.**

### 8. Model depth: routing, not roster, is the binding constraint

- `domain='code'`: **180 of 253 queries (71.2%) -> deepseek-v4-flash**; `kimi-k2.7-code` = 2.
- No code-correctness probe exists. `probeCompletion` passes on
  `status===200 && content.length>0 && model echo` — a 2B model scores 100%.
- `latency_max_ms = 8000`: a *passing* model slower than it is recorded `status:"fail"`.
  The fleet is structurally required to prefer fast over deep.
- Dominant gateway failures are caller bugs, not capability: `content-shape` 12,516 on
  qwen2.5-coder-32b; `tool-args-json` 297 on glm-5.2; `image-input` 300 on gemma-4-26b.
- Low-capability entries present: llama-3.2-1b, gemma-2b, granite-h-micro,
  `@cf/google/gemma-2b-it-lora` (14,171 neurons/30d).

### 9. Fixed during this session

`ops_issues_list` now returns rows (12 open). It previously returned 0 while D1 held rows.

---

## PART 4 — IDEAL ARCHITECTURE (what the current one is missing)

1. **One version authority.** No local session may PUT a worker. Version strings must be
   derived, not declared by whoever last held the keyboard. The 22-worker drift is
   entirely a consequence of violating this.
2. **Dedupe at every emit path.** The gw-fail emitter and the self-heal defer path both
   file the same condition repeatedly. Both need `(kind, ref, open)` uniqueness.
3. **Probes that measure capability, not liveness.** A probe that cannot distinguish a 2B
   model from a frontier model is not a probe. `latency_max_ms` must not penalise depth.
4. **Executors, not alerters.** `gtd-overdue-guard` and the drift scanner both detect
   correctly and execute nothing. Detection without a drain is telemetry, not control.
5. **Fail-loud status.** `status='ok'` must not be written when the payload says `ok:false`.
6. **Register as the single worklist.** It already holds the right items; it needs a drain
   wired to it.

---

## Limits of this record

- `fleet_deploys.ts` is type-inconsistent (ISO-with-T vs space-format), so date-range
  filters are approximate. Same for `agent_issues.updated_at`.
- I cannot read `qnfo-canonical` R2 objects. The BOM diagnosis is inference from the 1:2
  column offset, not a byte inspection.
- The `fleet_drift_report` early rows show `scanned=75` (2026-09-08) vs 55 today. The
  contraction is unexplained by anything I queried.
- The 26-overdue count is a 03:10Z snapshot, not live.
- I did not verify whether any external drain reads `task_dod_register`.
- **I cannot deploy, write D1, or delete R2 objects.** Every fix above needs an actuator
  this endpoint does not have. Production is unchanged by this work.
