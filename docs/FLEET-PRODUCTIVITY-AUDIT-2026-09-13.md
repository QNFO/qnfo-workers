# FLEET PRODUCTIVITY & STALENESS AUDIT — 2026-09-13

Source: qnfo-ops endpoint session. Every value below is a tool return from that session.
Where two of my own readings disagree, both are reported and the contradiction is left open.

**REVISION 2 (2026-09-13).** Revision 1 asserted that `qnfo-cloud-ops`'s syntax error lived in
`r2:qnfo-canonical/qnfo-cloud-ops.js` and that the fix was a canonical re-sync. **That was
wrong**, and the error is corrected in §6.6. The root cause had already been found and fixed
earlier the same day, and issue 691 is **closed**.

---

## 0. Method note — the oracle I used, and its limits

The CF GraphQL `worker_invocations_30d` tool result is **unusable as a staleness oracle**: it
returned 8 named workers summing to 23,971 requests against a reported account total of
281,106. 257,135 requests are unattributed. Do not audit from it.

The usable oracle is `qnfo-audit.worker_activity_daily` (`worker_name`, `day`, `req24`,
`source='dashboard-scheduled-req24'`, `ts`), written hourly by `qnfo-fleet-dashboard`.
Coverage: 65 distinct worker names, 3,331 rows, from 2026-09-10T15:33Z to 2026-09-13T14:06Z.

**Limit:** `req24` is a scheduled-request count from a fixed roster, not a true invocation
count. A request-driven worker with no cron shows low/zero regardless of real traffic. Treat
`req24` as a *floor on scheduled activity*, not a productivity measure.

---

## 1. Headline: the "too many idle workers" premise is mostly an artifact

The fleet roster is 55 deployed workers (`fleet_status` deployedCount=55). 25 worker names in
`worker_activity_daily` show `req24=0` — but **all 25 are absent from the deployed roster**:

    events-radar, fleet-scheduler, jnl-referee, jnl-watch, job-market-watch,
    personal-events-radar, personal-life-indexer, personal-life-maintain, qnfo-analytics,
    qnfo-arxiv-radar, qnfo-auditor, qnfo-blank-audit, qnfo-citation-watch,
    qnfo-errata-publish, qnfo-errata-respond, qnfo-errata-watch, qnfo-error-selfheal,
    qnfo-fleet-advisor, qnfo-fleet-calibrator, qnfo-fleet-deploy, qnfo-idea-miner,
    qnfo-idea-triage, qnfo-pipeline-ops, qnfo-register-guard, qnfo-research-radar

Intersection of the 25 zero-traffic names with the 55 deployed = **0**. Their last activity row
is frozen at `2026-09-12T09:05` — 29h stale. These are **retired/merged workers whose final
measurement row was never removed**, i.e. ghosts in the measurement table, not idle live
workers. They are the pre-merge sources of wave A/B (`radar-hub` = events-radar +
qnfo-arxiv-radar + qnfo-research-radar + qnfo-citation-watch; `qnfo-fleet-control` = advisor +
calibrator + deploy; `fleet-exec` = executor + scheduler).

**Therefore: do not merge 25 more workers. The consolidation already happened; the
measurement table was not cleaned up.**

## 2. Genuinely low-traffic LIVE workers (the real finding)

Of the 55 deployed, 40 are measured. Sorted ascending by `req24` (snapshot 14:06Z):

| worker | req24 | note |
|---|---|---|
| qnfo-paper-explainer | **0** | deployed, zero scheduled requests in 24h |
| osf-integrity-check | 1 | |
| qnfo-impact | 1 | |
| qnfo-twin-maintain | 1 | |
| radar-hub | 2 | merged worker, near-idle |
| research-daily-brief | 2 | |
| qnfo-events | 4 | |
| audit-hub | 5 | |
| companion-hub | 5 | |

9 of 55 (16.4%) are below 10 req/24h; 4 are at or below 1. `qnfo-paper-explainer` is the only
deployed worker at exactly 0.

### 2.1 15 deployed workers have NO activity row at all

    errata-hub, obsidian-writer, qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-ai-search,
    qnfo-email, qnfo-gateway, qnfo-ipatent, qnfo-memory-mcp, qnfo-pdf, qnfo-proof,
    qnfo-qwav, qnfo-research-supervisor, qnfo-subscribers, qnfo-tools-mcp

Their productivity is **unverifiable, not zero**. Several are request-driven (qnfo-gateway
serves public traffic) and would legitimately have no cron. This is a measurement gap.

## 3. Health probing covers 9 of 55 workers

`fleet_probe_log` over the last 24h contains exactly 10 probed names: personal-api,
papers.qnfo.org, qnfo-ai, qnfo-fleet-dashboard, qnfo-kaizen, qnfo-ops, qnfo-outreach,
qnfo-paper-reviser, qnfo-social, qnfo.org — i.e. **9 workers + 1 site**. 46 deployed workers
are never health-probed. `fleet_heartbeat` holds **1 row** (qnfo-lifecycle);
`fleet_error_state` is **empty**. Confirms open issue 701.

## 4. Recurring cron execution is nearly absent

`fleet_runs` (the fleet-exec dynamic cron engine) shows only two tasks with meaningful
repetition:

| task | cron | runs | last | status |
|---|---|---|---|---|
| demo-heartbeat | `*/15 * * * *` | 391 | 2026-09-13T14:15Z | ok |
| systems-watch-hourly | `9 * * * *` | 75 | 2026-09-13T14:09Z | ok |
| venue-radar-scan | `45 6 * * *` | 3 | 2026-09-13T06:45Z | **failed** |
| report-card-weekly | `30 6 * * 1` | 1 | 2026-09-10T12:32Z | **failed** |

Everything else in `fleet_runs` is a one-shot manual row (`c=1`) from 2026-09-10.
`fleet_crons` registers only 6 crons, one `enabled=0` with `last_fired=NULL`.

**A cron named `demo-heartbeat-minutely` is the fleet's highest-frequency scheduled task.**
That is the clearest instance of "firing and nothing happens".

## 5. Cron configuration is not in source control, and `deployed-current.worker.js` is not source

`qnfo-impact/` in this repo contains **only** `deployed-current.worker.js` — no `worker.js`,
no `wrangler.toml`. `radar-hub/` has `worker.js` + one patch script, no `wrangler.toml`.

Per the closed issue 691, `deployed-current.worker.js` files are **upload-artifact snapshots,
not source** — at least one held a MIME multipart upload body beginning with a boundary. They
must not be treated as editable source, and a worker whose canonical resolves only from one has
no source in version control.

So for many workers the cron schedule exists only in the live deployment. The question
"does this worker run multiple times a day?" cannot be answered from the repo.

---

## 6. Errors / warnings / alerts

### 6.1 The alert storm is ONE source

`alerts` grouped by source: `qnfo-pipeline-ops` = 93 (09-09), 166 (09-10), 151 (09-11),
110 (09-12), 73 (09-13 to 14:08). Every other source is 1-2/day. Total ≈593 in 5 days,
**no decline**. Its content decomposes into exactly three messages, repeating hourly:

1. `research pipeline: failed=2 ... vqErr=1 ... terminal=2` (critical)
2. `terminal research failure 45/51 -> agent_issues dup: ensemble: only 0/3 legs produced drafts`
3. `INTAKE-STALL escalated -> agent_issues dup: 496 proposals stuck new`

### 6.2 Message 3 is false, verified

`idea_proposals` by status: `triaged_hold` 543, `triaged_accepted` 14, `ensemble-registered` 1.
**Zero rows with status `new`.** The watchdog counts a status that does not exist, so the
"496 stuck new" alert can never clear. (Issue 716 already records this.)

### 6.3 Message 2 is an issue-filing loop

`agent_issues` contains a long recurring family of auto-filed titles:
`TERMINAL research failure 45/51/40/8/10/JPCUB-ML-1` — ids 687, 688, 651, 647, 644, 636, 623,
594, 500, 437, 436, all now closed/resolved. The alert files a ticket, the ticket is closed,
the alert re-files it. Open descendants: 704, 705, 716.

### 6.4 The backlog drain closes nothing

`ops_issue_run` executed this session: `openBacklogBefore=36`, `processed=36`,
**`closed=0`**, `rechecked=36`, `escalated=0`. The drain re-probes and closes no rows. It is
running, and it is not fixing.

### 6.5 The `alerts` table is being pruned mid-session — all alert counts are unstable

Four reads of `alerts` in one session, minutes apart:

| read | result |
|---|---|
| `GROUP BY level, digested` | critical 806, warning 186, info 92, error 16, NULL 1 → **1101 rows** |
| `GROUP BY digested` | `1 -> 169` → **169 rows** |
| `WHERE created_at > '2026-09-13 14:15'` | **0 rows** (a 14:16:22 row had been returned minutes earlier) |
| `COUNT(*), MIN, MAX` | **169 rows**, MIN `2026-08-29 06:00:26`, MAX `2026-09-13 06:02:05`, 11 sources |

~932 rows disappeared between the first and second read, including every `qnfo-pipeline-ops`
storm row and the 14:16:22 row. **The storm's history is being erased**, so neither "the storm
continues" nor "the storm has stopped" can be verified from this table. `MAX(created_at)` is
now 06:02:05Z, which is *earlier* than rows I read at 14:22Z.

I assert neither explanation (concurrent prune vs. a wrong read). Consequence: **no alert count
in this document is exact.** `qnfo-observability`'s own v1.1.5 note documents a `digested` enum
containing `'auto'` (914 rows) which none of my four reads observed.

### 6.6 Deploy healer — kill switch ENGAGED; `qnfo-cloud-ops` was already fixed

`fleet_deploy_state` at 2026-09-13T14:23:10Z: `enabled=0`, `auto_heal=0`. `fleet_deploys` after
14:20 returns **0 rows** — the hourly retry loop has stopped.

Three targets were in the loop before the switch:

| worker | error | state |
|---|---|---|
| personal-companion | HTTP 400 code 10021 `Workflow GenerationFlow must be exported` | ~12+ consecutive hourly; **PROTECTIVE — do not fix** |
| qnfo-cloud-ops | HTTP 400 code 10021 `Uncaught SyntaxError ... at worker.js:1:2` | **ALREADY FIXED — see below** |
| qnfo-observability | HTTP 400 code 10021 `No such module "fleet.js" imported from worker.js` | 1 attempt (id 76, 14:04:01); fix in repo, undeployed |

**`personal-companion` MUST NOT BE FIXED.** Per `personal-companion/FINDING-2026-09-13-deploy-loop-DO-NOT-FIX-10021.md`,
the 10021 rejection is the only thing preventing canonical `1.0.0` from replacing live
`v1.1.0` on reading.q08.org. Fixing the export removes the last barrier to an hourly
downgrade. `auto_heal=0` is the correct precondition; it is now set.

**`qnfo-cloud-ops` — RESOLVED, and revision 1 of this document was wrong about it.** Issue 691
is **closed**. The syntax error was not in `r2:qnfo-canonical/qnfo-cloud-ops.js`: the resolver
candidate `qnfo-workers/main/qnfo-cloud-ops/deployed-current.worker.js` held a **MIME multipart
upload body beginning with a boundary**, so `redeploy()` uploaded the boundary as the module
and Cloudflare rejected it at byte 1. Commit `927ccb8d` replaced that body with a 404-prefixed
tombstone at `2026-09-13T07:21:03Z`, and `canonical()` now skips any candidate whose first four
bytes are `404:`, falling through to `qnfo-cloud-ops/worker.js`.

Independently corroborated from my own reads this session:
- `fleet_deploys`: newest `qnfo-cloud-ops` row is `2026-09-13 07:02:38`; **no attempt since**.
- Both repo copies of the source are clean — `QNFO/qnfo-workers/qnfo-cloud-ops/worker.js`
  (sha `59dd468d`) and `QNFO/qnfo-ops/cloud/scheduler/worker.js` (sha `1851450d`) — each begins
  `import { connect } from "cloudflare:sockets";`.

**`qnfo-observability` — fix exists, undeployed.** Repo `worker.js` is v1.1.6-single-module,
which inlines `FLEET` and drops `import './fleet.js'`. Canonical R2 is v1.1.4 (multi-module).
Issue 702 additionally records that the live worker reports 1.2.0 and the ingest cursor is
stuck, so the staged 1.1.6 patcher is not usable as-is.

### 6.7 The observability layer is blind and reports health

`cloud_ops_events` kind `fleet-observability-digest`, 2026-09-13T14:18:13Z:

    Fleet observability digest: 0 workers logged 0 events in 24h; 0 anomalies

`worker_logs` is frozen at 2026-09-10T11:17:40Z (issue 702). So the digest reports **"0
anomalies" because it has 0 data**. A monitor that cannot see anything reports health — the
same failure mode `qnfo-observability` v1.1.5 documented for itself.

### 6.8 Two subsystems disagree about model health

`cloud_ops_events` kind `advisor-audit` fires every 20 minutes (12:20 → 14:21Z) and repeatedly
reports `up:13, down:2` with suggestions such as `FORCE-ROLLBACK-DEGRADED-MODELS`,
`Escalate MODEL-DEGRADED to HIGH`, `Halt traffic to the four degraded checkpoints`.

Against that, this session's direct aggregate of `ai_model_health`:

    total 20 | @cf/* rows 0 | status='degraded' 0

The advisor's "down:2 / four degraded checkpoints" and `ai_model_health`'s zero degraded rows
**cannot both be describing the same table**. Unresolved; the advisor's degraded set has no
traceable source in `ai_model_health`.

### 6.9 `worker_invocations` is a dead probe table emitting false 5xx

90 rows, last written 2026-09-13T03:05:38Z (twice-daily). It probes `https://qnfo-ai.internal/health`,
`https://personal-api.internal/...`, `https://qnfo-ai.q08.workers.dev/...` — `.internal`
hostnames that do not resolve from outside, producing **HTTP 530** on nearly every row
(12 rows of 530 in the recent window), plus 404s for the workers.dev variant. It contributes
no signal and is a source of false "errors".

---

## 7. P0 — credential material is readable in a bound R2 bucket

`r2_list bucket=backups` returns a `credentials/` prefix with 9 objects:

    credentials/.env                     (395 B)
    credentials/.bsky_credentials        (37 B)
    credentials/keys-2026-08-05.json     (544 B)
    credentials/fleet-deploy-admin-token.txt  (48 B)
    credentials/orch-token.txt           (48 B)
    credentials/code-agent-key.txt       (48 B)
    credentials/osf-token.txt            (70 B)
    credentials/orcid-client-2026-08-05  (164 B)
    credentials/wikidata-2026-08-05      (39 B)

**Contents were not read and are not reproduced here.** Listed only, to establish exposure.
Any principal holding the `BACKUPS_R2` binding can read every one. Remediation requires
account-level access (rotate all nine, then restrict the binding). Not performed from this
endpoint.

---

## 8. Remediation queue — every remaining item is deploy-gated

The ops endpoint has no deploy route: `qnfo-fleet-control` holds the capability but
`https://qnfo-fleet-control.q08.workers.dev/health` returns **HTTP 404**, and it is not among
this endpoint's 12 service bindings. `r2:qnfo-canonical/*` is not among the 4 bound R2 buckets
(prefixes `canonical` and `qnfo-canonical` both return 0 objects in `audit` and `releases`).

Ordered, because several steps are unsafe out of order:

1. **[DONE 14:23Z]** `fleet_deploy_state.auto_heal = 0`. Precondition for everything else.
2. Deploy `qnfo-observability` v1.1.6-single-module (fix in repo) — noting the live worker is
   1.2.0 and the cursor fault in 702 is not the module-topology fault, so both need handling.
3. Reconcile canonical `personal-companion` to >= v1.1.0 **and** export `GenerationFlow`,
   *then* fix `qnfo-fleet-control/version-compare.mjs` (the leading-`v` misparse).
   Do not fix 10021 before this.
4. Fix the `qnfo-pipeline-ops` alert predicates: `idea_proposals` status `new` does not exist;
   add dedupe so a closed ticket is not re-filed hourly (issue 697, v0.5.5 authored, undeployed).
5. Restore `worker_activity_daily` roster to all deployed workers; purge the 25 ghost rows.
6. Give `worker_invocations` resolvable endpoints or delete the table.
7. Rotate the 9 `credentials/*` objects and restrict `BACKUPS_R2`.
8. Stop the `alerts` prune or add snapshot semantics — a monitoring table whose row count moves
   from 1101 to 169 under concurrent reads cannot be used as evidence.

**Already resolved, no action needed:** `qnfo-cloud-ops` (691 closed), `OPEN-ISSUES-BACKLOG`
(717 closed).

## 9. What I did NOT establish

- Whether the 15 unmeasured workers are productive. No data.
- Whether `qnfo-pipeline-ops` is a live worker. It appears in `worker_activity_daily` but not in
  the 55-worker roster, and shows `req24=0` frozen at 09-12T09:05 while emitting alerts hourly
  today — so either the alert `source` string is a label written by another worker, or the
  measurement is blind to it. Unresolved.
- Whether the alert storm is still running (§6.5 — its rows are being deleted).
- Why the advisor reports `down:2` while `ai_model_health` reports 0 degraded (§6.8).
- The deployed revision of `qnfo-pipeline-ops`. `pipeline_state` is absent from live D1.

## 10. Corrections to this document's own revision 1

1. `qnfo-cloud-ops` root cause and remediation were **wrong** (§6.6). It was a MIME multipart
   body in a resolver candidate, already fixed by `927ccb8d`; issue 691 is closed.
2. A prior turn of this same session reported `ai_model_health` as 25 rows / 5 degraded `@cf/*`
   rows. The direct aggregate refutes it: **20 rows, 0 `@cf/*`, 0 degraded**. Revision 1
   inherited that error; it is corrected here.
3. `deployed-current.worker.js` was described as source. It is an upload artifact (§5).
