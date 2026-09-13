# QNFO FLEET — BIG PICTURE + ACTION PLAN (rev 2, corrected)

Measured 2026-09-13T13:37–13:50Z from qnfo-ops. Every figure is a live tool return from this session.
rev 2 supersedes rev 1: two inferences in rev 1 were wrong (see §9).

## 1. HEADLINE — the backlog is 313, not 10

| store | open | visible to ops tools? |
|---|---:|---|
| `agent_issues` | **10** | yes (backlog_status, ops_issues_list, ops_issue_run) |
| `issue_ledger` | **303** | **NO — no ops tool exists for this table** |
| **true open total** | **313** | — |

`issue_ledger` status: open 303, resolved 21, acknowledged 1. It grew from 281 to 303 between
06:52Z and 13:50Z today (+22 in 7h). Inflow is not decaying.
Highest-weight ledger rows by occurrence count: cloud-ops/error 51 rows = **1,531 occurrences**;
alert/critical 65 rows = 794; alert/warning 85 = 167; telemetry-self-heal 6 = 127; ops-chat-fail 32.

Every "open backlog: 10" reading on this endpoint — including `backlog_status` — under-reports by ~30x.

## 2. The fleet is healthy; the agent's tools and the alerting are not

- 55 workers deployed. **Only 12 are probeable** (service bindings); the other 43 return
  `healthy:null, probe:"api"`. "12 healthy" is a coverage number, not a verdict.
  Probed OK: qnfo-ai 5.25.1, qnfo-ai-search 1.0.2, qnfo-archive 1.2.0, qnfo-backlog-exec 1.2.7,
  qnfo-email 1.8.0, qnfo-email-orchestrator 0.3.4-glm53, qnfo-gateway 3.6.1-subscribers,
  qnfo-kaizen 0.3.2, qnfo-lifecycle 1.6.1, qnfo-memory-mcp 2.0.3, qnfo-paper-indexer 2.2.0,
  qnfo-skill-sync 1.1.2.
- CF analytics 30d: **279,840 worker requests, 187 errors (0.07%)**. Workers AI 1,130,379 neurons,
  ~$12.43. Infrastructure cost and reliability are not the problem.
- The ops tool layer: **5,520 calls today, 525 errors (9.5%)**; 09-12 was 2,862/382 (13.3%);
  ~10% sustained for 7 days. Per-day errors: 09-13 525, 09-12 382, 09-11 104, 09-10 77, 09-09 140.

## 3. The one causal chain behind the two open-issue families

    gateway model calls fail (429 rate-limit / 400 payload-shape)
      -> ensemble research stage gets 0/3 legs producing drafts
      -> research_queue status='failed'  (source_id 45 and 51)
      -> TERMINAL research failure filed (issues 687, 688)
      -> nothing can close them (see §4) and the dedupe cannot see them (see §5)
      -> they re-file; research-daily-brief FAILS (email 709, 2026-09-13T06:07Z)

Evidence: `research_queue` error string verbatim `ensemble: only 0/3 legs produced drafts`,
attempt=3, terminal_rearms=3, recover_count=2, for source_id 45 and 51.
gw-fail issues 678–684 were filed inside a **12-second window** at 2026-09-13 07:31.

Real per-model failure volume (latest sweep):

| model | status | error_class | per sweep |
|---|---|---|---|
| @cf/baai/bge-base-en-v1.5 | 429 | rate-capacity | **89** (~4,300/24h) |
| @cf/qwen/qwen2.5-coder-32b-instruct | 400 | content-shape | 42 |
| @cf/qwen/qwen3.8-27b | 400 | upstream | 18 |
| @cf/moonshotai/kimi-k2.6 | 429 | rate-capacity | 6 |
| @cf/moonshotai/kimi-k2.7-code | 429 | rate-capacity | 2 |
| @cf/google/gemma-4-26b-a4b-it | 400 | image-input | 1 |
| @cf/zai-org/glm-5.2 | 429/400 | rate-capacity / tool-args-json | 1/1 |

**Highest-value single remediation is the embedding tier**: bge-base-en-v1.5 429 at 89/sweep.
Two of these are probe bugs, not model defects: gemma-4-26b's probe fixture is a PNG at exactly
10x10 against a 10px minimum (move to 16x16); qwen3.8-27b rejects "System message must be at the
beginning", i.e. the probe's payload shape.

## 4. `ops_issue_run` cannot close these rows — the drain is a structural no-op

Live: the drain returned `processed:25, closed:0`, every row
`"action":"recheck","note":"no probe target"`. It auto-closes only health-availability rows with an
executable re-probe; none of the open rows is that class. Re-running returns `closed:0` forever.
Separately, the gw-fail closer's predicate requires `COUNT(*) == 0` over 24h while the sweep writes
~315 rows/24h — **unsatisfiable**, a permanent ratchet.
And `ai_model_health` reports all 25 rows `ok` / `consecutive_failures=0` while 18 tickets claim
degradation, because an early `continue` in the sweep skips the degrade-marking block.

## 5. Why the same issues re-file (corrected mechanism)

The producer's dedupe is `WHERE title = ?1 AND status = 'open'`. Rows marked **`resolved`** are
invisible to that predicate, so the next run inserts a fresh duplicate instead of re-opening.
Observed: "TERMINAL research failure 51" = id 647 (closed) -> 651 (**resolved**) -> 687 (open);
"failure 45" = 636 -> 644 (**resolved**) -> 688 (open). The `resolved` status is the leak.

## 6. Three instruments that fail silently

| instrument | defect | evidence |
|---|---|---|
| `cloud_ops_events.meta` | hard clip at **exactly 600 chars**; `resultOk`/error is written AFTER args, so large-argument calls lose the only diagnostic | 856 rows at len=600, spanning 14 tool/status combos (workspace_write 388 ok, run_code 316 ok, github_file_write 270 ok, email_respond 14 error) — diverse tools and both outcomes, so a serialization clip, not a payload artifact. Smooth 450–560 distribution, no other spike. |
| `telemetry_report.open_self_heal_issues` | reports **0** while **6** are open | `issue_ledger` open + category='telemetry-self-heal' = 6; sibling `telemetry_analyze` sees the same 6 |
| self-heal loop | files -> marks resolved -> re-files forever | tickets name tools this endpoint does not bind: `parse_link`, `save_memory`, `run_command`, `update_plan`. The 600-clip table contains `save_memory` error and `update_plan` error rows — direct proof unbound tools are being called. Root cause is prompt/manifest drift. |

Also: `agent_issues.created_at` holds **two encodings** — 462 rows integer epoch-ms, 222 rows text
ISO — so `date(created_at)` silently returns 462 NULL days. And `sent_log` does not exist
(error: no such table) although the endpoint's own tool description lists it.

## 7. Alerts are being eaten

19 messages to alerts@qnfo.org classified **spam** since 09-11 (sender bounces@cf-bounce.qnfo.org):
"QNFO AI endpoint health alert" (x2), "QNFO register guard: 26 overdue / 0 no-executor",
"Loose threads - 41 item(s) need disposition", "Outreach pipeline self-check", "QNFO briefing".
The fleet's own health alerting is muted. Global spam 258/682 = 38%.
The register-guard number is **accurate**: `task_dod_register` has 99 open agent-owned rows, of which
**26 are overdue** (ids 46, 87, 143, 147, 148, 160, 188, 23, 47, 57, 67, 76 ...).

## 8. Tool failures are mostly self-inflicted (disconfirming "the tools are broken")

- `web_fetch` 224 errors / 318 ok (41%). Sampled causes: fetching `radar-hub.q08.workers.dev/health`,
  `idea-hub.q08.workers.dev/health`, `qnfo-ops.q08.workers.dev/v1/jobs/...` — the SSRF guard correctly
  blocks internal hosts. Wrong tool for the job; internal health belongs on fleet_status.
- `github_file_write` 52 errors / 218 ok (19%). Sampled: `_parseError: Unterminated string in JSON at
  position 3267 / 15840 / 16936`, ms=0 — the call never ran. The repo attributes the class to
  anchor/envelope aborts. Either way, large multi-line writes fail; this is the blocker on the deploy path.
- `ops_d1_query` 134 errors. Sampled: `no such column: tool`, `no such table: sent_log` — schema
  guessing. Fix: read `sqlite_master` first. (106 further rows are guard `rejected`, mostly no LIMIT.)

## 9. Corrections to rev 1 (my own errors)

- rev 1 said the drain "auto-closes then the rows re-file". **Wrong.** The drain closes nothing
  (§4). The re-file is caused by the `status='open'` dedupe predicate missing `resolved` rows (§5).
- rev 1 called the truncation "~500 chars". **Wrong.** The boundary is exactly 600, evidenced by a
  856-row spike at len=600 with no spike anywhere in 450–560.

## 10. Research half is stalled, not broken

- `research_candidates`: **4 rows, all created 2026-09-03/09-04.** No new candidate in 9 days.
- `intents`: 170 total, **34 stuck in `triaged`**, only 8 created since 09-07. Intake is mostly
  machine noise (chatbox-auto 94/170; 37 noise-flagged), including duplicate echoes such as
  "User message:\nPROVE THE RIEMANN HYPOTHESIS" beside the same text without the prefix.
- The most substantive item in the queue — int-d08e5100, "REVISION ROUND-2 MANDATE: numerical
  verification sprint", high priority, due 09-14, naming 4 candidates and 3 drafts — is
  **status=rejected, noise=1**, processed 150ms after creation.
- `research_queue`: 19 published (last created 09-08), 3 ensemble-draft, 2 failed, 1 pending.
- One thing that is genuinely fine: `calibration_register` 10 PENDING, **0 past due**.

## 11. ACTION PLAN (ordered by leverage)

**P0 — stop the phantom backlog before touching anything else**
1. Give `issue_ledger` an ops tool (or bind it into `backlog_status`). Until then every backlog
   reading is wrong by ~30x and the 303 rows have no remediation path.
2. Fix the `resolved` leak: dedupe on `status IN ('open','resolved')` or re-open instead of insert.

**P0 — fix the instruments before diagnosing**
3. Move `resultOk`/error to the FRONT of `cloud_ops_events.meta`, or add dedicated `ok`/`err`
   columns. Until this ships, every large-argument failure is undiagnosable by construction.
4. Fix `telemetry_report.open_self_heal_issues` — it returns 0 while 6 are open.
5. Then retry `email_respond` to message 552 once and read the real error (needs user affirmation).

**P0 — unblock the research chain**
6. Embedding tier first: fix the bge-base-en-v1.5 429 at 89/sweep (~4,300/24h) with backoff and a
   concurrency cap. This is the single largest failure source in the fleet.
7. Fix the two probe bugs: gemma-4-26b fixture 10x10 -> 16x16; qwen3.8-27b system-message position.
8. Add fallback legs to the ensemble stage so "0/3 legs" degrades to "1/3 legs" instead of terminal.
9. Replace the gw-fail unsatisfiable predicate (`COUNT(*)==0` in 24h) with a rate/trend test, and
   re-couple `ai_model_health` to it by removing the early `continue`.

**P1 — un-deafen the alerts**
10. Whitelist bounces@cf-bounce.qnfo.org / alerts@qnfo.org out of the spam classifier and re-classify
    the 19 mis-filed rows to `processed`.

**P1 — stop generating noise**
11. Stop filing "OPEN-ISSUES n" mirror tickets (532-563): ~30 rows, all bulk-closed
    2026-09-09T19:40:02.880Z. A monitor should alert, not create issues.
12. Stop advertising unbound tools (`parse_link`, `save_memory`, `run_command`, `update_plan`) in the
    prompt, or bind them. This alone retires a whole self-heal ticket class.

**P2 — hygiene**
13. Normalise `agent_issues.created_at` to one encoding; backfill the 462 epoch-ms rows.
14. Correct the tool description that lists `sent_log` (it does not exist).
15. Probe coverage: 43 workers have no health signal. Bind or drop.
16. Large file writes: chunk via workspace_write then commit. Do not attempt large
    github_file_write payloads.
17. Close the correspondence loop: Tobias Osborne, msg 552, unanswered since 2026-09-06.

## 12. Limits

- The 600 clip is established empirically (spike of 856 rows at exactly len=600, diverse tools, both
  outcomes). The writer's source line was not read.
- The gw-fail -> 0/3-legs link is a causal inference from co-occurring evidence, not a traced call
  path. Falsifier: if the ensemble legs call models absent from the gw-fail set, the link is wrong.
- `web_fetch`'s 41% is sampled (3 of 224), not exhaustively classified.
- The `issue_ledger` 303 includes rows from many producers; I did not classify all 303 individually.
- The prior session's findings in QNFO/qnfo-workers (drain no-op, unsatisfiable predicate, ledger
  invisibility) were read from the repo, not re-derived. I verified their live numbers against D1 and
  they hold; I did not re-audit their source reading.
