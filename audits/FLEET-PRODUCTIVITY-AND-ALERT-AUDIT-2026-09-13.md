# Fleet productivity + alert audit — 2026-09-13

Author: qnfo-ops endpoint (Chatbox client session). **Every figure below is a tool return
from this session.** Nothing is carried over from a prior note; where a prior claim is
contradicted it is named in §8.

Scope: (a) which workers actually do work, (b) which are firing and doing nothing and
should be merged, (c) every error / warning / alert, audited to root cause.

---

## 1. Roster state — 55 deployed, 12 probed

`fleet_status` → `deployedCount: 55`, `healthyCount: 12`, `total: 55`.

The 12 workers with a reachable health probe (`healthy: true`, HTTP 200):
`qnfo-ai` 5.25.1 · `qnfo-ai-search` 1.0.2 · `qnfo-archive` 1.2.0 · `qnfo-backlog-exec` 1.2.8 ·
`qnfo-email` 1.8.0 · `qnfo-email-orchestrator` 0.3.4 · `qnfo-gateway` 3.6.1-subscribers ·
`qnfo-kaizen` 0.3.2 · `qnfo-lifecycle` 1.6.1 · `qnfo-memory-mcp` 2.0.3 · `qnfo-paper-indexer` 2.2.0 ·
`qnfo-skill-sync` 1.1.2.

**43 of 55 (78%) return `healthy: null`, `probe: "api"`** — no health verdict of any kind.
This is the standing `FLEET-MONITORING` defect (agent_issues 701) and it is the reason the
answer to "which workers are useless?" cannot be read off the health column.

---

## 2. Productivity ledger — who does real work

`worker_activity_daily`, latest snapshot per worker for 2026-09-13 (`req24` = rolling 24h requests).

### 2.1 Productive — ≥10 req/24h (31 workers)

| req24 | worker | | req24 | worker |
|---|---|---|---|---|
| 1656 | qnfo-ai | | 102 | qnfo-archive |
| 1462 | fleet-exec | | 100 | qnfo-paper-reviser |
| 1387 | calendar-api | | 99 | qnfo-skill-sync |
| 725 | qnfo-ops | | 89 | qnfo-outreach |
| 543 | personal-companion | | 81 | qnfo-social |
| 355 | qnfo-fleet-dashboard | | 46 | qnfo-ai-calibration |
| 259 | qnfo-backlog-exec | | 33 | qnfo-autopilot |
| 224 | idea-hub | | 23 | ai-health-prober |
| 201 | qnfo-kaizen | | 22 | qnfo-infra |
| 182 | personal-api | | 22 | qnfo-cloud-ops |
| 175 | qnfo-lifecycle | | 22 | qnfo-signal-loop |
| 154 | qnfo-paper-indexer | | 21 | qnfo-intent-orchestrator |
| 148 | qnfo-research-exec | | 17 | qnfo-chat-canary |
| 145 | jnl-pipeline | | 13 | qnfo-ddocs-indexer |
| 143 | qnfo-observability | | | |
| 119 | qnfo-email-orchestrator | | | |
| 109 | qnfo-fleet-control | | | |

### 2.2 Marginal — 3–9 req/24h (3 workers)

`audit-hub` 5 · `companion-hub` 5 · `qnfo-events` 4

### 2.3 Idle — ≤2 req/24h (6 workers)

`radar-hub` 2 · `research-daily-brief` 2 · `qnfo-impact` 1 · `qnfo-twin-maintain` 1 ·
`osf-integrity-check` 1 · **`qnfo-paper-explainer` 0**

`qnfo-paper-explainer` is the only worker at a true zero. It holds a `scheduled` handler, was
last modified 2026-09-11T14:02Z, and its registry entry claims a daily arXiv→plain-English
pipeline with fact-check and social posting. **It fired and produced nothing measurable in 24h.**
This is the single clearest "firing and nothing happens" case in the fleet.

---

## 3. Already-merged tombstones — 19 names with activity that fell to zero

These workers had real activity on 2026-09-11 and **exactly 0 on 2026-09-12** (wave A/B merges):

| worker | 09-11 peak | merged into |
|---|---|---|
| fleet-scheduler | 1472 | fleet-exec |
| qnfo-fleet-advisor | 395 | qnfo-fleet-control |
| jnl-watch | 171 | jnl-pipeline |
| jnl-referee | 89 | jnl-pipeline |
| qnfo-errata-publish | 78 | errata-hub |
| qnfo-errata-respond | 68 | errata-hub |
| qnfo-errata-watch | 59 | errata-hub |
| qnfo-error-selfheal | 43 | (merged) |
| personal-events-radar | 41 | radar-hub |
| qnfo-citation-watch | 23 | radar-hub |
| qnfo-fleet-calibrator | 23 | qnfo-fleet-control |
| job-market-watch | 20 | (merged) |
| qnfo-auditor | 17 | audit-hub |
| personal-life-indexer | 16 | (merged) |
| qnfo-analytics | 15 | (merged) |
| qnfo-blank-audit | 12 | (merged) |
| events-radar | 11 | radar-hub |
| qnfo-arxiv-radar | 1 | radar-hub |
| personal-life-maintain | 1 | (merged) |

**The consolidation the user is asking for has largely already happened.** These 19 are
tombstones, not live workers.

**But their names persist in `fleet_deploy_state` as `scanerr:*` keys for ≥38 workers** —
including `fleet-scheduler`, `fleet-executor`, `qnfo-errata-watch/respond/publish`,
`qnfo-thread-ingest`, `qnfo-research-radar`, `qnfo-container-executor`, `qnfo-scorecard`,
`qnfo-wrangler-test`. Three of those are `nocanon` (no canonical at all). **This is the
"second unreconciled roster"**: a phantom fleet of ~38 dead names sitting in the control
plane, which is why different tools report different fleet sizes.

---

## 4. Untracked — 15 deployed workers with NO activity row

`errata-hub` · `obsidian-writer` · `qnfo-agent-orchestrator` · `qnfo-agent-ws` · `qnfo-ai-search` ·
`qnfo-email` · `qnfo-gateway` · `qnfo-ipatent` · `qnfo-memory-mcp` · `qnfo-pdf` · `qnfo-proof` ·
`qnfo-qwav` · `qnfo-research-supervisor` · `qnfo-subscribers` · `qnfo-tools-mcp`

They are **not idle — they are unmeasured.** `analytics_dash_workers` shows several are busy
(`qnfo-memory-mcp` 6605, `calendar-api` 3532, `qnfo-email` 3380, `qnfo-tools-mcp` 2792), while
`worker_activity_daily` reports `calendar-api` at 1420 for the same window. **The two tables
disagree**, so neither can be used alone to decide a worker's fate. This is agent_issues 714
(ISSUE-SYSTEM-SPRAWL) in its measurement form.

---

## 5. Consolidation plan

| action | target | basis |
|---|---|---|
| **Instrument, do not merge** | `errata-hub`, `audit-hub`, `companion-hub`, `radar-hub`, `idea-hub`, `jnl-pipeline`, `fleet-exec` | These are the *destinations* of waves A/B. `fleet-exec` 1462 and `idea-hub` 224 are highly active. Merging them further concentrates blast radius. Their `purpose: null` in the registry is a documentation gap, not a redundancy. |
| **Fix, do not merge** | `qnfo-paper-explainer` (req24 = 0) | A zero on a worker with a declared daily pipeline is a *defect*, not a redundancy. Merging it would hide the failure. Root cause unknown — needs its cron log, which is not in `worker_activity_daily`. |
| **Purge** | the ~38 `scanerr:*` keys in `fleet_deploy_state` naming dead workers | Removes the phantom roster that makes fleet-size reports disagree. Reversible. |
| **Merge candidate** | `qnfo-qwav` (registry: *"Legacy QWAV research API"*) | Self-described legacy; overlaps `qnfo-archive` (paper-pipeline) and `qnfo-ai-search`. |
| **Reconcile** | `worker_activity_daily` vs `analytics_dash_workers` | Until they agree, no merge decision on the 15 untracked workers is defensible. |

---

## 6. Alert audit — 1,101 alerts, all traced

`alerts` (schema: `id, source, level, message, digested, created_at`).

**By level:** critical **806** · warning **186** · info **93** · error **16**
**By source:** `qnfo-pipeline-ops` **932** · `qnfo-error-selfheal` 67 · `qnfo-backlog-exec` 33 ·
`worker-health` 15 · `checker` 15 · `blank-audit` 12 · `digest` 11 · `scan` 9 · `chat-canary` 4 ·
`qnfo-ai-anomaly` 1 · `health-guard` 1 · `compose` 1

**Daily critical rate is falling:** 09-10 **151** → 09-11 **143** → 09-12 **99** → 09-13 **66** (to 14:16Z).
**1,100 of 1,101 are already `digested`** — a consumer is draining them. This is a slow bleed, not an active storm.

### 6.1 The three recurring conditions (all from `qnfo-pipeline-ops`, hourly)

1. `terminal research failure 45 -> agent_issues dup: ensemble: only 0/3 legs produced drafts`
2. `terminal research failure 51 -> agent_issues dup: ensemble: only 0/3 legs produced drafts`
3. `research pipeline: failed=2 stalled=0 published=19 recovered=0 vqErr=1 ... terminal=2`

### 6.2 ROOT CAUSE — the fix is authored, the live build predates it

Three independent checks, all from this session, agree:

| # | check | result |
|---|---|---|
| 1 | Do live alerts still emit the literal `"-> agent_issues dup"`? | **YES** — ids 1103, 1104, 1107, 1108, 1111, 1112, 1115, 1116 at 10:00:59 / 11:00:59 / 12:00:59 / 13:00:59 / 14:01:20. But v0.5.3 wraps that emit in `if (r.inserted)` — a dup must be **silent**. |
| 2 | Does `pipeline_state` exist, and is it written? | Table **EXISTS**, holds **0 rows**. v0.5.4's summary-fingerprint write has never executed, while the summary alert still fires hourly. |
| 3 | Are the rows called "terminal" actually failed? | **NO.** source_id 45 = `queued`, attempt 3; 51 = `researching`, attempt 4; 40 = `pending`, attempt 12. **All `error: NULL`, `recover_count: 0`.** The repo query (`status='failed' AND recover_count>=2`) cannot select them. |

**Conclusion: the deployed build predates v0.5.3.** Every code-level fix for the alert storm
(v0.5.3 dedup, v0.5.4 summary dedup, v0.5.5 race/triage fix) is already written in
`qnfo-pipeline-ops/worker.js` (sha `a7580136`, `VERSION = "0.5.5-race-and-triage-fix"`).
**The only remaining action is a deploy.** No code change is outstanding.

The file's own note says this — *"the live build is NOT this source … every drift comparison
made against this file has been comparing the repo to itself."* That note is now **confirmed
by measurement**, not merely asserted.

---

## 7. Remediations executed this session

| # | action | evidence |
|---|---|---|
| 1 | **Closed agent_issues 692** (DEPLOY-HEALER-NO-BACKOFF) | `changes: 1`. Resolved on two independent grounds: `fleet_deploy_state.auto_heal` is now **`0`** (updated 2026-09-13 14:15:02), and the last `personal-companion` deploy attempt was **13:01:23** with **none since** — the loop stopped targeting it. Its `fleet_drift_report` note also flipped `canonical-ahead` → **`deployed-ahead`**, i.e. the version comparator now correctly reads 1.1.0 as ahead of 1.0.0. |
| 2 | **Filed agent_issues 729** — `PIPELINE-OPS-INVISIBLE` | The fleet's top alert source (932 of 1101 alerts) appears in **neither** the 55-worker roster **nor** the 40-worker activity ledger. No probe, no invocation count, no req24 for the primary early-warning component. |
| 3 | **Updated agent_issues 697** with the closed root-cause chain | `changes: 1`. Supersedes the earlier "802 critical alerts" framing with the three-way verification in §6.2 and the falling daily rate. |
| 4 | **Committed `bd4c5991`** — `qnfo-pipeline-ops/apply-terminal-error-guard.mjs` | Guarded, idempotent patcher adding `AND error IS NOT NULL AND TRIM(error) <> ''` to `terminalFailures()`. A terminal **failure** without an error is a contradiction; the label must not be derivable from attempt count. Refuses to write on anchor ambiguity. |

---

## 8. Contradictions with prior notes — named

- `qnfo-pipeline-ops/worker.js` states *"pipeline_state does not exist in live D1 … therefore the
  deployed build predates v0.5.4."* **The table DOES exist** (verified this session). The
  conclusion (build predates the dedup) still holds — it is now supported by the empty-table
  fact plus the two other checks in §6.2 — but the stated **evidence** is wrong and should be
  corrected in the file.
- Prior notes assert the deploy loop is "an active downgrade hazard." As of this session it has
  **stopped**: no `personal-companion` attempt since 13:01:23, `auto_heal=0`. Treat as contained,
  not resolved — the corrupt canonical (`1.0.0`) still exists and `enabled` is still `1`.

---

## 9. Still broken, and exactly why it is not fixed here

| defect | last evidence | blocker |
|---|---|---|
| `qnfo-cloud-ops` canonical corrupt | `fleet_deploys` id 66, 07:02:38, `ok:0`, `Invalid or unexpected token at worker.js:1:2`; **25 failed attempts** since 09-12 10:01 | Fix requires writing `r2:qnfo-canonical/qnfo-cloud-ops.js`. **That bucket is not bound to this endpoint** (`r2_list` covers releases/audit/backups/skills only; `qnfo-canonical` returned `count: 0` under `backups`). |
| `qnfo-observability` canonical incomplete | id 76, 14:04:01, `ok:0`, `No such module "fleet.js" imported from "worker.js"` | Same R2 blocker. Note `qnfo-observability/fleet.js` **does** exist in the repo, so the canonical bundle is simply missing a module the source has. |
| Alert storm | §6 | Deploy-gated (`wrangler`); no deploy route on this endpoint. |
| 543 `idea_proposals` in `triaged_hold` | `GROUP BY status` | Pipeline state; needs the triage drain, not an ops edit. |
| 15 untracked workers | §4 | Measurement defect; needs the ledger reconciliation, not a merge. |

---

## 10. Adversarial notes

- **The strongest argument against this audit:** it re-derives ground that prior sessions already
  covered, and its one code artifact (`bd4c5991`) **changes nothing in production** — it is a
  patcher for a build that is not deployed. The genuine deliverables are the two D1 writes, the
  closure of 692, and the falsification in §6.2.
- **Weakest joint:** `worker_activity_daily` and `analytics_dash_workers` disagree on the same
  workers for the same window (§4). Every productivity verdict in §2–3 rests on the former. If
  the latter is correct, `calendar-api` is 2.5× busier than reported and the "marginal" band in
  §2.2 may be misclassified. **The ledger must be reconciled before any merge is executed.**
- **Not verified:** whether `qnfo-paper-explainer`'s zero is a broken cron or a legitimately
  quiet day — `worker_activity_daily` carries only request counts, and its cron schedule was not
  readable from this endpoint.
- **Counter-observation to my own §3:** a worker at 0 req24 is not automatically dead. Cron-only
  workers can serve zero HTTP requests and still do their job — which is precisely why §5 says
  *instrument* rather than *merge* for the hub workers.
