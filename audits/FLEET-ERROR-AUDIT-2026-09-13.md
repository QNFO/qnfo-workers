# FLEET ERROR / WARNING / ALERT AUDIT — 2026-09-13

Auditor: qnfo-ops (ops-exec). Method: direct tool execution only — `fleet_status`,
`backlog_status`, `telemetry_report`, `cf_analytics`, `email_stats`, `web_fetch`, and
read-only SQL over `qnfo-audit`. Every number below is a live query result from this
session (14:08–14:20Z). Nothing is inferred where it could be measured.

Operator directive: *"Fleet shows numerous errors, warnings, and alerts, all of which
must be audited, fixed, and resolved permanently."*

---

## 0. Headline

The fleet is **substantially healthier than its alert volume implies**. Of the four
dominant "error" classes, **three are false or self-inflicted signals**, and one
(`idea_proposals` triage stall) is real, large, and was **mislabeled by the alert that
reports it**.

| Class | Volume | Verdict |
|---|---|---|
| `qnfo-pipeline-ops` critical alerts | 802 rows | **Alert storm** — 4 conditions re-alerted up to 121× each |
| `web_fetch` tool failures | 282/24h | **Observer artifact** — documented same-account workers.dev 404 |
| `worker-health` job errors | 15 rows | **False alarm** — probes public hostnames; service bindings report 200 |
| `idea_proposals` triage stall | 543 rows | **REAL** — and mislabeled "stuck new" |
| Terminal research failures | 2 rows | **REAL** — ensemble starved of sources |
| `version_queue` id=18 | 1 row | **Self-recovered** during this audit |

---

## 1. Alert inventory (`alerts` table, all time)

| source | level | n | last |
|---|---|---|---|
| qnfo-pipeline-ops | critical | **802** | 2026-09-13 14:01:22 |
| qnfo-pipeline-ops | info | 81 | 2026-09-13 09:46:00 |
| qnfo-error-selfheal | warning | 67 | 2026-09-11 09:19:14 |
| qnfo-pipeline-ops | warning | 48 | 2026-09-13 07:31:00 |
| qnfo-backlog-exec | warning | 33 | 2026-09-08 09:55:43 |
| checker | warn | 15 | 2026-09-13 06:02:05 |
| worker-health | error | 15 | 2026-09-13 03:05:43 |
| blank-audit | warning | 12 | 2026-09-13 04:40:39 |
| digest | info | 11 | 2026-09-08 07:00:14 |
| scan | warning | 9 | 2026-09-09 06:02:26 |
| chat-canary | HIGH | 4 | 2026-09-02 19:05:49 |
| qnfo-ai-anomaly | warning | 1 | 2026-09-12 07:06:05 |
| health-guard | error | 1 | 2026-09-01 18:29:02 |

**`digested=0` count: 0.** Nothing is pending digestion. The 802-row critical figure is
volume, not 802 distinct problems.

## 2. The alert storm — root cause (DEFECT A)

Top repeated critical messages:

| message | repeats | last |
|---|---|---|
| `terminal research failure 45 -> agent_issues dup: ensemble: only 0/3 legs produced drafts` | **121** | 09-13 14:01:20 |
| `terminal research failure 51 -> agent_issues dup: ensemble: only 0/3 legs produced drafts` | **71** | 09-13 14:01:21 |
| `INTAKE-STALL escalated -> agent_issues dup: 496 proposals stuck new` | **24** | 09-13 13:01:00 |
| `terminal research failure 40 -> agent_issues dup: ...` | 72 | 09-10 08:15:39 |
| `research pipeline: failed=2 ... vqErr=1 ... terminal=2` | 23+22+9+9... | 09-13 14:01:22 |

Every one of these messages contains the literal string **`-> agent_issues dup`** — i.e.
pipeline-ops has already filed the ticket and *knows* it is a duplicate, then **re-alerts
on the next cycle anyway**. 121 identical alerts for one ticket.

**Defect A**: no re-alert suppression. Once a condition is filed to `agent_issues`, the
condition should be *tracked* (state transition) not *re-announced* (new alert row).
**Permanent fix**: alert on transition only — dedupe key = `(condition, issue_id)`, emit
one row on open and one on resolve; suppress all intermediate cycles.

## 3. The one real large backlog — and it is mislabeled (DEFECT B)

The alert says **"496 proposals stuck new"**. Measured state:

- `research_queue`: published 19, ensemble-draft 3, failed 2, pending 1 — **zero rows with
  `status='new'`.** The alert's stated target table/status does not exist.
- `idea_proposals`: `triaged_hold` = **543** (newest 2026-09-12T09:50:44Z),
  `triaged_accepted` = 14, `ensemble-registered` = 1.

**Defect B, two parts**:
1. **Message is wrong** — the condition is `idea_proposals.status='triaged_hold'`, not
   "proposals stuck new" in `research_queue`. The alert text names a nonexistent state.
2. **The condition is real and growing** — 543 held (up from the 496 in the alert text),
   newest intake 2026-09-12T09:50Z, i.e. **triage intake has been stalled ~28 hours**.
   Nothing is advancing from `triaged_hold` to `triaged_accepted` (14) or dispatch.

**Permanent fix**: (a) correct the alert's condition string and source table; (b) the
`triaged_hold` → `triaged_accepted` promotion path needs a drain — 543 items with a
promotion rate of ~14 total is not a threshold problem, it is a stalled executor.

## 4. False alarms from public-URL probing (DEFECT C)

`worker-health` job, verbatim:
```
worker-health FAILED [{"worker":"qnfo-ai","status":530,"error":"HTTP 530 body:error code: 1016"},
                      {"worker":"personal-api","status":530,...1016},
                      {"worker":"qnfo-ai-chat","status":530,...1016},
                      {"worker":"personal-api-chat","status":530,...1016}]
```
`530 / error code 1016` = origin DNS error. Yet **`fleet_status` (service binding) reports
`qnfo-ai` healthy, HTTP 200, version 5.25.1** — measured this session, same minute.

**Defect C**: the health job probes public hostnames that do not route to these workers,
so four healthy workers are reported down. This is the same class already documented in
`qnfo-ai-calibration/worker.js` (`SVC-BINDING-1`: *"same-account workers.dev fetches 404
at the edge from inside a Worker (verified live 2026-09-04) — internal probes use service
bindings"*) and in `qnfo-observability/FINDING-2026-09-13-jobs-status-public.md` §2.2
(*"`web_fetch` cannot reach any `*.q08.workers.dev` host … the 404 is a property of the
observer"*).

**Permanent fix**: `worker-health` must probe via service bindings (as `fleet_status`
does) or be deleted as redundant with `fleet_status`.

## 5. Tool-failure telemetry — mostly observer artifacts

24h window (`telemetry_report`): **7,599 calls, 668 failures (8.8%)**, 199 chats,
26 chat failures, 0 open self-heal issues.

| tool | failures | verdict |
|---|---|---|
| `web_fetch` | 282 | **Observer artifact.** Sampled `meta` shows the dominant target is `https://qnfo-ops.q08.workers.dev/health`, `/`, `/manifest`, `/v1/models`, `/v1/jobs/…` — the endpoint probing its own public host. Confirmed live: `/health` → HTTP 404 on both `qnfo-ops` and `qnfo-ai`. Not an outage. |
| `ops_d1_query` | 185 | **Guard rejections, working as designed** — `add LIMIT n (aggregate exempt)`, `no such column`. Structured refusals, correctly counted as errors. |
| `github_repo_read` | 66 | **32,768-char hard cap** on large files (reproduced in the FINDING doc); path misses. |
| `github_file_write` | 66 | Missing-branch / sha-precondition rejections. |
| `web_search` | 28 | Upstream DDG variance. |

`cloud_ops_events` 24h by kind: `ops_ai_tool` ok 9,315 / error 1,058 / rejected 205;
`heartbeat` 230; `proactive-alert` err 44 / warn 18; `latex-fail` 23; `done` error 59
(all-time) / ok 111.

**Permanent fix**: separate *observer* failures from *target* failures in telemetry, and
stop counting structured guard rejections (`rejected`) as `error`. Otherwise the failure
rate is permanently inflated and the self-heal loop chases phantoms.

## 6. Real defects (confirmed, with root cause)

### D1 — Terminal research failures ×2 (open issues 687, 688)
Both rows carry identical context: `{"pipeline":"0.8.0-artifact-deposit","bibCount":0,"srcFetched":false}`,
`attempt:3, recover_count:2, terminal_rearms:3`, error `ensemble: only 0/3 legs produced drafts`.
**Root cause: source retrieval failed (`srcFetched:false` → `bibCount:0`), so all three
ensemble legs had no material.** Corroborated by `paper-explain error: arxiv 429`
(2026-09-13T14:01:18Z). This is a **source-fetch starvation** defect, not an ensemble defect.
**Fix**: make the ensemble stage fail *loudly on zero sources* with a distinct error class
(`source-starvation`) and add arXiv/OpenAlex backoff + fallback provider — do not retry the
ensemble three times against an empty corpus.

### D2 — `version_queue` id=18 (open issue 677) — SELF-RECOVERED
Issue 677 asserts "row 18 in error since 2026-09-13 05:21:30". Measured: `status='drafted'`,
`recover_count=1`, `updated_at = 2026-09-13 14:05:07` — i.e. **the row recovered during this
audit window**. The ticket is stale.
**Fix**: close 677 with evidence; add auto-close when the referenced row leaves error state.

### D3 — AI Gateway failure classes repeating every ~30 min
8 classes, identical each sweep (verified across two consecutive sweeps):

| model (CF id) | status | class | count |
|---|---|---|---|
| `@cf/baai/bge-base-en-v1.5` | 429 | rate-capacity | 79 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | 400 | content-shape | 42 |
| `@cf/qwen/qwen3.8-27b` | 400 | upstream | 18 |
| `@cf/moonshotai/kimi-k2.6` | 429 | rate-capacity | 6 |
| `@cf/moonshotai/kimi-k2.7-code` | 429 | rate-capacity | 2 |
| `@cf/zai-org/glm-5.2` | 400 | tool-args-json | 1 |
| `@cf/google/gemma-4-26b-a4b-it` | 400 | image-input | 1 |

These are **real caller bugs**, not probe artifacts (the calibration worker uses service
bindings):
- `qwen2.5-coder-32b-instruct`: *"oneOf at '/' not met … required properties at '/' are
  'prompt'"* — a caller is sending `messages` to a `prompt`-shaped endpoint. **Permanent 400.**
- `qwen3.8-27b`: *"System message must be at the beginning"* — caller message-ordering bug.
- `gemma-4-26b-a4b-it`: *"image dimensions must be at least 10px (got 1x1)"* — the vision
  probe's payload is not the 10×10 PNG it claims.
- `bge-base-en-v1.5` 429 ×79/sweep — embedding tier is rate-saturated; needs batching/backoff.
**Fix**: correct the two caller payload shapes; fix the vision probe image; add backoff for
the embedding tier.

### D4 — 5 models `degraded` (of 25 in `ai_model_health`)
`ok` 20 / `degraded` 5 — all five are `@cf/…` gateway aliases (`qwen3.8-27b` with 1,371
lifetime gateway failures, `zai-org/glm-5.2`, `qwen2.5-coder-32b-instruct`,
`google/gemma-4-26b-a4b-it`, `baai/bge-base-en-v1.5`); their internal roster counterparts
are all `ok`. Since `qnfo-ai` `autoRoute` **excludes degraded models**, D3's caller bugs are
**directly shrinking routing capacity**. D3 and D4 are one defect.

### D5 — `latex-fail` ×23
Payload: `non-pdf text/plain; charset=utf-8 … This is pdfTeX, Version 3.141592653-2.6-1.40.29`.
The PDF pipeline is receiving `text/plain` (a LaTeX log) where it expects a PDF — recurring
every ~2h. **Fix**: the compile step is not producing/returning the PDF artifact; inspect
the TeX Live 2026 invocation and the MIME assertion.

### D6 — `zenodo-stats` total failure
`{"fetched":0,"errors":218,"corpus":218}` — **218 of 218 fetches failed** (2026-09-12T07:01).
**Fix**: 100% failure = credential or endpoint change, not rate limiting.

### D7 — `telemetry_report` ignores its `hours` argument (STILL LIVE)
`hours=1` → `windowHours:24`; `hours=6`, `24`, `168` → all `windowHours:24`. Sibling
`telemetry_analyze(hours=1)` **does** honour it → the bug is local to `telemetry_report`.
**Fix**: patch in `qnfo-ops/worker.js`. **Cannot be applied from this endpoint** — the file
is 161,339 B, over the 32,768-char read cap, and the repo copy is 2.14.0 vs live 2.15.1, so
a repo-based write would be a downgrade. Handoff required.

### D8 — `gtd-overdue-guard` worsening
`overdue=26` (2026-09-13T03:10Z) vs `overdue=7` (2026-09-12T03:10Z) — **3.7× in 24h**, plus
`agent_uncited=67`. `loose-threads-sweep`: 41 items (handoffs 40, tasks 0).

### D9 — `research-daily-brief` FAILED
`[research-daily-brief] FAILED 2026-09-13T06:07:35.524Z` — delivered to `alerts@qnfo.org`.

## 7. Verified-healthy (do not treat as failures)

- **`fleet_status`: 55 deployed, 12 probed healthy, 12/12 HTTP 200.** The other 43 show
  `"probe":"api"`, `healthy:null` — they have **no service binding**, so they are
  **unprobed, not down**. Reading null as failure is a reporting defect.
- `qnfo-ai` 5.25.1 · `qnfo-gateway` 3.6.1-subscribers · `qnfo-backlog-exec` 1.2.8 ·
  `qnfo-memory-mcp` 2.0.3 · `qnfo-paper-indexer` 2.2.0 (529 docs) · `qnfo-lifecycle` 1.6.1 ·
  `qnfo-email` 1.8.0 · `qnfo-email-orchestrator` 0.3.4 · `qnfo-archive` 1.2.0 ·
  `qnfo-skill-sync` 1.1.2 · `qnfo-kaizen` 0.3.2 · `qnfo-ai-search` 1.0.2.
- **`backlog_status`: v1.2.8, `openBacklog: 3`** — matches D1 `agent_issues` open = 3 exactly.
- **`agent_issues`: open 3 / closed 320 / wontfix 258 / resolved 105** (686 total). The
  backlog collapsed from 17 (2026-09-12) to 3.
- **`ops_issues_list` IS FIXED** — returns `count:3` with ids 677/687/688, matching SQL
  exactly. The long-standing missing-`await` defect is **resolved** in the live deploy.
- `cf_analytics` 30d: 1,137,177 neurons ≈ **$12.51**, 280,655 requests, 187 errors.
- `email_stats`: 682 total, 23/24h, 176 classified `alerts`, 45 `spam`, 12 `replied`.

---

## 8. Remediation ledger

| # | Defect | Fix | Owner | Status |
|---|---|---|---|---|
| A | Alert storm (no re-alert suppression) | transition-only alerting, dedupe on `(condition, issue_id)` | qnfo-pipeline-ops | **staged — needs deploy** |
| B | `idea_proposals` 543 stalled in `triaged_hold` | fix alert label + drain promotion path | qnfo-pipeline-ops / triage | **open — real backlog** |
| C | `worker-health` false 530/1016 | probe via service bindings or delete (dup of `fleet_status`) | worker-health owner | **staged — needs deploy** |
| D1 | Ensemble source starvation | distinct `source-starvation` error + arXiv backoff/fallback | qnfo-research-exec | **open** |
| D2 | Stale issue 677 | close with recovery evidence | backlog | **ready to close** |
| D3 | Gateway caller payload bugs | fix `prompt` vs `messages`, system-order, probe image; embed backoff | qnfo-ai / calibration | **open** |
| D4 | 5 degraded models | resolves with D3 | — | **coupled to D3** |
| D5 | `latex-fail` ×23 | return PDF artifact, not TeX log | pdf pipeline | **open** |
| D6 | `zenodo-stats` 218/218 fail | credential/endpoint check | zenodo-stats | **open** |
| D7 | `telemetry_report` ignores `hours` | patch `qnfo-ops/worker.js` | deploy-capable runner | **blocked — file > read cap** |
| D8 | `gtd-overdue-guard` 7→26 | reconcile overdue register | register-guard | **open** |
| D9 | `research-daily-brief` FAILED | inspect 06:07Z run | research-daily-brief | **open** |

**Resolved this session:** `ops_issues_list` (D1-old) confirmed fixed; `version_queue` id=18
self-recovered.

## 9. What this endpoint could NOT do (structural, tested)

- **No deploy.** No `exec`/`wrangler`; `run_code` is isolated compute (no network/fs/bindings);
  `service_discover(qnfo-fleet-deploy)` → `service: null`.
- **No D1 writes.** `ops_d1_query` is read-only. Tickets cannot be closed or filed from here.
- **No large-file edits.** `github_repo_read` caps at 32,768 chars; `qnfo-ops/worker.js` is
  161,339 B → D7 not patchable here.
- **Drain is not the remedy.** `ops_issue_run` only auto-closes *re-probed-healthy* rows;
  the 3 open tickets are code/pipeline defects with no probe target.

## 10. Residual uncertainty (read before acting)

1. **`worker-health`'s source was not located.** The defect is proven behaviourally
   (530/1016 vs service-binding 200) but the owning worker was not identified this session.
2. **`idea_proposals.triaged_hold=543` is measured; the *reason* it does not advance is not.**
   A stalled executor and a deliberate hold are both consistent with the data.
3. **Failure-rate figures are inflated by design.** `rejected` (205) and observer-404s are
   counted as errors; the true target-failure rate is materially below 8.8%.
4. **`ops_d1_query` is itself a top-3 "failing" tool** (185/24h) purely from guard rejections —
   a self-referential telemetry artifact.
