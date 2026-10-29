# VERIFICATION 11 — `qnfo-pipeline-ops` was DROPPED; my CAPSTONE remedy is wrong; and I closed 677 prematurely

Date: 2026-09-13. Supersedes `CAPSTONE-deploy-blindspot.md` §"What is needed" and
`VERIFICATION-10.md`. Corrects an action I took earlier in this session.

## 1. `qnfo-pipeline-ops` is a deleted/consolidated worker

`fleet_dashboard_state.state_json` (`fleet-state/v1.1`, regenerated `2026-09-13T14:16:39Z`) carries
a `device` note that states the method:

> *"Regenerated 2026-09-12 (fleet-consolidation cleanup): scheduled + health_probes rebuilt from
> live CF scripts (54 workers, 40 cron), **dropped deleted/consolidated workers**, chain stages
> repointed to live workers, worker /health probing moved to CF-API liveness (**workers.dev
> subrequest is broken from within a Worker**)."*

The `scheduled` array lists **40 workers with crons**. `qnfo-pipeline-ops` is **not among them** —
nor is `qnfo-research-supervisor`. Corroborating probes:

| probe | result |
|---|---|
| `fleet_probe_log` for `qnfo-pipeline-ops` | `cf-api-list: script live` until **2026-09-11T16:30:50Z**, then `404 error code: 1042 \| script missing from live CF list (deleted?)` from 09-12T08:15Z |
| `service_registry` | no row |
| `fleet_drift_report` | 0 rows, ever |
| `fleet_deploys` | 0 rows, ever |
| dashboard `integration` | `registered: 55, live: 55, ghost: [], unregistered: []` |

**The script was deleted between 2026-09-11T16:30Z and 2026-09-12T08:15Z, and the fleet's own
reconciliation considers the roster complete at 55 without it.**

## 2. So my CAPSTONE remedy is definitively wrong

I wrote that the fix was to *"register or explicitly retire `qnfo-pipeline-ops`"*, and then in
`VERIFICATION-10` corrected myself to say registration was possible from this endpoint. **Both
were wrong to propose.** The worker has already been **retired by deletion/consolidation** — there
is nothing to register, and registering a name the fleet deliberately dropped would be an error,
not a fix.

## 3. But the alerts still fire, and I cannot name their source

`alerts` with `source='qnfo-pipeline-ops'` continues at a ~15-minute cadence through today —
latest **2026-09-13T14:01:22Z** — carrying **pre-v0.5.3 wording**. A deleted script cannot emit
them. Either:

- the module was **consolidated into another worker** and still self-reports
  `WORKER = "qnfo-pipeline-ops"` (the pattern `qnfo-observability`'s registry note describes:
  *"a worker merged into a hub is retired even if its code still runs inside the hub under its own
  WORKER constant"*), or
- the dashboard's roster is itself wrong.

I could not identify the host: no worker in the 40-entry `scheduled` list carries a `*/15` cron
matching the alert cadence except `qnfo-observability` and `qnfo-fleet-dashboard`, and neither
emits pipeline summaries. **The true emitter is unidentified.**

Adjacent evidence: ticket 703 records `qnfo-research-supervisor` silent since
**2026-09-11T14:30:12Z** (47.7 h) after being redeployed at 14:42:28Z. Both the supervisor and
pipeline-ops vanished in the same 2026-09-11 14:30–16:30Z window.

## 4. CORRECTION — I closed issue 677 prematurely

Earlier this session I closed `agent_issues` 677 with the note *"version_queue id=18 is
status=drafted, not error"*, and closed 687/688 on the same reasoning. The dashboard now reports:

```
queue_version: state "err"
  drafted=0 error=1 newest=n/a
  ERROR=1 publish failure (slug-level; check recover_count before retry - high blast radius)
  drain=qnfo-research-exec
```

**`version_queue` is back to `error=1`, `drafted=0`.** So 677's triggering condition has
**recurred**, and my closure was correct only for the moment it was made. I closed a
self-rearming condition as though it were terminal. The ticket will need re-filing by the normal
producer — or, better, the underlying publish failure (NL ReferenceError → now Zenodo 504) needs
the fix that is still unshipped.

`queue_research` for comparison: `open=4 failed=0 newest=102h STALE` — so 687/688's condition is
still absent and those two closures hold.

## 5. The fleet already documents the mechanism behind three of my findings

The `device` note, verbatim: *"worker /health probing moved to CF-API liveness (**workers.dev
subrequest is broken from within a Worker**)"*.

That single sentence explains:

| my finding | status |
|---|---|
| `CORRECTION-1`: 16/16 `*.q08.workers.dev` URLs → 404 while bindings return 200 | **known, documented** |
| ticket 693: `worker-health` reports false HTTP 530/1016 for `qnfo-ai` while bindings prove 200 | **known, documented** |
| ticket 712: probe-vs-reality disagreement on 2026-09-10 | same class |

So the 404 wall I spent two turns characterising is a documented, deliberate architectural fact,
not a new discovery.

## 6. Other live figures from the same state blob

| item | value |
|---|---|
| `totals` | 15,730 requests / 26 errors in 24 h |
| `ops_gateway` | **225 calls, 26 failed (`ok=0`), avg 200,300 ms** |
| `agent_issues` | **14 open** of 703 |
| `issues` chain | **`stuck`** — "backpressure: 15 waiting (open ≤ 10)" |
| `report_card` | `open_issues: 12`, `self_heal_total: 1410`, `loa: 8` |
| `queue_outreach` | 20 open, all `needs-contact`, 54 h stale — **SELECTOR-DRIFT**, documented in the v1.1.5 note |
| `unversioned` | `qnfo-gateway (3.6.1-subscribers)` |
| `telemetry` chain | `warn` — trace rows 24 h: 0 |

The 200-second average latency corroborates the `ops_ai_log.ok=0` correction from
`VERIFICATION-6` §2: those are slow chained jobs, not errors.

## 7. Corrected statement of the storm fix

The storm's fix is **not** registration and **not** a tombstone. It is: identify the worker that
now hosts the pipeline-ops module, and apply v0.5.5 to **that** bundle. I could not identify it
from any bound table, and the alerts' wording proves the host still runs the pre-v0.5.3 code.
