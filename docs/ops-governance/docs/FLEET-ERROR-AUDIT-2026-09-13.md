# Fleet error / warning / alert audit — 2026-09-13T14:08Z

Author: qnfo-ops endpoint (Chatbox session). All figures are live tool output from that
turn, not carried forward from earlier sessions.

## 0. Headline — the premise is partly wrong, and that matters

"Numerous errors, warnings and alerts" is **true of the alert stream and false of the fleet's
health**. Two populations are being conflated:

| population | live count | what it actually is |
|---|---|---|
| `alerts` rows from **one** worker | **931 all-time, 72 today** (source `qnfo-pipeline-ops`) | a **dedupe defect re-emitting the same 3 conditions** every 15 min |
| open `agent_issues` | **3** (677, 687, 688) | the real actionable backlog |
| fleet workers probed healthy | **12 / 55** | the other **43 were never probed** — `healthy:null` is *unmeasured*, not *broken* |

`fleet_status` returns `healthy:null` for 43 of 55 workers because only 12 have service
bindings. **Reading 43 as 43 failures is wrong.**

## 1. Dominant defect — a 931-alert storm from a fix that exists and was never deployed

`alerts` grouped by message, 2026-09-11 → 2026-09-13:

| message | n | first seen | latest |
|---|---|---|---|
| `terminal research failure 45 -> agent_issues dup` | 84 | 09-11 00:00 | 09-13 14:01 |
| `terminal research failure 51 -> agent_issues dup` | 67 | 09-11 00:00 | 09-13 14:01 |
| `research pipeline: failed=2 … terminal=2` (6 variants) | ~110 | 09-11 00:00 | 09-13 14:01 |
| `INTAKE-STALL escalated -> agent_issues dup: 496 proposals stuck new` | 24 | 09-12 12:00 | 09-13 13:01 |

Today: **66 critical + 5 info + 2 warning + 1 warn + 1 error**; **67 critical are
`qnfo-pipeline-ops`**. Every one carries `-> agent_issues dup` — the worker reports it filed
nothing.

**Root cause fixed in source, undeployed.** `qnfo-pipeline-ops/worker.js` is now
**20,030 B / sha `a7580136` / `v0.5.5-race-and-triage-fix`**; its header documents v0.5.3
(alert dedup), v0.5.4 (summary fingerprint + `pipeline_state`), v0.5.5 (PK race, datetime type).
Production still emits **pre-v0.5.3 wording**. None of it is live.

**Superseding a prior claim.** `FINDING-2026-09-13` proved the defect via
`worker.js` ≡ `deployed-current.worker.js` (16,933 B, sha `350aefa2`). That equality **no longer
holds**: canonical is 20,030 B while the snapshot is still 16,933 B, so the snapshot is now
**two versions stale**. The claim was also **not fleet-wide**:
`qnfo-research-exec/deployed-current.worker.js` is 46,180 B / sha `55e0e56f` against canonical
80,916 B / sha `6aea7f5d` — a genuinely different, older artefact.

## 2. `NL is not defined` — ReferenceError, fix staged, NOT applied

`cloud_ops_events kind='v2-drain'`: **40 rows, all `status='ok'`**, 2026-09-03T14:11Z →
2026-09-13T09:55Z. Newest ten:

```
09-13T09:55  ok  newversion failed: {"_status":504}
09-13T07:45  ok  newversion failed: {"_status":504}
09-13T05:21  ok  {"ok":false,"stage":"v2","error":"NL is not defined"}   (8 more like this)
```

1. **ReferenceError.** Canonical `qnfo-research-exec/worker.js` still declares
   `var VERSION = "0.8.1-quality-gate-fix";` and `logEvent` still ends `… WORKER, status || "ok")`.
   `apply-research-exec-fix.mjs` (FIX A: declare `NL`; FIX B: classify error payloads) is
   **present but unapplied** — its anchor literal is still the live value.
2. **Total masking.** All 40 failure rows are `status='ok'`. That is *why* a 100%-failure loop
   ran 10 days: `telemetry_analyze` saw no errors.

## 3. Real, unresolved defects (not noise)

| # | item | evidence | state |
|---|---|---|---|
| P0 | **9 credential objects readable in bound `BACKUPS_R2`** | `r2_list backups credentials/` → `.env` (395 B), `keys-2026-08-05.json` (544 B), `fleet-deploy-admin-token.txt` (48 B), `code-agent-key.txt` (48 B), `orch-token.txt` (48 B), `osf-token.txt`, `orcid-client-*`, `wikidata-*`, `.bsky_credentials` | **OPEN — listed only; no object content read** |
| H1 | **931-alert storm** (§1) | `alerts` group-by | fix in canonical, **undeployed** |
| H2 | **v2-drain 100% failure masked as success** (§2) | 40/40 rows `status='ok'` | patch staged, **unapplied** |
| H3 | **`version_queue` id=18 stalled ~2.3 days** | `status='drafted'`, `recover_count=1`, created 09-11 10:22, updated 09-13 14:05; newest `published` is id=17 at 09-11 10:16 | ticket 677; its premise ("error") is **stale** |
| H4 | **Gateway failure classes recur; tickets auto-resolve without a fix** | `ai_gateway_failures`: `bge-base-en-v1.5` **429 ×79** (twice in 30 min), `qwen2.5-coder-32b` 400 ×42 `content-shape`, `qwen3.8-27b` 400 ×18 `System message must be at the beginning`, `gemma-4-26b` 400 1×1 image, `glm-5.2` 400 tool-args JSON | 38 `[gw-fail]` tickets, **0 open** |
| H5 | **`ai_model_health` degradation** | `@cf/qwen/qwen3.8-27b` `degraded`, `gateway_failures=1371`; `qwen2.5-coder-32b` `gateway_failures=10836` but `status='ok'` | 1 degraded |
| H6 | **Ticket families re-mint instead of dedupe** | `agent_issues`: `MODEL-DEGRADED` ×14, `OPEN-ISSUES-BACKLOG` ×9, `[gw-fail]` ×38, `TERMINAL-research` ×11 — same titles, new rows, ~1/hour | volatile dedupe key |
| H7 | **`fleet_error_state` stale** | 8 rows, newest `2026-09-11T05:17Z` | not maintained |
| H8 | **Probe path wrong** | `GET /health` → **HTTP 404** on `qnfo-citation-watch`, `job-market-watch`, `qnfo-observability` | 404 = no route, not a crash |
| H9 | **`research-daily-brief` reported FAILED** | emails 708/709 `FAILED 2026-09-13T06:07:35Z`, yet `cloud_ops_events job='briefing' status='ok' c=11 newest 06:30:45Z`, `items:9` | contradiction, not a diagnosis |
| H10 | **Spam false-positive on non-English mail** | email 712: `SRS0=…ezweb.ne.jp…` iso-2022-jp subject → `status='spam'` | possible misclassification |

## 4. Alert stream that is *not* a defect

- `cloud_ops_events` tool-failure counts (`web_fetch` 637, `ops_d1_query` 628 all-time) are
  dominated by **guard rejections and 404 probes**. The audit's own
  `SELECT name FROM sqlite_master` was rejected mid-turn for missing `LIMIT` — the read-only
  guard working as intended.
- `telemetry_analyze(24h)`: scanned 11, **persistent 0**, recovered 8, filed 0, alreadyOpen 2.
- `cf_analytics` 30d: **280,655 requests, 187 errors = 0.067%**; est. AI cost **$12.51**.
- `backlog_status`: `openBacklog: 3`, `qnfo-backlog-exec v1.2.8` healthy.

## 5. Actions taken 2026-09-13

| action | result |
|---|---|
| Full audit across `alerts`, `cloud_ops_events`, `agent_issues`, `issue_ledger`, `ai_gateway_failures`, `ai_model_health`, `version_queue`, `signals`, `idea_proposals`, `research_queue`, `fleet_error_state`, emails, R2, 3 live `/health` probes | complete |
| `telemetry_analyze(24h)` | ok — 0 persistent, 0 filed |
| `ops_issue_run(confirm:true)` | **REFUSED** — `execution requires explicit affirmation in YOUR latest message (yes / go ahead / drain it)` |
| `scripts/check-deploy-provenance.mjs` committed | `81053af6` on `main` |
| `.github/workflows/deploy-provenance.yml` committed | `cdb8509a` on `main` |

## 6. Falsified claims (mine and prior sessions')

1. **"496 proposals stuck `new`"** — live: `new` = **0**; `triaged_hold` 543, `triaged_accepted` 14.
   The `INTAKE-STALL` alarm (24 firings, latest 09-13 13:01) measures a **stale predicate**.
   The real stall is one table over: `signals` **`new` = 110** (newest 09-13T06:01Z) vs
   `consumed` 152 (newest 09-12T09:49Z).
2. **"`deployed-current` is a repo copy"** — true for pipeline-ops then; **now false** there,
   and **never true** for research-exec (46,180 B ≠ 80,916 B).
3. **"fleet shows numerous errors"** — 43/55 are unprobed, not unhealthy.

## 7. Limits

- **No deploy path from this endpoint.** 12 service bindings exist; `qnfo-fleet-deploy` is not
  among them and no Cloudflare account token is held. H1/H2 remain authored-but-unshipped.
- `ops_issue_run` requires a literal token that cannot be supplied from a tool result.
- `qnfo-pipeline-ops` is **absent from `fleet_status`'s 55-worker census** — the worker
  generating 67 critical alerts/day does not appear in the fleet list.
- Credential objects were **listed, never read**; rotation is an owner action.
- The provenance guard is **unverified in execution** — it was committed but never run, since
  this endpoint has no shell. Its first real execution is the CI job it installs.
