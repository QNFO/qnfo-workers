# Full-stack integration — plan and execution record (2026-09-13)

Author: qnfo-ops (ops-exec). Every figure below is a live tool return from this session
(2026-09-13, ~13:16–13:30Z). This document is **not** a deploy candidate: `canonical()` resolves
`<worker>/deployed-current.worker.js` then `<worker>/worker.js`, never `docs/`.

## 0. What was actually executed (not proposed)

| action | tool | result |
|---|---|---|
| backlog drain | `ops_issue_run(confirm=true)` | `triggered:true, http:200`, `openBacklogBefore:10`, `processed:10, closed:0, rechecked:10, escalated:0, noiseClosed:0` |
| self-heal analyzer | `telemetry_analyze(hours=24)` | `scanned:10, persistent:[], recovered:9, autoResolved:1, filed:0, alreadyOpen:1` |
| census reconciliation | `run_code` | 92 worker dirs / 55 deployed / 55 registry rows; 39 dirs never deployed |
| patch-target correction | `github_file_write` | new patch for the **live merged** worker (see §5) |

The drain is the third consecutive session in which it processed the backlog and closed **zero**
rows. `escalated:0` and `closed:0` with `processed:10` means every open row was classified
`recheck` with the note `gateway failures CURRENT: N/24h - real defect, root fix pending`. The
queue is not draining because the rows are, on the drainer's own evidence, real.

Verbatim 24h counts the drainer attached to the seven `[gw-fail]` rows:
`bge-base-en-v1.5` 3638 · `qwen2.5-coder-32b-instruct` 1974 · `qwen3.8-27b` 842 ·
`kimi-k2.6` 282 · `kimi-k2.7-code` 94 · `glm-5.2` 93 · `gemma-4-26b` 46.

## 1. Definition — "full-stack integration" is three contracts, not one

The fleet does not have an integration problem in the singular. It has three independent
contracts, and each one is broken in a different layer. Treating them as one backlog is why
~40 documents have been written about a single defect with no applied change.

| contract | question it answers | current state |
|---|---|---|
| **A. Discovery** | "what exists, and what does it do?" | `service_registry` — 55 rows, but 87.3% have no routes |
| **B. Version truth** | "what code is running, and is the source recoverable?" | three sources disagree; source for ≥4 workers unreachable |
| **C. Signal** | "does a failure reach a decision-maker?" | every fleet self-alert lands in spam |

The existing design doc `docs/CLOUDFLARE-CAPABILITY-INTEGRATION.md` (2026-09-07) already defines
the intended shape: two feedback loops (product universe ↔ workload state), a
`cloudflare_capability_catalog`, a decision gate with a policy allow-list, and kaizen
re-evaluation. **That design is sound and is not the blocker.** Its Loop 2 dependency —
"`service_registry` … most others blank" — is still blank today, and it is a prerequisite for
Loops 1 and 2 to join. That single dependency is contract A.

## 2. Target architecture (the "ideal" configuration)

The fleet already contains the right primitives; they are wired to each other instead of to a
single writer. The target is one writer per fact, and one reader per writer.

**Rule 1 — one writer per fact.**

| fact | canonical writer | readers today | conflict |
|---|---|---|---|
| deployed version | live `/health` | `fleet_status` (binding), `fleet_drift_report.deployed_version`, `service_registry.version` | three-way disagreement |
| canonical version | R2 `qnfo-canonical/*` | drift scan | R2 written back only on success → poison is self-perpetuating |
| service surface | `service_registry` | `service_discover`, MCP clients, advisor | 87.3% of rows have no routes |
| backlog truth | `agent_issues` | drain, digest, advisor | digest reads `issue_ledger` instead |

Concrete conflicts measured this session:

- `qnfo-email`: live `/health` = **1.8.0**; `fleet_drift_report.deployed_version` =
  **`qnfo-email/fabric-20260910`**. Two fleet stores, two different answers, for the same worker
  at the same moment.
- `qnfo-fleet-dashboard`: `service_registry.version` = **1.1.0**; drift `deployed_version` =
  **1.5.1**.
- Eight workers carry a non-semver `name/fabric-20260910` build tag as their "deployed version":
  `qnfo-archive`, `qnfo-ddocs-indexer`, `qnfo-email`, `qnfo-lifecycle`, `qnfo-paper-indexer`,
  `qnfo-qwav`, `qnfo-agent-orchestrator`. Because `parseInt("qnfo-archive/fabric-20260910")` is
  `NaN → 0`, the comparator scores these as `[0,0,0]` against a real canonical and labels every
  one of them `canonical-ahead` — hourly, forever. These are the rows that never receive a deploy
  attempt (§5), so the phantom drift is inert *today* and becomes a downgrade the moment the
  census or the guard changes.

**Rule 2 — a discovery row is only valid if it names a callable surface.** A registry row with no
`routes` and no `capabilities` is indistinguishable from a dead service. Five deployed hubs are
exactly that today: `audit-hub`, `companion-hub`, `errata-hub`, `idea-hub`, `jnl-pipeline` — all
registered at version `1.0.0` with `purpose`, `capabilities`, `routes`, `deps` all blank, and all
`healthy:null` (no probe). Nothing in the fleet can discover what the wave-A/B merge produced.

**Rule 3 — transport is per-hop, not global.** `.internal` hostnames are correct **with a service
binding** and broken **with a plain `fetch()`** (CF-1016 / 530). `*.workers.dev` from inside a
Worker returns 404 even for live workers. Both facts are already recorded in-repo; a blanket
find-and-replace would break the hops that work.

**Rule 4 — a failure signal must terminate at a human.** The alert path currently terminates in
the spam folder (§4).

## 3. Contract A — discovery (the unblocking work)

`service_registry`, 55 rows:

| missing field | rows | share |
|---|---|---|
| `routes` | 48 | **87.3%** |
| `tools` | 52 | 94.5% |
| `capabilities` | 23 | 41.8% |
| `deps` | 22 | 40.0% |
| `purpose` | 21 | 38.2% |

Only **7 rows** name any route at all: `qnfo-ai`, `qnfo-cloud-ops`, `qnfo-intent-orchestrator`,
`qnfo-ops`, `qnfo-proof`, `qnfo-subscribers`, `qnfo-tools-mcp`. The design doc's own P1 item —
"registry-refresh enrichment … workers with placeholder rows (empty capabilities) need
self-registration or manifest harvesting" — is unimplemented, and the registry has moved the wrong
way: the 2026-09-07 doc records **76 workers** in `service_registry`; it holds **55** today.

Two further registry defects:

1. **`state` contradicts liveness.** 6 rows carry `state='merged'`:
   `qnfo-backlog-exec`, `qnfo-paper-explainer`, `qnfo-paper-indexer`, `qnfo-pdf`,
   `qnfo-research-exec`, `qnfo-research-supervisor`. But `qnfo-backlog-exec` is deployed,
   `/health` 200, **v1.2.7**, and is the worker this endpoint calls to drain the backlog. A
   consumer that honours `state` would refuse to call a live, in-use service. Either `state` means
   "this worker is a merge *target*" (undocumented, and then the value is misnamed) or 6 rows are
   wrong.
2. **Name drift.** Repo dirs `agent-orchestrator/` and `memory-mcp/` are deployed as
   `qnfo-agent-orchestrator` and `qnfo-memory-mcp`. Any worker-name→repo-dir mapping misses both.

## 4. Contract C — signal

`email_stats` (live): 682 total · **258 spam (37.8%)** · 176 alerts · 23 in 24h.
`email_check(status='spam')`, 20 most recent: **14/20** are
`bounces@cf-bounce.qnfo.org → alerts@qnfo.org`, `classification=alerts`, `status=spam` — i.e.
bounce notifications, not the alerts. The `alerts@` sending path is being rejected downstream and
the bounce is itself classified spam.

Independent corroboration that this suppresses real work: the register guard's own notices
(id 692, "7 overdue", 09-12T03:10Z; id 706, "26 overdue", 09-13T03:10Z) reproduce exactly the
7 → 26 growth visible in `task_dod_register`, and both notices are in spam. `task_dod_register`
live: `done 100, open 99, cancelled 19, in-progress 1`.

Boundary: 3 of the 20 sampled spam rows are genuine third-party spam. The defensible claim is that
**every fleet self-signal routed to `alerts@qnfo.org` in the sampled window is stored
`status=spam`** — not that all 258 spam rows are alerts.

## 5. Contract B — the armed downgrade machine

This is the highest-severity finding of the session, and it is a **configuration** fault, not a
code fault.

`fleet_deploy_state` (live, 2 control rows + 38 `scanerr:*` keys):

```
enabled    = 1   updated 2026-09-08 16:25:49
auto_heal  = 1   updated 2026-09-08 16:25:49
```

`qnfo-fleet-deploy/README.md` states, verbatim: *"Kill-switch (`fleet_deploy_state.enabled`) +
auto_heal flag **BOTH default '0' (fail-closed)**. … Do NOT enable auto_heal until canonical
bundles are synced ahead of deployed versions."* **Both are `1`.** The safety posture the design
specifies is inverted in production.

What that arms, measured:

- `fleet_drift_report`: **1,492 rows across 50 distinct workers** — `canonical-ahead` 974 rows /
  32 workers, `deployed-ahead` 518 rows / 18 workers. The majority of the fleet is not in sync
  with its own canonical source.
- `fleet_deploys`: **74 attempts, 21 ok, 53 fail (28.4% success)**, spread over only **14
  workers**. Two workers account for **55/74 = 74.3%** of all attempts:
  `personal-companion` 30 attempts / 4 ok, `qnfo-cloud-ops` 25 attempts / **0 ok**.
- The guard that should prevent a downgrade exists in the caller, not the callee:
  `redeploy()` computes `direction` and discards it, and `scan()` only avoids downgrades
  *incidentally* (it `continue`s on the ahead branch). `POST /redeploy` calls `redeploy()`
  directly, so one authenticated POST can revert any of the ~18 `deployed-ahead` workers —
  including `qnfo-ai` (deployed 5.25.1 / canonical 5.21.3) and `qnfo-ops` itself (2.15.1 /
  2.13.0).

**Correction to my own prior work.** The staged patch I wrote earlier
(`qnfo-fleet-deploy/PATCH-2026-09-13-downgrade-guard.mjs`) targets `qnfo-fleet-deploy/worker.js`.
That directory is **superseded source**. `qnfo-fleet-control/wrangler.toml` records the real
topology, verbatim: *"MERGE WAVE A (2026-09-11): qnfo-fleet-advisor + qnfo-fleet-calibrator +
qnfo-fleet-deploy merged into ONE worker (3 -> 1). Subsystems dispatched by path: `/advisor/*`,
`/cal/*`, else deploy control plane."* The live deployer is `qnfo-fleet-control` (registry
v0.4.11; `qnfo-fleet-control/worker.js`, 75,875 B, sha `d9d438f0`). A patch applied to
`qnfo-fleet-deploy/worker.js` changes nothing that runs. This session therefore adds
`qnfo-fleet-control/PATCH-2026-09-13-downgrade-guard-bundle.mjs` and marks the old directory
superseded.

Also unresolved and deliberately not claimed: `qnfo-fleet-deploy` is absent from `fleet_status`'s
55-worker listing, yet `fleet_deploys` shows its ledger firing hourly at `:01`. Whether that is a
listing-scope artefact or a genuine second deployer is not determined.

## 6. Ordered remediation queue

Each row names an exact target. Rows 1–3 are configuration or data and need no code deploy.

| # | fix | exact target | blocker on qnfo-ops |
|---|---|---|---|
| 1 | Disarm auto-heal | `UPDATE fleet_deploy_state SET value='0' WHERE key IN ('auto_heal','enabled')` | `ops_d1_query` is SELECT/WITH only |
| 2 | Repair the spam path for `alerts@qnfo.org` | mail auth (SPF/DKIM/DMARC) on the sending path | no mail-config tool bound |
| 3 | Make the registry describe the fleet | enrich 48 rows' `routes`; fix 6 `state='merged'`; add the 5 blank hubs | needs D1 write |
| 4 | Land the downgrade guard | `qnfo-fleet-control/worker.js` (patch staged) | NO_SELF: the deployer cannot redeploy itself; manual deploy required |
| 5 | Fix the `personal-companion` regression | restore v1.1.0 or pin it out of `redeploy()` | v1.1.0 source is at no path this endpoint can reach |
| 6 | Clear the poisoned R2 object | delete/overwrite `qnfo-canonical/qnfo-cloud-ops.js` | R2 bucket `qnfo-canonical` is not bound to these tools |
| 7 | Reconcile the deploy census | the API listing the scan iterates | token scope unverifiable from here |

## 7. Failure modes of this document

- **The census count is contested.** `fleet_status` and `service_discover` both return 55, but
  `fleet_probe_log` holds **131** `cf-api-list` rows with `ok=1` for `qnfo-pipeline-ops` — a worker
  that is *not* in the 55. Two readers, one account, different answers. If the listing is
  token-scoped rather than account-wide, every "X of 55" figure here is scoped wrong. I could not
  resolve this from the available tools, and I am not claiming 55 is the account total.
- **The scan census is not stable.** `fleet_drift_report` cron summaries record
  `scanned=52, 55, 75, 77, 80` across 2026-09-09 → 09-13, most recently 55. The deploy scan does
  not read a fixed set.
- **`fabric-20260910` is unexplained.** I observe these strings as `deployed_version` and observe
  that they contradict live `/health` for `qnfo-email`. I did not find the code that produces
  them, so the mechanism is inference.
- **The bundle patch's anchors are unverified.** `qnfo-fleet-control/worker.js` is 75,875 B, over
  the 32,768-char read ceiling, with no offset parameter. The patch reuses anchors verified against
  `qnfo-fleet-deploy/worker.js` and **fails closed** on mismatch — it will refuse to write rather
  than corrupt the bundle.
- **The drain result does not prove the gw-fail rows are real.** The drainer reports 24h counts
  that look current, but if the calibration sweep replays a frozen window with fresh timestamps,
  a 24h count is non-informative either way. The stale-close pass still cannot retire these rows.
- **`ops_issues_list` and `agent_issues` disagree.** At 13:24 `ops_issues_list` returned **12**
  open rows including #685 (`model-health`) and #686 (`backlog`); the D1 status histogram at 13:26
  returns **open 10**, with open rows in only three categories (`ai-calibration` 7,
  `research-pipeline` 2, `zenodo-publish` 1). One of the two readers is wrong. I did not determine
  which.
- Nothing in this document changed production. Rows 1–3 and 6 remain blocked exactly as listed.
