# ERRATUM — the fleet has 55 workers. My "37 invisible workers" claim was wrong.

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).
Corrects the census section of `audits/2026-09-13-QUNIVERSE-MISSION-ARCHITECTURE-INTEGRATION.md`,
`audits/2026-09-13-ADDENDUM-census-resolved-and-comparator-fix.md`, and the "census: six
unreconciled rosters" table I reported in-session.

## 1. The decisive reading

`fleet_dashboard_state` (id=1), written by `qnfo-fleet-dashboard` itself, updated
**2026-09-13T13:46:11.904Z** (refresh 14.2s):

| field | value |
|---|---|
| `fleet.workers` (`live_workers`) | **55** |
| `fleet.probes` | 10 |
| `integration.live` | 55 |
| `integration.registered` | 55 |
| `integration.ghost` | **`[]`** |
| `integration.unregistered` | **`[]`** |
| `integration.unversioned` | `["qnfo-email-orchestrator (0.3.4-glm53)"]` |

`qnfo-fleet-dashboard/worker.js` computes these by calling the Cloudflare API directly:

```js
async function liveScripts(env) {
  const resp = await fetch('https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT +
    '/workers/scripts?per_page=100', { headers: { Authorization: 'Bearer ' + env.CF_TOKEN } });
  const list = (j && j.result) || [];
  return list.map(function (x) { return x.id; });
}
```

**The account has 55 worker scripts. `service_registry` has 55. They agree.** `unregistered: []`
means no live worker is missing from the registry; `ghost: []` means no registered worker is dead.

## 2. What actually happened to the other names

`qnfo-fleet-dashboard/registry.js` (sha `41cd265b`), header:

```
// qnfo-fleet-dashboard registry - regenerated 2026-09-12 from service_registry (live fleet, 0 ghosts)
"captured_at": "2026-09-12T06:38:13.038Z",
"note": "Regenerated 2026-09-12 (ghost retirement reconciliation): dropped 25 ghost scheduled
         entries, 39 ghost probes, 2 fully-ghost chains. Live = 54 workers (service_registry
         source of truth)."
```

**That is the 73-name probe freeze.** `fleet_probe_log` shows 71 names frozen at
`2026-09-12T09:15:45.4xxZ` — the last run of the **pre-regeneration** registry. The registry was
then rebuilt from `service_registry`, dropping 39 ghost probes, and only the surviving entries have
been probed since. The 10 remaining fresh names at `13:31:05Z` are the reduced set.

So the sequence was:
1. pre-09-12: a registry containing ~80 entries including ghosts was probed each tick;
2. 09-12: the registry was regenerated against `service_registry`; 39 probes and 25 scheduled
   entries were retired as ghosts;
3. the probe log's old rows simply stop — nothing "collapsed".

## 3. Correction

I claimed, repeatedly and in committed artifacts, that **"37 workers exist in the repo but in
neither listing — a listing failure violating ADR-2026-011"**, and later that the census had
"five" then "six unreconciled rosters". **That was wrong.** The correct statement:

- The repo retains directories for workers that were **retired**. A repo dir is not evidence of a
  live worker, and I treated it as one.
- The 83 names in `fleet_probe_log` are a **historical** roster, not a current one. I treated a
  log table as a live inventory.
- `cf-api-list` `ok=1` means "this name was in the account list **at that time**" — the rows
  carrying `ok=1` for names like `qnfo-fleet-advisor` and `fleet-scheduler` are from **before**
  those workers were merged and retired, which is exactly why their `last_ts` clusters on
  09-11/09-12.
- The `integration_state` `fleet_size: 80` comes from a **different** roster:
  `qnfo-observability` does `import { FLEET } from './fleet.js'` and uses
  `FLEET.filter(w => !seen.has(w))` for `workers_silent_24h`. **`fleet.js` is the stale roster.**
  That single file is where the 80-vs-55 discrepancy lives, and it is a file-level defect, not a
  fleet-level one.

**The one genuinely unresolved name is `qnfo-pipeline-ops`**, and it is not a listing failure
either — see §4.

## 4. `qnfo-pipeline-ops` is a co-hosted module, not a missing worker

It is absent from the 55, yet it is unambiguously running: it writes
`cloud_ops_events kind='health'` every 15 minutes (latest `2026-09-13T13:46:01.043Z`) and filed
`agent_issues` 677/687/688 today. Its `/health` route 404s at
`qnfo-pipeline-ops.q08.workers.dev`, and its `cf-api-list` probes stopped 09-11T16:30:50Z.

It self-identifies via a `WORKER` constant — the same pattern as `qnfo-fleet-control`, whose source
provably contains `var WORKER = "qnfo-fleet-advisor"` and `var WORKER = "qnfo-fleet-calibrator"`
inside one bundle. **A module's `WORKER` constant is not its script name.**

Evidence for the host: pipeline-ops heartbeats land at `:01/:16/:31/:46`, the identical cron phase
as `qnfo-fleet-dashboard` (`*/15 * * * *`), whose own probes log at `:01/:16/:31/:46`. I read only
32,768 of that file's 48,913 bytes, so **I cannot confirm the host** — this is the leading
hypothesis, not a finding.

## 5. What this changes

- **The fleet is 55 workers, all registered, 0 ghosts.** The "monitoring collapsed to 10 of 83"
  framing was directionally right about *coverage* (10 probes is thin) but wrong about *cause*:
  it was a deliberate ghost-retirement, not a collapse.
- The two genuine coverage defects stand and are now precisely scoped: **only 10 probe targets**,
  and `integration_state` last written **2026-09-11T14:17:37Z** (47h stale) by
  `qnfo-observability` (cron `17 * * * *`).
- **`qnfo-observability/fleet.js` is a concrete, single-file defect** to reconcile against
  `service_registry`.
- The fleet's own tooling independently flags `qnfo-email-orchestrator (0.3.4-glm53)` as
  `unversioned` — the same non-semver anomaly I found via `service_registry`. Two independent
  readers, same conclusion.

## 6. Method note

Every one of my three self-corrections this session had the same shape: **I treated a secondary
artifact as primary evidence.** A repo directory as a live worker; a log table as an inventory; a
staged patch's premise as verified. The primary sources that settled each were, respectively, the
dashboard's own CF API call, the live `cloud_ops_events` heartbeat, and the deployed worker's
observable behaviour. Where a source can be read directly, read it before inferring from a
derivative.
