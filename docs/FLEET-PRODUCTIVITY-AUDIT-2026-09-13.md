# FLEET PRODUCTIVITY & STALENESS AUDIT — 2026-09-13

Source: qnfo-ops endpoint session. Every value below is a tool return from that session.
Where two of my own readings disagree, both are reported and the contradiction is left open.

**REVISION 3.** Adds the reachability correction (§11), the hub consolidation map (§12), and the
`wrangler.toml` shadow finding (§13). Revision 1's `qnfo-cloud-ops` remediation was wrong and is
corrected in §6.6; revision 2's claim that the deploy route is unreachable was also wrong and is
corrected in §11.

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
measurement row was never removed**. §12 identifies them as the absorbed members of the hub
workers.

**Therefore: do not merge 25 more workers. The consolidation already happened; the
measurement table was not cleaned up.**

## 2. Genuinely low-traffic LIVE workers (the real finding)

Of the 55 deployed, 40 are measured. Sorted ascending by `req24` (snapshot 14:06Z):

| worker | req24 | note |
|---|---|---|
| qnfo-paper-explainer | **0** | deployed, zero scheduled requests in 24h |
| osf-integrity-check | 1 | |
| qnfo-impact | 1 | |
| qnfo-twin-maintain | 1 | `/health` returns **404** — no health route |
| radar-hub | 2 | hub, 6 radars; near-idle |
| research-daily-brief | 2 | |
| qnfo-events | 4 | |
| audit-hub | 5 | hub, 4 members; cron-driven |
| companion-hub | 5 | hub, 4 members; overlaps personal-companion |

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
`fleet_error_state` is **empty**. Confirms open issue 701, now extended with these numbers.

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

**A cron named `demo-heartbeat-minutely` is the fleet's highest-frequency scheduled task in
this ledger.** That is the clearest instance of "firing and nothing happens".

**Counter-evidence (must be weighed):** `fleet_runs` only covers the `fleet-exec` task engine.
`qnfo-cloud-ops` declares 22 jobs and its own cron list via `/health`, e.g.
`15 4 * * * -> release-check`, `0 6,12 * * 1-5 -> email-triage`, `30 6 * * 1-5 -> briefing`,
`0 7,13 * * 1-5 -> gmail-triage`, `0 8 * * 1-5 -> research-scan`, `0 15 * * 5 -> weekly`,
`0 4 * * 7 -> weekly-ops`. So **the fleet is not cron-poor overall**; the *ledger* is
cron-poor. This weakens §4 as a fleet-wide claim and it should be read as scoped to `fleet-exec`.

## 5. Config drift: the repo `wrangler.toml` is a partial shadow of production

`qnfo-impact/` contains **only** `deployed-current.worker.js` — no `worker.js`, no
`wrangler.toml`. `radar-hub/` has `worker.js` + one patch script, no `wrangler.toml`.

The hubs do have `wrangler.toml`, but they carry **no `[triggers]`/crons section at all**, and
their bindings are annotated as incomplete:

    # binding SEND_EMAIL: type=send_email (see deployed config)
    # binding VZ: type=vectorize (see deployed config)
    # binding BROWSER: type=browser (see deployed config)

`audit-hub/wrangler.toml` (222 B) declares only `name`, `main`, `compatibility_date` and one D1
binding. `errata-hub/wrangler.toml` (672 B) omits BROWSER and SEND_EMAIL. `companion-hub`
omits VZ.

**Consequence:** cron triggers and several bindings exist only in the live deployment. The
question "does this worker run multiple times a day?" is **not answerable from version
control** — it must be read from each worker's `/health`.

Per closed issue 691, `deployed-current.worker.js` files are **upload-artifact snapshots, not
source** — at least one held a MIME multipart upload body beginning with a boundary. A worker
whose canonical resolves only from one has no source in version control.

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
continues" nor "the storm has stopped" can be verified from this table.

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
which inlines `FLEET` and drops `import './fleet.js'`. Live `/health` reports **1.2.0**,
`merged:["qnfo-observability","qnfo-analytics"]`. Issue 702 records the ingest cursor is stuck,
so the module-topology fix and the cursor fault are separate.

### 6.7 The observability layer is blind and reports health

`cloud_ops_events` kind `fleet-observability-digest`, 2026-09-13T14:18:13Z:

    Fleet observability digest: 0 workers logged 0 events in 24h; 0 anomalies

`worker_logs` is frozen at 2026-09-10T11:17:40Z (issue 702). So the digest reports **"0
anomalies" because it has 0 data**.

### 6.8 Two subsystems disagree about model health

`cloud_ops_events` kind `advisor-audit` fires every 20 minutes (12:20 → 14:21Z) and repeatedly
reports `up:13, down:2` with suggestions such as `FORCE-ROLLBACK-DEGRADED-MODELS`,
`Escalate MODEL-DEGRADED to HIGH`, `Halt traffic to the four degraded checkpoints`.

Against that, this session's direct aggregate of `ai_model_health`:

    total 20 | @cf/* rows 0 | status='degraded' 0

The advisor's "down:2 / four degraded checkpoints" and `ai_model_health`'s zero degraded rows
**cannot both be describing the same table**. Unresolved.

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

## 11. CORRECTION — the fleet IS reachable on `q08.workers.dev`; the deploy route EXISTS

Revision 2 (and the prior session's note) asserted the deploy route was unreachable because
`q08.workers.dev` returns 404. **That is wrong.** Direct fetches this session:

| URL | result |
|---|---|
| `https://qnfo-cloud-ops.q08.workers.dev/health` | **200** — `{"ok":true,"worker":"qnfo-cloud-ops","version":"1.14.1","jobs":[22 jobs],"crons":[...]}` |
| `https://qnfo-observability.q08.workers.dev/health` | **200** — `{"version":"1.2.0","merged":["qnfo-observability","qnfo-analytics"]}` |
| `https://qnfo-fleet-control.q08.workers.dev/` | **401** — token-gated, **not** 404 |
| `https://qnfo-impact.q08.workers.dev/health` | 200 |
| `https://osf-integrity-check.q08.workers.dev/health` | 200 (live OSF registration report, `checked_at 2026-09-13T14:27:07Z`) |
| `https://qnfo-paper-explainer.q08.workers.dev/health` | 200 |
| `https://radar-hub.q08.workers.dev/health` | 200 — `{"radars":6}` |
| `https://audit-hub.q08.workers.dev/health` | 200 — `{"members":4}` |
| `https://companion-hub.q08.workers.dev/health` | 200 — `{"members":4}` |
| `https://errata-hub.q08.workers.dev/health` | 200 — `{"members":3}` |
| `https://jnl-pipeline.q08.workers.dev/health` | 200 |
| `https://fleet-exec.q08.workers.dev/health` | 200 |
| `https://qnfo-twin-maintain.q08.workers.dev/health` | **404** — deployed, no health route |

`qnfo-fleet-control` — the holder of the deploy capability — is **live and answering 401**. It
is not absent.

**The real blocker is narrower:** `web_fetch` accepts only a URL and a character limit. It
**cannot send an `Authorization` header**, so this endpoint cannot authenticate to a
token-gated route. The deploy capability exists and is one credential-bearing HTTP client away.
That is a materially different situation from "no route exists", and it changes the remediation
owner from "unblock infrastructure" to "run one authenticated call".

Note also: `qnfo-cloud-ops` `/health` reports version **1.14.1**, which matches
`fleet_deploys`' last successful target and the repo source — so the drift rows calling it
`canonical-ahead`/`stale-canon` are comparator artifacts, not real drift.

## 12. Hub consolidation map — the consolidation is DONE

The fleet consolidates through "hub" workers that bundle member modules. Live `/health`
declarations:

| hub | declares | evidence |
|---|---|---|
| `audit-hub` | `members: 4` | v1.0.0 |
| `companion-hub` | `members: 4` | v1.0.0 |
| `errata-hub` | `members: 3` | v1.0.0 |
| `idea-hub` | `merged: [idea-hub, qnfo-thread-ingest]` | v1.0.0 |
| `qnfo-observability` | `merged: [qnfo-observability, qnfo-analytics]` | v1.2.0 |
| `radar-hub` | `radars: 6` | v1.0.0 |
| `fleet-exec` | executor + scheduler | registry: "wave A 2->1" |
| `qnfo-fleet-control` | advisor + calibrator + deploy | registry: "wave A" |

**Inferred mapping (counts corroborate, member names not directly read):** the 25 ghost names
in `worker_activity_daily` are the absorbed members. The count match is exact for `errata-hub`
(3 members = qnfo-errata-publish, qnfo-errata-respond, qnfo-errata-watch — all 3 in the ghost
list) and consistent for `audit-hub` (4 members; the ghost list contains exactly 4 audit-family
names: qnfo-auditor, qnfo-blank-audit, qnfo-error-selfheal, qnfo-register-guard). `radar-hub`'s
6 radars align with the ghost names qnfo-arxiv-radar, qnfo-research-radar, qnfo-citation-watch,
events-radar, personal-events-radar, job-market-watch.

I label this **inferred**, not verified: I read member *counts*, not member *names*, and no hub
exposes a member-list route (`/` returns only the hub's own name).

**Actionable merge candidate:** `companion-hub` (4 members, 5 req/24h, v1.0.0) overlaps
`personal-companion` (543 req/24h, v1.1.0) — same model set (kimi-k2.6 / gpt-oss-120b /
glm-5.3), same "notes / essay / serial" content loop, and `companion-hub/wrangler.toml` binds
the same PERSONAL D1 (`e8d6c61a-10b7-4086-b81e-9e6e85afa407`) plus `d-drive` and
`personal-media` R2. That is a real 2→1, and the only one I would act on from the low-traffic
set. `audit-hub` is **not** a merge candidate despite req24=5: it is a 14-check auditor,
cron-driven by design.

---

## 8. Remediation queue

1. **[DONE 14:23Z]** `fleet_deploy_state.auto_heal = 0`. Precondition for everything else.
2. Deploy `qnfo-observability` v1.1.6-single-module (fix in repo) — noting the live worker is
   1.2.0 and the cursor fault in 702 is separate from the module-topology fault.
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
9. Merge `companion-hub` into `personal-companion` (§12) — the only defensible 2→1.
10. Add `[triggers]`/crons and the missing bindings to every `wrangler.toml` (§5), or document
    that production config is authoritative. As it stands, cron schedules are unversioned.

**Already resolved, no action needed:** `qnfo-cloud-ops` (691 closed), `OPEN-ISSUES-BACKLOG`
(717 closed).

## 9. What I did NOT establish

- Whether the 15 unmeasured workers are productive. No data.
- Whether `qnfo-pipeline-ops` is a live worker. It appears in `worker_activity_daily` but not in
  the 55-worker roster, shows `req24=0` frozen at 09-12T09:05 while emitting alerts hourly, and
  `https://qnfo-pipeline-ops.q08.workers.dev/health` was not probed. Unresolved.
- Whether the alert storm is still running (§6.5 — its rows are being deleted).
- Why the advisor reports `down:2` while `ai_model_health` reports 0 degraded (§6.8).
- The hub member *names* (§12 — counts only).
- The deployed revision of `qnfo-pipeline-ops`. `pipeline_state` is absent from live D1.

## 10. Corrections to this document's own revisions

1. `qnfo-cloud-ops` root cause and remediation were **wrong** (§6.6). It was a MIME multipart
   body in a resolver candidate, already fixed by `927ccb8d`; issue 691 is closed.
2. A prior turn of this same session reported `ai_model_health` as 25 rows / 5 degraded `@cf/*`
   rows. The direct aggregate refutes it: **20 rows, 0 `@cf/*`, 0 degraded**.
3. `deployed-current.worker.js` was described as source. It is an upload artifact (§5).
4. **The deploy route was described as unreachable.** Wrong — `q08.workers.dev` answers, and
   `qnfo-fleet-control` returns 401, not 404 (§11). The blocker is the absence of header support
   in this endpoint's fetch tool.
5. §4 was written as a fleet-wide cron claim. It is scoped to the `fleet-exec` ledger only;
   `qnfo-cloud-ops` alone declares 7+ recurring crons (§4, §11).
