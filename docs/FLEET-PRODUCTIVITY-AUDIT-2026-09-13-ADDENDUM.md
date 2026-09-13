# ADDENDUM to FLEET-PRODUCTIVITY-AUDIT-2026-09-13 — pipeline-ops identity and liveness probes

Date: 2026-09-13. Supersedes §9 bullets 1 and 2 of the main document.
**REVISION 3** adds §5, which corrects the main document's §6.2 treatment of the 496 rows.
Every value is a tool return from this session.

---

## 1. `qnfo-pipeline-ops` is not a deployed worker

The alert storm's `source` value is `qnfo-pipeline-ops` (≈593 alerts in 5 days). Three
independent readings:

| evidence | value |
|---|---|
| `fleet_status` (CF API enumeration) | `deployedCount: 55`; **`qnfo-pipeline-ops` is not among them** |
| `worker_activity_daily` | present, but `req24=0` frozen at `2026-09-12T09:05:41Z` |
| `https://qnfo-pipeline-ops.q08.workers.dev/health` | **HTTP 404** |

**Conclusion: no deployed worker is named `qnfo-pipeline-ops`.** The alert `source` is a label
written by some *other* worker.

**Caveat that must be stated:** a public `/health` 404 is **not** by itself proof of absence.
`https://qnfo-gateway.q08.workers.dev/health` also returns **404**, yet `qnfo-gateway` is
demonstrably alive — `fleet_status` reports it `healthy:true, http:200,
version:3.6.1-subscribers`. The load-bearing evidence is the **CF API roster**.

**Strongest candidate for the real emitter (inference, not verified):** `qnfo-cloud-ops`, which
declares 22 jobs including `research-scan`, `worker-health` and `radar`, and `cloud_ops_events`
carries kind `pipeline-supervisor` (517 events, last `2026-09-11T14:30:12Z`).

---

## 2. Liveness sweep — all 15 "unmeasured" workers, COMPLETE

| worker | `/health` | version | notes |
|---|---|---|---|
| qnfo-memory-mcp | **200** | 2.0.3 | 8 MCP tools; **no `auth` binding** |
| qnfo-tools-mcp | **200** | 1.1.2 | 15 tools, **`sessions: 0`** |
| qnfo-ai-search | **200** | 1.0.2 | |
| qnfo-research-supervisor | **200** | 1.1.1 | `ResearchSupervisor` |
| qnfo-agent-orchestrator | **200** | 1.0.0 | `uptime` holds an epoch ms |
| qnfo-agent-ws | **200** | 1.3.9 | **`deepseek_key: false`** |
| qnfo-ipatent | **200** | 3.4.2 | |
| qnfo-pdf | **200** | 1.0.0 | |
| qnfo-qwav | **200** | 2.1.0 | |
| qnfo-email | **200** | 1.8.0 | **`notify_webhook: false`** |
| qnfo-subscribers | **200** | **1.1.1** | registry says 1.0.0 |
| qnfo-proof | **200** | 0.1.0 | |
| errata-hub | **200** | 1.0.0 | `members:3` |
| qnfo-gateway | **404** | 3.6.1 | alive per binding probe |
| obsidian-writer | **404** | — | fetch-only sink |

**14 of 15 answer 200.** The gap is collector coverage, not worker death.

---

## 3. Config defects exposed by the sweep

1. **`qnfo-agent-ws`: `deepseek_key: false`** — filed as issue 755 (high).
2. **`qnfo-tools-mcp`: `sessions: 0`** — see §4; it is auth, not breakage. Issue 756 updated.
3. **`qnfo-email`: `notify_webhook: false`.**
4. **Version disagreement (third instance):** `qnfo-subscribers` 1.1.1 vs registry 1.0.0.
5. **`qnfo-agent-orchestrator`**: `uptime` field carries an epoch-ms timestamp.

---

## 4. MCP transport — resolved, and it inverted the diagnosis

| endpoint | result |
|---|---|
| `qnfo-tools-mcp/mcp/sse` | **401** — transport present, auth-gated |
| `qnfo-tools-mcp/mcp` | 404 — POST-only |
| `qnfo-memory-mcp/mcp/sse` | **200** — hands out a session URI, no auth |

`qnfo-tools-mcp sessions: 0` means **no client has ever authenticated** — not a broken server.
Filed **756**, resolved.

**SECURITY (filed as issue 764, high):** `qnfo-memory-mcp` returns 200 on `/mcp/sse` and
advertises `{"uri":"https://qnfo-memory-mcp.q08.workers.dev/mcp"}` with no auth, and its
`/health` lists 8 tools including write paths (`remember_fact`, `recall_facts`, `query_graph`)
over `ai/d1_papers/d1_graph/vz`. Its bindings list contains **no `auth` binding**, corroborating
the open surface.

Scope labelled precisely: the **exposure** (open handshake + advertised session URI on a
write-capable server) is **verified**; the **write risk** (whether `POST /mcp` also skips auth)
is **inferred** — `web_fetch` cannot issue POST.

---

## 5. CORRECTION — the 496 rows are REAL, and they were disposed of mid-session

The main document's §6.2 says the `INTAKE-STALL … 496 proposals stuck new` alert is false
because `idea_proposals` has zero `status='new'` rows. **The predicate observation is right;
the conclusion was wrong.**

`idea_proposals` cross-tab, read this session:

| status | count | score NULL | created_at range |
|---|---|---|---|
| **rejected** | **496** | **496** | **2026-09-12T09:50:02.378Z → 09:50:44.140Z** |
| triaged_hold | 47 | 0 | 2026-09-03T11:19:24Z → 2026-09-11T13:05:46Z |
| triaged_accepted | 14 | 0 | 2026-09-03T11:21:16Z → 2026-09-10T21:05:34Z |
| ensemble-registered | 1 | 1 | 2026-09-08 11:57:47 |

Total 558. An independent count over
`created_at BETWEEN '2026-09-12T09:50:00' AND '2026-09-12T09:52:00'` returns **496 rows**,
min `09:50:02.378Z`, max `09:50:44.140Z` — **exactly 496 rows in 42 seconds**, matching issue
716's title verbatim.

**My earlier read of `triaged_hold = 543` was accurate at the time.** The conservation is
exact: **543 = 47 + 496**. So a concurrent job reclassified the 496 burst rows from
`triaged_hold` to `rejected` *during this session*. That was a real state change, not a misread
— and it means another agent was remediating the same anomaly in parallel.

**Revised conclusion:** the alert's **wording** is wrong (`status='new'` never matched), but the
**underlying anomaly was real** — 496 malformed rows inserted in a 42-second burst. Those rows
are now in a terminal disposal state (`rejected`), so the INTAKE-STALL condition no longer has a
live subject. The surviving defect is purely the predicate: it will keep firing on a phantom
after the real rows are gone. Issue 716 updated with this.

**Methodological note this forces:** I have now been wrong three times about this same table
across three reads (496 "refuted" → 543 hold → 496 rejected), and each time the error was mine
or a concurrent write, never the data. Any count read from a table another process is actively
mutating should be treated as a sample, not a fact.

---

## 6. `qnfo-fleet-control` — partial reachability map (non-destructive only)

| route | result |
|---|---|
| `/health` | **200** — `{"worker":"qnfo-fleet-deploy","version":"0.4.13","enabled":false,"auto_heal":false}` |
| `/` | 401 |
| `/status` | 401 |
| `/scan` | 401 |

Three findings: (a) `/health` is **open** while every action route is gated; (b) the worker
self-identifies as **`qnfo-fleet-deploy`** at version **0.4.13**, whereas `service_registry`
records `qnfo-fleet-control` at **0.4.11** — a fourth version disagreement; (c) the kill switch
is corroborated from a second independent source (`enabled:false, auto_heal:false`), matching
`fleet_deploy_state`.

**Not attempted:** any authenticated call. Triggering a deploy is irreversible and
high-blast-radius, so it is correctly gated on explicit confirmation. The deploy capability is
therefore **untested, not established-unusable**.

---

## 7. Net effect on the main document

- §9 bullet 1 **RESOLVED** — all 15 unmeasured workers probed; 14 live.
- §9 bullet 2 **RESOLVED** — `qnfo-pipeline-ops` is not deployed.
- **§6.2 CORRECTED** — see §5 above.
- §12 stands; hub member *names* remain unread (`/members` and `/status` on `audit-hub` both
  return only `audit-hub`).
- Storm remediation owner changes: not "redeploy `qnfo-pipeline-ops`" (no such worker) but
  "locate the emitter writing `source='qnfo-pipeline-ops'` and fix its predicates".
