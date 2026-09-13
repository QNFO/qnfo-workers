# CORRECTION — the worker census is resolved (55 is not the fleet), and the gateway "replay" claim is REFUTED

Author: qnfo-ops (ops-exec), 2026-09-13 ~13:40Z. Every figure is a live tool return from this
session. Supersedes the corresponding limits sections of
`docs/FULLSTACK-INTEGRATION-PLAN-2026-09-13.md` and
`docs/HANDOFF-2026-09-13-quniverse-blockers.md`.

Two items I had flagged as "unresolved" were resolvable with tools I had not yet used. One is now
settled in favour of the fleet being much larger than 55. The other overturns a finding.

---

## 1. RESOLVED — `fleet_status` lists 55; the fleet stores know at least 93

Seven stores describe "the workers". They do not agree, and the reason is now clear.

| store | rows | what it actually is |
|---|---|---|
| `analytics_dash_workers` | 10 | top-N by request count, not a census |
| `audit_workers` | 37 | **legacy inventory**, last modified 2026-05-28 → 2026-07-17 |
| `deployment_history` (worker) | 43 | deploy ledger, **stale at 2026-09-11T10:34:07Z** |
| `fleet_status` / `service_registry` | 55 | the CF API listing qnfo-ops reads |
| `fleet_probe_log` (worker names) | **80** | every name ever probed |
| repo worker dirs | 92 | source, incl. never-deployed |
| repo entries | 97 | source + docs/audits/funding/papers/machine-readability |

### The decisive proof

`qnfo-pipeline-ops` is **absent** from the 55-worker listing. It is also **demonstrably live**:

```
SELECT source, digested, COUNT(*), MAX(created_at) FROM alerts GROUP BY source, digested
→ source='qnfo-pipeline-ops', digested='auto', n=910, last_created=2026-09-13 12:16:00
```

It wrote 910 rows to `alerts`, the most recent **one hour before this session**, while being
invisible to the listing the deploy scan iterates. `fleet_probe_log` also holds **131**
`cf-api-list` rows with `ok=1` for it — and that transport only succeeds when the name is found in
the API listing. So the API *does* return it; the 55-row listing does not.

**Conclusion: 55 is a scoped or truncated view, not the account total.** Every "X of 55" figure in
my previous documents is scoped wrong.

### The two sets are partially disjoint, and the pattern explains itself

| direction | count | membership |
|---|---|---|
| probed but **not** in the 55 | **38** | `jnl-*`, `personal-life-*`, `qnfo-errata-*`, `events-radar`, `personal-events-radar`, `qnfo-arxiv-radar`, `qnfo-citation-watch`, `qnfo-research-radar`, `fleet-executor`, `fleet-scheduler`, `qnfo-fleet-advisor`, `qnfo-fleet-calibrator`, `qnfo-fleet-deploy`, `qnfo-idea-factory/miner/triage`, `qnfo-pipeline-ops`, `qnfo-register-guard`, `qnfo-error-selfheal`, `qnfo-blank-audit`, `qnfo-code-agent`, `qnfo-code-orchestrator`, `qnfo-containers-pilot`, `qnfo-container-executor`, `qnfo-analytics`, `qnfo-auditor`, `qnfo-skills-discovery`, `qnfo-thread-ingest`, `qnfo-venue-radar`, `job-market-watch` |
| in the 55 but **never probed** | **13** | `audit-hub`, `companion-hub`, `errata-hub`, `idea-hub`, `jnl-pipeline`, `fleet-exec`, `radar-hub`, `qnfo-fleet-control`, `qnfo-signal-loop`, `qnfo-autopilot`, `qnfo-subscribers`, `ai-health-prober`, `personal-companion` |

The probe-only set is the **pre-merge** topology. The fleet-only set is the **post-merge** hubs
(`fleet-exec` ← fleet-executor + fleet-scheduler; `radar-hub` ← events-radar + arxiv-radar +
research-radar + citation-watch; `fleet-control` ← advisor + calibrator + deploy) plus newer
workers. The two stores are snapshots of two different topologies, never reconciled.

**Union of worker names = 55 + 80 − 42 = 93.**

Set arithmetic caveat: `fleet_probe_log`'s 83 distinct names include three hostnames
(`qnfo.org`, `fleet.qnfo.org`, `papers.qnfo.org`); because `"qnfo.org".includes(".qnfo.org")` is
false, one host was counted as a worker in my diff. Real figures: **80 worker names, 3 hosts**, and
**38** (not 39) workers probed but unlisted.

---

## 2. REFUTED — `ai_gateway_failures` does not replay a frozen window

The handoff claimed the sweep "replays one window forever", so the 24h auto-close
(`COUNT(*) WHERE ts > t0-24h = 0`) could never hold, making the gw-fail tickets artifacts. The
test is duplicate timestamps. Live:

| model | rows | distinct `ts` | duplicate rows | Σ count | Σ/rows |
|---|---|---|---|---|---|
| `@cf/baai/bge-base-en-v1.5` | 396 | **396** | 0 | 37,159 | 93.84 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | 397 | **397** | 0 | 16,674 | 42.00 |
| `@cf/qwen/qwen3.8-27b` | 336 | **336** | 0 | 3,507 | 10.44 |
| `@cf/moonshotai/kimi-k2.6` | 397 | **397** | 0 | 994 | 2.50 |
| `@cf/zai-org/glm-5.2` | 639 | 397 | **242** | 639 | 1.00 |
| `@cf/google/gemma-4-26b-a4b-it` | 396 | **396** | 0 | 396 | 1.00 |
| `@cf/moonshotai/kimi-k2.7-code` | 50 | **50** | 0 | 100 | 2.00 |

**6 of 7 models have `rows == distinct ts`** — every row is a distinct sweep. The window spans
**8.23 days**, and at a `*/30` cadence that is **395** sweeps, matching the ~396 observed rows
almost exactly. This is the signature of a live sweep, not a replay.

### What survives, and what I got wrong

- **My earlier claim is withdrawn:** *"SUM(count)=3638 for bge is the artifact of summing a frozen
  counter."* It is not. Σ/rows = 93.84 per sweep, and 3,638 over 48 sweeps/day ≈ 75.8 — a
  legitimate 24h total. The drainer's `"gateway failures CURRENT: 3638/24h - real defect"` is
  therefore **correct**, not noise.
- **The auto-close defect is real, for a different reason.** `bge-base-en-v1.5` fails in ~every
  sweep, so `COUNT(*) WHERE ts > t0-24h` is ~48, never 0. Continuous failure blocks the close — not
  replay.
- **A narrower real defect is confirmed:** `glm-5.2` holds **639 rows across 397 timestamps** —
  242 duplicate rows, each `count=1`. It double-inserts per sweep. The other six models do not.

---

## 3. CONFIRMED — the alert channel is 83% one worker digesting itself

`alerts` = **1,097 rows total** (the 20 groups returned by the `GROUP BY` sum exactly to 1,097).

| `source` | `digested` | rows |
|---|---|---|
| **`qnfo-pipeline-ops`** | **`'auto'`** | **910** |
| `qnfo-error-selfheal` | `1` | 49 |
| `qnfo-backlog-exec` | `1` | 21 |
| `qnfo-error-selfheal` | `NULL` | 18 |
| `worker-health` | `1` | 15 |
| `qnfo-pipeline-ops` | `1` | 14 |
| `qnfo-backlog-exec` | `NULL` | 12 |
| (12 further groups) | | 58 |

`digested='auto'` = 910 (83.0%) · `digested=1` = 141 · `digested IS NULL` = 46.
The 910 all carry `source='qnfo-pipeline-ops'`: the worker is digesting its own rows. The handoff's
"910 of the digested rows" figure is **confirmed exactly**.

---

## 4. Two more stale ledgers found

- **`audit_workers` (37 rows) is abandoned.** Every name is legacy (`api-gateway`,
  `archive-worker`, `ask-qwav`, `braid-matrix`, `cms-api`, `cron-*`, `papers-server`,
  `qwav-unified`, `ultrametric-tree-api` …), last modified 2026-05-28 → 2026-07-17, and
  **`in_discovery_index = 0` for all 37 rows**. Only `qnfo-lifecycle` overlaps the current fleet.
- **`deployment_history` is a second, divergent deploy ledger.** 43 worker rows, newest
  **2026-09-11T10:34:07Z** — while `fleet_deploys` records attempts through
  **2026-09-13T13:01:23Z**. Two deploy ledgers, two different last-write times, no reconciliation.
  This is the same "two writers, one fact" pattern as the version-truth conflict.

`fleet_error_state` holds only 8 rows, all stale (newest `job-market-watch`, 9 errors,
2026-09-10T08:17:39Z) — it is not a live error source.

---

## 5. What this changes in the plan

| item | before | after |
|---|---|---|
| census | "contested, 55 vs 101" | **resolved: ≥93 worker names; 55 is a scoped view** |
| gw-fail tickets | "replay artifact, non-informative" | **real: 6/7 models fail continuously; tickets are legitimate** |
| remediation priority | fix the sweep's replay | fix `glm-5.2` double-insert; the sweep is otherwise sound |
| contract A scope | "48 of 55 rows lack routes" | **48 of 55 *listed* rows** — the unlisted 38 have no registry row at all |

The last row matters: 38 live-or-once-live workers have **no** `service_registry` entry. The
discovery gap is larger than the 87.3% missing-routes figure suggested.

## 6. Limits

- The 93 is a **union of two stores**, not a verified account count. A direct account-wide CF API
  read is still unavailable from this endpoint.
- `alerts` total 1,097 rests on the 20 returned groups summing to 1,097; the `LIMIT 20` could have
  truncated a 21st group. The arithmetic is consistent but not proof of exhaustiveness.
- "`qnfo-pipeline-ops` is live" rests on its `alerts` writes and probe-log rows, not on a `/health`
  probe — it cannot be probed from here, which is the original problem.
- The replay test used `COUNT(DISTINCT ts)` on 7 models; other models may behave differently.
- `glm-5.2`'s 242 duplicate rows are counted, not explained; the inserting code was not read.
