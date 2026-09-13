# ADDENDUM to FLEET-PRODUCTIVITY-AUDIT-2026-09-13 — pipeline-ops identity and liveness probes

Date: 2026-09-13. Supersedes §9 bullets 1 and 2 of the main document. **REVISION 2** completes
the liveness sweep (all 15 unmeasured workers probed) and adds the config defects the probes
exposed. Every value is a tool return from this session.

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

---

## 2. Liveness sweep — all 15 "unmeasured" workers, COMPLETE

The 15 deployed workers with no `worker_activity_daily` row, probed directly:

| worker | `/health` | version | notes |
|---|---|---|---|
| qnfo-memory-mcp | **200** | 2.0.3 | 8 MCP tools, `ai/d1_papers/d1_graph/vz` all true |
| qnfo-tools-mcp | **200** | 1.1.2 | 15 tools exposed, **`sessions: 0`** |
| qnfo-ai-search | **200** | 1.0.2 | `ai_search:true, sync_token:true` |
| qnfo-research-supervisor | **200** | 1.1.1 | `workflowClass: ResearchSupervisor` |
| qnfo-agent-orchestrator | **200** | 1.0.0 | `do_agent_task:true`; `uptime` field holds an epoch ms |
| qnfo-agent-ws | **200** | 1.3.9 | **`deepseek_key: false`** |
| qnfo-ipatent | **200** | 3.4.2 | d1 `ipatent-db`, r2 `ipatent`, vz `ipatent-corpus` |
| qnfo-pdf | **200** | 1.0.0 | `browser:true, living:true, releases:true` |
| qnfo-qwav | **200** | 2.1.0 | routes `/health /ask /ai/ask /ai/search` |
| qnfo-email | **200** | 1.8.0 | **`notify_webhook: false`** |
| qnfo-subscribers | **200** | **1.1.1** | `subscribers:1, pending:0` |
| qnfo-proof | **200** | 0.1.0 | `engine: vibefeld-protocol-port`, hash-chained ledger |
| errata-hub | **200** | 1.0.0 | `members:3` |
| qnfo-gateway | **404** | 3.6.1-subscribers | alive per binding probe; no public health route |
| obsidian-writer | **404** | — | fetch-only sink, no `/health` route |

**14 of 15 answer 200.** So the "unmeasured" set is **not** a set of dead workers — it is a set
of live workers the activity collector does not cover. The measurement gap is in the collector,
not the fleet.

---

## 3. Config defects exposed by the sweep (new findings)

1. **`qnfo-agent-ws`: `deepseek_key: false`** — the worker declares a DeepSeek binding that is
   not present. Either a secret was never set or was rotated away. Any code path using it will
   fail at runtime. **Highest-value item in this addendum.**
2. **`qnfo-email`: `notify_webhook: false`** — the notify webhook binding is disabled. Worth
   confirming as intentional, since `fleet_probe_log` shows `worker-health` alerts rely on the
   email path.
3. **`qnfo-tools-mcp`: `sessions: 0`** — the MCP server (15 tools, SSE + streamable HTTP) has
   **never had a session**. It is deployed, healthy, and unused.
4. **Version-reporting disagreement (third instance in this fleet):** `qnfo-subscribers`
   `/health` says **1.1.1**, `service_registry` says **1.0.0** (updated 2026-09-12 09:50:49).
   Compare `qnfo-ops` (2.15.1 / 2.15.2 / 2.15.6) and `audit-hub` (source `VERSION = "1.1.7"` vs
   `/health` `1.0.0`).
5. **`qnfo-agent-orchestrator`** returns `uptime: 1789309729960` — an epoch-millisecond
   timestamp in a field named `uptime`. Cosmetic, but it makes the field unusable as a metric.

---

## 4. Net effect on the main document

- §9 bullet 1 **RESOLVED**: all 15 unmeasured workers probed; 14 live, 1 fetch-only sink with
  no health route. The gap is collector coverage, not worker death.
- §9 bullet 2 **RESOLVED**: `qnfo-pipeline-ops` is not deployed.
- §12 stands; hub member *names* remain unread — `/members` on `audit-hub` returns only
  `audit-hub`, so the counts-only inference cannot be upgraded from the live surface.
- **Remediation owner for the alert storm changes:** not "redeploy `qnfo-pipeline-ops`" (no such
  worker) but "locate the emitter writing `source='qnfo-pipeline-ops'` and fix its predicates".
  Issue 697's v0.5.5 patch must be matched to the actual host before it can ship.
- **New item for the remediation queue:** restore `qnfo-agent-ws`'s `deepseek_key`.
