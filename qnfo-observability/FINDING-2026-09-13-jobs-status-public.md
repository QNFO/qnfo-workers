# JOBS-STATUS-PUBLIC-1 — a job status link must not require the ops bearer

Date: 2026-09-13 (qnfo-ops / ops-exec). Companion to `qnfo-observability/worker.js` v1.1.4
(commit `d8d0be2dff0b4537e5cfb8864f3a11179a766a2f`, blob `3a5db9f761837b466357a29849b5912736fe7a48`).

## 1. The requirement

Operator directive, verbatim: **"JOBS STATUS LINK SHOULD BE VISIBLE WITHOUT A KEY."**

It is correct, and the prior design violated it. `GET /v1/jobs/:id` on `qnfo-ops` is gated by
`authOk()`, which compares against `OPS_ROUTER_AUTH_KEY` — the *same secret* that authorises
`/v1/chat/completions` and `POST /v1/jobs`. Asking a user to read a job status therefore meant
asking them to hold the master key for the ops endpoint. A status code is not a secret; the
bearer is.

## 2. What was actually wrong with the prior instruction

Two separate defects, both mine:

1. **A continuation message told the user to poll `GET /v1/jobs/<id>` with no `Authorization`
   header.** That cannot succeed against a bearer-gated route. It produced
   `{"error":"Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY"}`.
2. **A "differential proof" that the 404 seen from this endpoint vs the 401 seen by the user was
   evidence the route was "live and bearer-gated" was invalid.** `web_fetch` cannot reach *any*
   `*.q08.workers.dev` host: `/health` on `qnfo-kaiser`… precisely, on `qnfo-kaizen` (live 0.3.2),
   `qnfo-backlog-exec` (live 1.2.7) and `qnfo-ops` all return **HTTP 404** to `web_fetch`, while
   `fleet_status` probes all three at **HTTP 200**. The 404 is a property of the observer
   (same-account workers.dev edge), so it carried **zero** information about the jobs route.

The valid evidence that the route is reachable is `ops_req_log` (REQ-CAPTURE-1), which logs
requests *inside* the worker:

| path | keyless polls (`auth_len=0`) | last |
|---|---|---|
| `/v1/jobs/job-2dfc803ca4a243` | 3 | 2026-09-13T13:23:26.483Z |
| `/v1/jobs/job-bde617c3eed1e3` | 1 | 2026-09-13T13:23:02.281Z |
| `/v1/jobs/job-2e161c70ec28d9` | 1 | 2026-09-13T13:20:05.226Z |

Browser UA, no auth header, logged by the worker — i.e. the requests **arrive** and the guard
rejects them. That is the correct reading, and it is measured, not inferred.

## 3. Why the fix could not go into `qnfo-ops`

`qnfo-ops/worker.js` is **161,339 B**. `github_repo_read` hard-caps at **32,768 chars**
(`(truncated to 32768 chars)` reproduced directly this session), and `github_file_write` requires
full file content. The jobs handler is past the cap, so the file cannot be re-emitted, and no
`exec`/`wrangler` tool exists on this endpoint. Separately, the repo copy is **2.14.0** while live
is **2.15.1**, so any repo-based deploy of `qnfo-ops` is a *downgrade* and must not be attempted.

## 4. The fix that shipped

`qnfo-observability` was chosen because it is the only worker satisfying all four constraints:

| constraint | qnfo-observability |
|---|---|
| repo file ≤ 32,768 chars (writable) | **27,301 B** → 29,719 B after this change |
| already bound to the same D1 as `ops_jobs` | yes — `AUDIT` → `qnfo-audit` `35e2e573-…` |
| public (no auth guard) | yes — no `authOk` in its `fetch` handler at all |
| the deployer's canonical path | `qnfo-workers/main/qnfo-observability/worker.js` (no `deployed-current.worker.js` in that dir) |

New routes, keyless, read-only:

```
GET https://qnfo-observability.q08.workers.dev/jobs
GET https://qnfo-observability.q08.workers.dev/jobs/<id>
GET https://qnfo-observability.q08.workers.dev/jobs?status=continuing&limit=50
```

**Security boundary.** The routes return *status metadata only* — `id, status, model, strategy,
created_at, updated_at, response_len, tool_log_len, error(200)`. They never return
`ops_jobs.response`, because that column can contain mailbox contents and D1 rows. The
deliverable body stays bearer-gated on `qnfo-ops`. This is the split the requirement implies:
status public, content gated.

**Additive only.** The new branch sits after every existing route, is wrapped in `try/catch`
returning a JSON error on failure, and touches no existing route. The only other edits are the
`VERSION` bump `1.1.3 → 1.1.4`, two header comment lines, and the 404 `endpoints` list.

## 5. Verification performed

- Read-back of the committed file: **29,719 B**, blob `3a5db9f7…`, `VERSION = '1.1.4'`, `/jobs`
  branch present, all pre-existing routes intact (full-file read, under the cap).
- The route's exact SQL was executed against the live schema via `ops_d1_query`:
  the list projection returns rows, and `SELECT status, COUNT(*) n FROM ops_jobs GROUP BY status`
  returns `continuing 29 / failed 8 / running 3 / succeeded 42`.

## 6. What is NOT verified — read this before relying on the link

1. **The deploy has not happened.** `fleet_deploys` contains **0 rows for `qnfo-observability`,
   ever**. The expectation that the hourly healer ships 1.1.4 is an inference from the mechanism
   (canonical 1.1.4 > deployed 1.1.3, `auto_heal=1`, `usedHealth=false`) and from three workers
   it *did* ship today (`ai-health-prober` 2.3.1→2.3.3, `qnfo-social` 0.5.2→0.5.3,
   `qnfo-backlog-exec` 1.2.6→1.2.7). It is **not** a demonstrated behaviour for this worker.
2. **`usedHealth` for this worker is inferred, not read.** Drift rows report deployed `1.1.3`,
   which cannot have come from a probe (`fleet_probe_log` holds only `cf-api-list: script live`
   bodies for this worker), so the scanner must have read the deployed content — implying
   `usedHealth=false` and a heal-eligible row. If that inference is wrong the healer skips it and
   a `wrangler deploy` from `qnfo-observability/` is required.
3. **`web_fetch` cannot confirm the new route** — see §2. Confirmation must come from the user's
   own browser, or from a `fleet_deploys` row plus a drift row showing deployed `1.1.4`.
4. **Transcription risk on a 27 KB file.** The change was authored as a full-file write, so the
   ~27 KB of unchanged content was re-emitted. A syntax error is contained: Cloudflare validates
   module syntax on upload, so a bad bundle yields `fleet_deploys.ok=0` and live stays `1.1.3`.
   A *semantically* altered but syntactically valid string literal would not be caught this way —
   that is the residual risk, and the read-back in §5 is the mitigation.

**Verification query (run after ~14:02Z):**

```sql
SELECT deployed_version, canonical_version, note, ts FROM fleet_drift_report
 WHERE worker='qnfo-observability' ORDER BY ts DESC LIMIT 3;
-- expect deployed_version = 1.1.4

SELECT from_sha, to_sha, ok, note, ts FROM fleet_deploys
 WHERE worker='qnfo-observability' ORDER BY ts DESC LIMIT 3;
-- expect the first-ever row for this worker, ok=1, to_sha 1.1.4
```

**Rollback.** `qnfo-observability/worker.js` at blob `f22ca729f7faf2ef1633a7deead7bc426bc35ce4`
(VERSION 1.1.3) is the pre-change state. Note the deployer only moves *forward*: reverting to
1.1.3 would not propagate while live is 1.1.4, so a rollback must be published as **1.1.5**.

## 7. Follow-ups this surfaced (not fixed here)

- **`/run/ingest` on `qnfo-observability` is an unauthenticated state-changing GET** — anyone can
  force an ingest+digest cycle. It is pre-existing (v1.0.0) and out of scope for this change, but
  it is a larger exposure than the jobs surface added here.
- **`qnfo-ops` was re-uploaded at 2026-09-13T13:17:57Z with no `fleet_deploys` row** — the control
  plane has never deployed `qnfo-ops`, so that upload came from something else. Live was `2.15.1`
  at 13:16:12Z (service-binding probe, HTTP 200); the post-13:17:57Z version is **unverified**.
  The next probe (~13:31Z) or drift scan (~14:02Z) resolves it.
- **`qnfo-ops` repo 2.14.0 vs live 2.15.1** remains a standing downgrade hazard on the deploy path.
