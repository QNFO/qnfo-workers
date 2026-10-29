# VERIFICATION 13 — source-level confirmations, and the loop's source is not in the repo

Date: 2026-09-13. Read `qnfo-fleet-dashboard/worker.js` (48,913 B, sha `917bce64`,
`VERSION = '1.0.18'`).

## 1. NEW — the repo is BEHIND production for this worker, so the loop cannot be diagnosed from source

The repo declares `const VERSION = '1.0.18'`. The deployed state blob declares
`"version": "1.5.1"`. **Five minor versions ahead.**

The consequence is decisive for the highest-leverage question of this audit. The repo's
`buildState()` returns:

```js
return { generated_at, window, version, fleet, totals, scheduled, audits, probes,
         integration, report_card, chains, device, issues, meta };
```

There is **no `queues`, no `issue_counts`, no `verdict`, no `loop`, no `coverage`, no
`unattributed_errors`** — yet the live `state_json` contains all of them, and the repo's `issues`
entries are the shape `{ sev, text }` while production's carry
`{ id, schema, severity_rank, category, owner, auto_actionable, remediation, occurrences, github }`.

**So the remediation loop — `fleet_issue_loop`, `fleet_issue_dispatch`, and the `loop` block whose
`executed: 0` is the highest-leverage defect in the fleet — is written by a deployed v1.5.1 whose
source is not at this path.** I cannot read the executor and cannot say why it executes nothing.

This is the mirror image of the defect documented everywhere else in this audit. Everywhere else:
canonical ahead, production behind. Here: **production ahead, canonical behind.**

## 2. CONFIRMED at source — the `1042` mechanism, dated to the 5xx burst day

The repo's `healthProbes()` carries this comment (v1.0.13):

> *"live-list fallback probe … **Edge-to-edge workers.dev fetches return 1042 while the same URL is
> externally healthy (verified 2026-09-10)**. Deleted workers (stale registry) surface as 'missing
> from live list'."*

**Verified 2026-09-10** — the exact date of ticket 712's unexplained 5xx burst. So:

| finding | status |
|---|---|
| `CORRECTION-1` (16/16 `*.q08.workers.dev` → 404) | **documented in source**, edge-to-edge 1042 |
| ticket 693 (false 530/1016 for `qnfo-ai` while bindings prove 200) | same mechanism |
| ticket 712 (5xx burst on 09-10) | mechanism dated to that day, by the fleet |

The fallback logic is also now readable: when a probe fails but the name **is** in the CF live
script list, the worker overwrites the result to `ok:true, status:200,
transport:'cf-api-list', body:'cf-api-list: script live'`. When it is not, it appends
`"| script missing from live CF list (deleted?)"`. That is precisely the string
`fleet_probe_log` recorded for `qnfo-pipeline-ops` from 09-12T08:15Z.

## 3. CONFIRMED at source — `qnfo-pipeline-ops` is absent from the live Cloudflare script list

`integrationView()` computes:

```js
const unregistered = liveSet.size
  ? Array.from(liveSet).filter(n => !regSet.has(n))
  : [];
```

where `liveSet` comes from `GET /accounts/<acct>/workers/scripts?per_page=100` and `regSet` is
`service_registry`. Live reports `unregistered: []` — so **the CF live script list contains no name
absent from the registry, and `qnfo-pipeline-ops` is not in it.**

Combined with `VERIFICATION-11`, this is now proven three ways: not in `service_registry`, not in
`fleet_drift_report`, not in the live CF script list — while `alerts` under that source name fire
every 15 minutes.

**So the emitter is a bundled module inside some worker, self-reporting
`WORKER = "qnfo-pipeline-ops"`.** Which host remains unidentified; the `scheduled` list offers no
`*/15` candidate whose purpose matches.

## 4. What this closes and what it does not

**Closes:** the 404/1042/530 class is a known, dated, in-source edge behaviour — not three
separate discoveries. `qnfo-pipeline-ops` is definitively not a deployed script.

**Does not close:** why `fleet_issue_dispatch` has 34 rows all in `state='queued'` with 5 total
attempts, while `fleet_issue_loop` marks all 34 `dispatched`. The executor is in the deployed
v1.5.1, whose source I cannot reach.

**New defect:** `qnfo-fleet-dashboard`'s canonical source is 5 minor versions behind its deployed
build, so its own drift comparator would classify it `deployed-ahead` and skip it — the
`ADDENDUM5` finding, now with a version gap attached.
