# ADDENDUM 1 — the gateway failures are capacity limits and caller bugs, not routing-table entries

Date: 2026-09-13T14:00Z · Author: qnfo-ops / ops-exec
Corrects: §6 of `2026-09-13-AUDIT-AND-FIX-consolidated.md` (sha `625fb64b…`)
Status: **corrective addendum.** No code change; one wrong diagnosis retracted.

---

## 1 — What I got wrong

In §6 of the parent doc I wrote:

> "The embedding tier (bge-base, 3635) plus one retired/misconfigured coder model (1974) are 80% of
> all gateway failures. Both are **routing-table entries, not platform faults** — the highest-value
> fix in the fleet."

**That framing is falsified by `ai_gateway_failures.error_class`**, a column I had not read when I
wrote it. The class breakdown splits the 6,969 into two populations with opposite remedies:

```sql
SELECT model, status, error_class, COUNT(*) n, SUM(count) total
FROM ai_gateway_failures
WHERE ts > (unixepoch('now')-86400)*1000
GROUP BY model, status, error_class ORDER BY total DESC;
```

| model | HTTP | error_class | rows | total/24h | share |
|---|---|---|---|---|---|
| `@cf/baai/bge-base-en-v1.5` | 429 | **rate-capacity** | 46 | **3635** | 52.2% |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | 400 | **content-shape** | 47 | **1974** | 28.3% |
| `@cf/qwen/qwen3.8-27b` | 400 | upstream | 45 | 809 | 11.6% |
| `@cf/moonshotai/kimi-k2.6` | 429 | rate-capacity | 47 | 282 | 4.0% |
| `@cf/moonshotai/kimi-k2.7-code` | 429 | rate-capacity | 47 | 94 | 1.3% |
| `@cf/zai-org/glm-5.2` | 429 | rate-capacity | 47 | 47 | 0.7% |
| `@cf/google/gemma-4-26b-a4b-it` | 400 | image-input | 46 | 46 | 0.7% |
| `@cf/zai-org/glm-5.2` | 400 | tool-args-json | 46 | 46 | 0.7% |
| `@cf/qwen/qwen3.8-27b` | 400 | other | 2 | 36 | 0.5% |
| **total** | | | | **6969** | 100% |

Sum verified independently (`run_code`): 6969, matching the drain's re-probe total **exactly**.
By status: **429 = 4058 (58.2%)**, **400 = 2911 (41.8%)**.

## 2 — The two populations have opposite fixes

**Population A — 429 `rate-capacity`, 4058 (58.2%).** These are genuine capacity/throughput limits,
i.e. platform-side. `bge-base-en-v1.5` alone is 3635/day — **52.2% of every failure in the fleet is
one embedding model hitting a rate cap.** Removing it from the routing table would not fix this; the
callers would simply fail elsewhere. The remedy is to reduce embed volume: batch calls, cache
embeddings, or stop re-embedding unchanged text.

**Population B — 400 shape errors, 2911 (41.8%).** These are caller-side payload bugs, not platform
limits and not "misconfigured models". `content-shape` on one coder model at 1974/day, uniform
across 47 buckets, is a single caller sending a body that model rejects — a code bug with a specific
owner, findable by inspecting the failing request bodies.

**Consequence for the mitigation I proposed.** "Remove the model from the routing table" silences
Population B's symptom while leaving its cause in place, and does nothing at all for Population A,
which is the majority. It is not the highest-value fix and I should not have called it one.

## 3 — Instrumentation defect: the tickets name the counter that reads zero

`ai_model_health` holds **two rows per model** — a CF-id row (`@cf/…`) and a bare-id row — and the
failure counts are split across them:

| model | CF-id row `gateway_failures` | bare-id row `gateway_failures` |
|---|---|---|
| `bge-base-en-v1.5` | **0** | 0 |
| `qwen2.5-coder-32b` | **0** | **10836** |
| `kimi-k2.6` | 0 | 516 |
| `glm-5.2` | 0 | 362 |
| `gemma-4-26b` | 0 | 258 |
| `qwen3.8-27b` | **1371** | 0 |

The open `[gw-fail]` tickets name the **`@cf/…` ids**. For `bge-base`, `qwen2.5-coder-32b`,
`kimi-k2.6`, `glm-5.2` and `gemma-4-26b` that row's counter is **0** — the ticket points at the id
whose counter is empty while the real count sits on the bare-id row. Only `qwen3.8-27b` accumulates
on the CF-id row. So the GW-DEGRADE-2 id mapping is **half-applied**, and the backlog cannot be
triaged from `ai_model_health` alone; `ai_gateway_failures` is the only table where the counts are
coherent. This is why the drain re-probe (which reads the failure table) reports CURRENT for all 12
while the health table disagrees.

Also: every `ai_model_health` row has `consecutive_failures = 0`, and the degraded `@cf/…` rows have
`last_probe_ts = NULL` / `last_latency_ms = NULL`. The `degraded` flag was written by the calibration
path, not by any probe — so `degraded` here means "a calibration pass said so", not "a probe failed".

## 4 — The version question, unresolved

`deployed-current.worker.js` declares **VERSION = "2.15.6"** (182,623 B) and contains a
`boundedToolLog(a, cap)` that truncates the tool-log **array** from the tail with a default cap of
24,000 — exactly the D20 fix. The live registry reports **2.15.2** (self-registered 13:30:58Z) and
the script `modified_on` is **13:50:43Z**, after that registration.

Attempts to settle it, all failed or inconclusive:

| vantage | request | result |
|---|---|---|
| this endpoint (Worker) | `GET /health` | **HTTP 404** (documented same-account artifact) |
| this endpoint (Worker) | `GET /manifest` | **HTTP 404** (same artifact) |
| `r.jina.ai` proxy | `GET /health` | **HTTP 429** |
| `api.allorigins.win` proxy | `GET /health` | **HTTP 522** |
| `api.codetabs.com` proxy | `GET /health` | **HTTP 522** |
| `cloud_ops_events` | version/deploy events | **none exist** — the log has no deploy class |

**Unresolved.** What is *not* unresolved is a hard invariant violation, true regardless of which
artifact is live:

> README-deploy.md: *"worker.js is the canonical source AND the deployed artifact (no build step).
> deployed-current.worker.js mirrors it byte-for-byte after every deploy."*

`worker.js` = **161,339 B**; `deployed-current.worker.js` = **182,623 B**. Delta **21,284 B**, ratio
**1.132**. They are **not** byte-for-byte identical, so at least one of the two claims in that
sentence is false: either the mirror is stale, or `worker.js` is no longer the canonical deployed
artifact. Any session applying patches from these files needs to know which.

## 5 — D20 substantially resolved: the 3,000-byte cap is legacy

Cohorted by creation hour, the exactly-3000 pattern is concentrated in the oldest cohorts:

| hour bucket | rows | at 3000 | over 3000 | under 3000 |
|---|---|---|---|---|
| 06:29 | 31 | **19** | 0 | 12 |
| 07:00 | 21 | **9** | 0 | 12 |
| 13:19 | 36 | 9 | **5** | 17 |

28 of the 37 at-cap rows (76%) are in the 06:29/07:00 cohorts, and **no row in those cohorts exceeds
3000**. The 13:19+ cohort contains **5 rows above 3000, max 21,757 B**, which the current path could
not produce if it capped at 3000. So the earlier "intermittent, mechanism unresolved" framing
overstated the live risk: **this is predominantly legacy data from an older write path, and the
current path does not cap at 3000.** Residual uncertainty: 9 rows at exactly 3000 inside the 13:19
cohort remain unexplained, so I do not close it fully.

---

## 6 — Limits

- One D1 snapshot; `ai_gateway_failures` is written by a cron, so `last_ts` is a flush time
  (1789306257835 = all nine classes) and not the time of any individual failure.
- `error_class` is assigned by the gateway's own classifier. I did not read the classifier, so a
  mislabelled class would propagate straight through this analysis.
- "Single caller" for `content-shape` is an inference from uniformity (1974 across 47 buckets on one
  model); I did not read a single failing request body, which is what would confirm it.
- The version question is genuinely unresolved, not merely uncertain. I have no vantage that can
  read the live `VERSION` constant.
