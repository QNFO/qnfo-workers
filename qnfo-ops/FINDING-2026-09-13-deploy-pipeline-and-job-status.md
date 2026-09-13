# Fleet finding — deploy pipeline is the fix bottleneck; job-status mechanism

Date: 2026-09-13 (~14:25Z). Companion to `qnfo-ops/REMEDIATION-2026-09-13-fleet-errors.md`
and `...-root-causes.md`. Supersedes the E2 severity in both.

## E17 (P0) — the keyless `/jobs` fix FAILED to deploy

`fleet_deploys` id 76, `2026-09-13T14:04:01`, `qnfo-observability` 1.1.3 → 1.1.4, **ok=0**:

```
HTTP 400 code 10021: Uncaught Error: No such module "fleet.js".
  imported from "worker.js"
source_path: r2:qnfo-canonical/qnfo-observability.js
```

The directory is multi-module (`worker.js` + `fleet.js`); the canonical deploy path consumes
**one** R2 object, so the relative import cannot resolve. The keyless `GET /jobs`,
`GET /jobs/<id>` and `GET /jobs?status=` routes from `JOBS-STATUS-PUBLIC-1` are **not live**.

**Fix:** bundle to a single file before writing `r2:qnfo-canonical/<worker>.js`. A multi-module
source can never deploy through this path.

## E18 (P0) — deploy pipeline: 54 failed / 22 succeeded (71% failure)

Since 2026-09-09T18:02:12.

| worker | ok | n | last attempt |
|---|---|---|---|
| personal-companion | 0 | 26 | 2026-09-13 13:01:23 |
| qnfo-cloud-ops | 0 | 25 | 2026-09-13 07:02:38 |
| qnfo-fleet-advisor | 0 | 2 | 2026-09-09 19:02:31 |
| qnfo-observability | 0 | 1 | 2026-09-13 14:04:01 |
| qnfo-backlog-exec | 1 | 2 | 2026-09-13 14:02:44 |
| qnfo-social | 1 | 2 | 2026-09-13 07:04:34 |
| ai-health-prober | 1 | 1 | 2026-09-13 07:00:53 |

- `personal-companion` (26×, hourly 09:01→13:01): `code 10021: Workflow GenerationFlow must be
  exported or a script_name must be specified`; the attempt is a **downgrade**
  (`from_sha v1.1.0 → to_sha 1.0.0`).
- `qnfo-observability`: `No such module "fleet.js"`.

The pipeline itself works — `qnfo-backlog-exec` shipped twice today (1.2.6→1.2.7 at 08:01:43;
1.2.7→1.2.8 at 14:02:44). **The 54 failures are content-specific, not transport.** Practical
consequence: a repo-committed fix does not become a live fix 71% of the time, which is why
multiple `REMEDIATION-*.md` specs from previous sessions are still unshipped.

## E2 — mechanism resolved; retraction of my own severity claim

**Mechanism:** `GET /v1/jobs/:id` on `qnfo-ops` is gated by `authOk()` against
`OPS_ROUTER_AUTH_KEY`, the same secret that authorises `/v1/chat/completions`. A continuation
message instructed the user to poll it **without an Authorization header**; that cannot
succeed. The user-facing symptom is
`{"error":"Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY"}`, **not** HTTP 404.

**The 404 is an observer artifact.** `web_fetch` cannot reach any `*.q08.workers.dev` host:
`qnfo-kaizen` (live 0.3.2), `qnfo-backlog-exec` and `qnfo-ops` all return 404 to `web_fetch`
while `fleet_status` probes all three at 200. Reproduced for three workers. Any earlier
reasoning that treated a `web_fetch` 404 as evidence about a worker route is void.

**Retraction.** I reported "28/132 = 21.2% of jobs never terminate." Four readings of `ops_jobs`
inside ~40 minutes:

| source | total | non-terminal |
|---|---|---|
| `qnfo-observability/FINDING-2026-09-13-jobs-status-public.md` | 82 | 32 |
| `qnfo-ops-jobs-reaper/FINDING-reaper-is-redundant.md` (14:10Z) | 118 | 21 |
| fleet error audit (14:12Z) | 132 | 28 |
| fleet error audit (14:25Z) | 136 | 31 |

An **undocumented reaper promotes non-terminal rows at ~20 minutes** (35 rows in a 16.0 s sweep
at 13:51:19–13:51:35Z). Non-terminal counts measure *when you sampled relative to the sweep*,
not permanent stranding. The claim is withdrawn.

What remains real in this class:
1. the ~20-minute promotion lag;
2. **unlabeled failures** — the 6 uninstrumented `failed` rows from 2026-09-12 carry no reason;
3. no in-worker terminal write — the six patches in
   `qnfo-ops/patches/2026-09-13-AUDIT-AND-FIX-consolidated.md` §1 remain unshipped
   (`qnfo-ops/worker.js` is 161,339 B against a 32,768-char read cap).

`qnfo-ops-jobs-reaper/` is **dead code** at its shipped 45m/90m thresholds (slower than the
existing ~20-minute reaper). Do not deploy it as a D17 fix.
