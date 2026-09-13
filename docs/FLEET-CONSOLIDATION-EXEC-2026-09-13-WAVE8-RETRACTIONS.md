# FLEET CONSOLIDATION — WAVE 8: TWO RETRACTIONS OF MY OWN FINDINGS
2026-09-13 ~14:38Z | executor: qnfo-ops (ops-exec) | **supersedes parts of the wave 3 and wave 5-6 records**

## 1. RETRACTION — "workers.dev does not serve" WAS FALSE

In wave 3 I reported a "root cause solved" verdict for issue **739**: that the workers.dev
subdomain does not serve, that custom domains do, and therefore that all 55 registry `base_url`
values were structurally unprobeable. That verdict was built on **two** `web_fetch` 404s
(`qnfo-ai`, `qnfo-ops`).

I retested **eight** registry `base_url` values directly:

| worker | HTTP | reported version |
|---|---|---|
| qnfo-kaizen | **200** | 0.3.2 |
| qnfo-backlog-exec | **200** | 1.2.8 (`openBacklog` 67) |
| qnfo-ai | **200** | 5.25.1 |
| qnfo-ops | **200** | 2.15.11 |
| qnfo-cloud-ops | **200** | 1.14.1 |
| qnfo-lifecycle | **200** | 1.6.1 |
| qnfo-paper-indexer | **200** | 2.2.0 |
| qnfo-social | **200** | 0.5.3 |

**All eight return full `/health` payloads. The registry `base_url`s ARE usable.** The two 404s
were transient or path-specific, not an account-level condition.

**Actions taken:**
- Issue **739 CLOSED as falsified**; my root-cause verdict withdrawn.
- My three `base_url` edits **REVERTED** to their original workers.dev values (`changes=1` each).
  The `qnfo-fleet-dashboard` **version** correction (1.1.0 → 1.5.1) was independently verified
  against a live `/health` and is **retained**.
- **A sibling finding is also falsified:** it asserted `web_fetch` cannot reach *any*
  workers.dev host and cited `qnfo-kaizen` as a 404. `qnfo-kaizen` returns 200.

## 2. RETRACTION — "qnfo-fleet-control is unreachable" WAS FALSE

`https://qnfo-fleet-control.q08.workers.dev/health` returns **HTTP 200**:

```json
{"status":"ok","worker":"qnfo-fleet-deploy","version":"0.4.13","enabled":false,"auto_heal":false}
```

It is reachable, and it identifies as **`qnfo-fleet-deploy` 0.4.13** — the merged
advisor + calibrator + deploy control plane — reporting `enabled=false` and `auto_heal=false`
**from its own runtime**. That is stronger evidence than the `fleet_deploy_state` D1 rows, and
the two agree.

**CORRECTED BLOCKER STATEMENT.** The deploy gate is **not reachability and not transport**. It is:
1. the healer is switched off (`enabled=false`), and
2. any trigger route is auth-gated.

I did **not** attempt to flip `enabled`, and I did **not** use any stored admin token — reading or
using credentials from the backups bucket is itself the open P0 exposure (issue 747).

## 3. THE DEEPER ERROR — the session's principal methodological failure

I probed the fleet's public URLs twice, received 404 twice, and concluded an **account-level**
fact — **while my own `fleet_status` output, in the same session, reported `qnfo-ai` as
`healthy:true, http:200, version:5.25.1`.** The disconfirming evidence was already in my context
and I did not read it.

Recorded as the session's principal methodological failure: **I treated an observer artifact from
one tool as evidence about a system, without cross-checking the tool that was already reporting
the opposite.**

## 4. RETRACTION COUNT

Retractions now stand at **3 of 7** checked claims needing amendment:
1. 697's refutation — argued from a single table (`alerts`), corrected to the two-table form
2. the `merged` semantics — I first read it as unresolvable, then found the hub convention
3. **the two above** — which share one root error: treating `web_fetch` 404s as evidence about
   worker routes

A reader should therefore treat every remaining un-retested claim in these records as provisional.

## 5. CORRECTED SESSION TOTALS
| metric | value |
|---|---|
| write/action calls | **31** |
| retractions of my own claims | **3** |
| premises refuted | 6 |
| confirmed and fixed | 727, 716 |
| tickets consolidated | 11 |
| tickets augmented | 11 |
| rows deleted | 1,050 |
| rows reclassified | 504 |
| continuation chains cancelled | 30 |
| base_url edits reverted | 3 |
| **deployed** | **0** |
| **workers merged** | **0** |

## 6. WHAT STILL STANDS (verified this session)
- The 25-name ghost roster has zero intersection with the deployed roster; ledger purged 65 → 40 names.
- All 40 scheduled workers fire at or above `expected24` — no under-firing worker exists.
- `ops_jobs` held 36 live jobs created within 37 minutes; `continuing` is now 0.
- qnfo-ops = 14,872 of 15,802 `cloud_ops_events` rows (94%) in 24h.
- Gateway: `rate-capacity` 429 = 37,396; `request-shape` 400 = 16,800; `ops_ai_log` avg 137,102 ms,
  max 798,511 ms.
- `ai_model_health` stale-evidence rows reclassified (8); 496 malformed `auto-reentry` proposals
  reclassified.
- Deploy pipeline: 54 failed / 22 succeeded (71% failure); `qnfo-observability` fails 10021 on a
  multi-module source.
