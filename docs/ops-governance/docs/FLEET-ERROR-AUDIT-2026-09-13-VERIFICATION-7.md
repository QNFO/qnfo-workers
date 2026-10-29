# VERIFICATION 7 — ticket 712's hypothesis refuted; a 12-name ghost roster found

Date: 2026-09-13. New evidence on ticket 712 and ticket 701; corrects the H9 contradiction.

## 1. H9 WITHDRAWN — the `research-daily-brief` "contradiction" was my own artifact

I recorded H9 as an unresolved contradiction: emails 708/709 said
`[research-daily-brief] FAILED 2026-09-13T06:07:35.524Z`, while `cloud_ops_events` showed
`job='briefing' status='ok'` with `items:9` at `06:30:45Z`.

Resolved — **they are different producers, and my pairing was wrong**:

| producer | evidence |
|---|---|
| `research-daily-brief` (worker, v1.0.0) | failed at `06:07:35Z`, notified by email 708/709 |
| `briefing` (qnfo-cloud-ops scheduler job) | `06:30:45.511Z`, `status='ok'`, **`items:7`** |

The `items:9` I quoted belongs to the **2026-09-10** row, not 09-13. My aggregate used
`MAX(ts)` for the timestamp and `MAX(text)` for the sample — two different rows in one query.
Same class as the `LIMIT 20` and timestamp-format errors earlier in this audit.

`briefing` has 11 rows, all `ok`, daily at 06:30. The 06:07 failure is real and belongs to the
separate `research-daily-brief` worker.

## 2. Ticket 712 — figures confirmed, leading hypothesis REFUTED

Ticket 712 claims a sustained 5xx burst on 2026-09-10. Confirmed exactly from `alerts`
(source `qnfo-error-selfheal`, hourly):

| hour (09-10) | 08:17 | 09:17 | 10:17 | 11:17 | **12:17** | 13:18 | 14:17 | 15:17 | 16:17 |
|---|---|---|---|---|---|---|---|---|---|
| 5xx in 60m | 46 | 49 | 53 | 47 | **79** | 49 | 49 | 48 | 34 |

Nine hours, peak 79 at 12:17 — matching the ticket's "34 to 79 per hour sustained for about
10 hours".

Three things I established, and one I refuted:

1. **Not a deployment.** `fleet_deploys` has **zero rows** for 2026-09-10.
2. **Not visible internally.** `cloud_ops_events` for 11:00–13:30 on 09-10 is entirely
   `status='ok'` — heartbeats, advisor audits, pipeline health. No error rows.
3. **My probe-traffic hypothesis is REFUTED.** The obvious explanation was that the fleet's own
   failing health probes were generating the edge 5xx. `fleet_probe_log` for 09-10:

   ```
   probes 6,844   failed 413   = 6.0%
   ```

   A 94%-successful probe set cannot produce 34–79 edge 5xx per hour. The burst is **not** probe
   traffic.

**Root cause remains unidentified.** The `http_requests` Log Explorer data that would name the
failing paths is not in any D1 database bound to this endpoint.

## 3. NEW — a 12-name ghost roster probed at 100% failure

`fleet_probe_log` daily failure rates:

| day | probes | failed | % |
|---|---|---|---|
| 2026-09-13 | 519 | 2 | 0.4% |
| **2026-09-12** | 3,753 | 1,381 | **36.8%** |
| 2026-09-11 | 7,648 | 1,569 | 20.5% |
| 2026-09-10 | 6,844 | 413 | 6.0% |
| 2026-09-09 | 980 | 0 | 0% |
| 2026-09-08 | 960 | 0 | 0% |

On 09-12, **twelve names were probed 37 times each and failed 37 times each — 100%**:

`qnfo-thread-ingest` · `qnfo-skills-discovery` · `qnfo-research-radar` · `qnfo-register-guard` ·
**`qnfo-pipeline-ops`** · **`qnfo-idea-triage`** · `qnfo-idea-miner` · `qnfo-idea-factory` ·
**`qnfo-fleet-deploy`** · `qnfo-fleet-calibrator` · **`qnfo-fleet-advisor`** · `qnfo-error-selfheal`

**This is the "second unreconciled roster" of ticket 701**, and it explains a whole cluster of
findings from this audit:

| earlier finding | now explained |
|---|---|
| `qnfo-pipeline-ops` absent from `fleet_status`'s 55-worker list | it is on the ghost roster, not in `service_registry` |
| `service_discover("qnfo-fleet-deploy")` → `service: null` | ghost roster name; never registered |
| `qnfo-idea-triage` in none of the 55 services (the watchdog's dead `TRIAGE_URL`) | ghost roster name |
| `qnfo-fleet-advisor` unregistered though it audits hourly | it is bundled inside `qnfo-fleet-control` |
| the 37-of-43 "unprobed" workers | a probe list still carrying retired names |

The top alert source of this entire audit, the deployer, and the triage target are **all
unregistered names being probed to 100% failure** while demonstrably running.

**The roster was partly reconciled mid-day:** hourly failures on 09-12 ran at 148/hour for
00:00–09:00, then collapsed to 0–1/hour from 10:00 onward. By 09-13 the failure rate is 0.4%.

## 4. NEW — the advisor's up/down metric disagrees with the probe log

`qnfo-fleet-advisor` reported `{"up":1,"down":13}` continuously across **all of 2026-09-09
(72/72 rows), all of 2026-09-10, and 2026-09-11 up to 09:36:48Z**, then flipped:

| ts | value |
|---|---|
| 2026-09-11T09:36:48.953Z | `{"up":1,"down":13}` |
| **2026-09-11T09:40:58.496Z** | `{"up":15,"down":0}` |

So the advisor was blind to 13 of 14 targets for **~2.4 days**. But `fleet_probe_log` shows
**0% failure on 09-09 and 6% on 09-10**. **The two monitoring layers flatly disagree** — a third
instance of that pattern in this audit, after the binding-vs-public-route disagreement
(ticket 693, `CORRECTION-1`) and the canonical-store divergence (`ADDENDUM5`).

The advisor also briefly changed cadence from 20-minute to ~5-minute intervals just before the
flip (09:15:54 → 09:36:48), consistent with a redeploy in that window.

## 5. What is still not established

- **Ticket 712's root cause.** My hypothesis is refuted; the remaining candidates (edge routing,
  a specific origin, or third-party traffic) are all invisible from the bound D1s.
- **Why the advisor said 13 down while the probe log said 0–6% failed.** Both are in D1 and they
  contradict; I did not read either producer's source.
- Whether the 12 ghost names were retired deliberately or dropped by accident.
