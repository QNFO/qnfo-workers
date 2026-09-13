# ADDENDUM to FLEET-PRODUCTIVITY-AUDIT-2026-09-13 — pipeline-ops identity and liveness probes

Date: 2026-09-13. Supersedes §9 bullet 2 of the main document (which said the question was
unresolved). Every value is a tool return from this session.

## 1. `qnfo-pipeline-ops` is not a deployed worker

The alert storm's `source` value is `qnfo-pipeline-ops` (≈593 alerts in 5 days). Three
independent readings:

| evidence | value |
|---|---|
| `fleet_status` (CF API enumeration) | `deployedCount: 55`; **`qnfo-pipeline-ops` is not among them** |
| `worker_activity_daily` | present, but `req24=0` frozen at `2026-09-12T09:05:41Z` |
| `https://qnfo-pipeline-ops.q08.workers.dev/health` | **HTTP 404** |

**Conclusion: no deployed worker is named `qnfo-pipeline-ops`.** The alert `source` is a label
written by some *other* worker. This is why the storm could not be fixed by finding and
redeploying its source — there is no such source to redeploy.

**Caveat that must be stated:** a public `/health` 404 is **not** by itself proof of absence.
`https://qnfo-gateway.q08.workers.dev/health` also returns **404**, yet `qnfo-gateway` is
demonstrably alive — `fleet_status` reports it `healthy:true, http:200,
version:3.6.1-subscribers` via service binding. So a 404 means "no public /health route", not
"dead". The load-bearing evidence here is the **CF API roster**, which does not contain
`qnfo-pipeline-ops`.

**Strongest candidate for the real emitter (inference, not verified):** `qnfo-cloud-ops`.
Its `/health` declares 22 jobs including `research-scan`, `worker-health` and `radar`, and
`cloud_ops_events` carries kind `pipeline-supervisor` (517 events, last `2026-09-11T14:30:12Z`)
— the same subsystem the alerts describe ("research pipeline: failed=… published=…"). I did not
read the emitting code and do not assert it.

## 2. Liveness probes of the 15 "unmeasured" workers

Partial probe of the set with no `worker_activity_daily` row:

| worker | public `/health` | version | notes |
|---|---|---|---|
| qnfo-email | **200** | 1.8.0 | `d1:true, send_email:true, notify_webhook:false` |
| qnfo-subscribers | **200** | **1.1.1** | `subscribers:1, pending:0, send_email:true` |
| qnfo-proof | **200** | 0.1.0 | `engine:vibefeld-protocol-port`, hash-chained ledger |
| qnfo-gateway | 404 | 3.6.1-subscribers | alive per binding probe; no public health route |

**Two discrepancies surfaced:**

1. `qnfo-subscribers` reports **v1.1.1** on `/health`, while `service_registry` records
   **1.0.0** (updated 2026-09-12 09:50:49). A third version-reporting disagreement in the fleet
   (cf. `qnfo-ops` 2.15.1 / 2.15.2 / 2.15.6, and `audit-hub` VERSION `1.1.7` in source vs
   `1.0.0` on `/health`).
2. `qnfo-email` reports `notify_webhook: false` — a disabled binding, worth confirming as
   intentional.

## 3. Net effect on the main document

- §9 bullet 2 is **resolved**: `qnfo-pipeline-ops` is not deployed.
- §9 bullet 1 is **partially resolved**: 4 of the 15 unmeasured workers are confirmed live and
  answering; the remaining 11 still have no activity measurement.
- §12 stands unchanged; the hub member *names* remain unread (counts only).
- The remediation for the alert storm changes owner: it is not "redeploy qnfo-pipeline-ops"
  (no such worker) but "find the emitter inside whichever worker writes `source='qnfo-pipeline-ops'`
  and fix its predicates" — issue 697's v0.5.5 patch needs to be matched to the actual host.
