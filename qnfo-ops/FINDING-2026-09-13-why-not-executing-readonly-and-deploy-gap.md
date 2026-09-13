# FINDING — why ops-exec appears not to execute, and the read-cap/deploy gap

Date: 2026-09-13T14:06Z · Author: qnfo-ops / ops-exec
Subject: the user-reported claim "ops-exec is not executing server-side tool code"

## 0. The premise is false — measured, not inferred

| metric | value | source |
|---|---|---|
| tool calls / 24h | **7,131** | `telemetry_report` 14:01:35Z |
| tool failures / 24h | 630 (**8.83%**) | same |
| tool success rate | **91.17%** | computed |
| chats / 24h | 192 | same |
| chat failures | 26 (**13.54%**) | same |

Decisive evidence: **every sampled `ok=0` row in `ops_ai_log` has ALL of its tool calls
`ok:true`.** The failures are *completions*, not tool executions. Sampled rows:
07:25:54.716Z / 250,939 ms · 07:25:08.906Z / 380,770 ms · 07:23:34.354Z / 578,831 ms —
each with `"ok":true` on every tool inside.

Failure rate rises with loop length, consistent with a budget rather than a broken executor:

| loop latency | n | fail | fail % |
|---|---:|---:|---:|
| >=300s | 62 | 10 | **16.1** |
| 150-300s | 44 | 7 | 15.9 |
| 60-150s | 28 | 3 | 10.7 |
| <60s | 58 | 6 | **10.3** |

Long loops fail **1.56x** more often, but still succeed 83.9% of the time — so
`OPS_LOOP_DEADLINE_MS=300000` is a soft budget, not a hard cutoff.

## 1. "Read-only" is a declared and enforced contract, scoped narrowly

1. **Registry.** `service_discover(service="qnfo-ops")` returns verbatim for `ops_d1_query`:
   *"READ-ONLY SQL (SELECT/WITH) across the bound D1 databases."*
2. **Worker README** (`qnfo-ops/README-deploy.md`): *"ops_d1_query is strictly read-only:
   SELECT/WITH only; mutation keywords are rejected anywhere in the statement
   (audit HARD-1 2026-09-03)."*
3. **Live enforcement.** 8 of 183 `ops_ai_log` rows today carry guard-rejection markers.

Also by design: `run_code` runs on the **Dynamic Workers LOADER** binding, isolated —
*"no network, filesystem, secrets or bindings"* — because the Workers runtime disallows
request-time `eval`/`new Function`.

**"Read-only" scopes to `ops_d1_query` and `run_code` only.** It does not describe the endpoint.
`github_file_write` is a working write verb and committed to `QNFO/qnfo-workers` this session.

## 2. The four missing verbs

| verb | needed for | status |
|---|---|---|
| D1 write | `terminal_at`, `idem_key`, ticket filing/closure | **ABSENT** (HARD-1, enforced) |
| R2 write | `qnfo-canonical/*` (deploy source) | **ABSENT** (only `ops-workspace/` bound) |
| deploy | shipping `worker.js` | **ABSENT** (no route; `wrangler` CLI only) |
| network from compute | `run_code` -> HTTP | **ABSENT** (LOADER isolation) |

## 3. The deploy mechanism works — and is unreachable for this worker

From `docs/REDTEAM-EXEC-2026-09-13-remediation-executed.md`, `qnfo-fleet-deploy` v0.4.11 resolves
canonical as: R2 `qnfo-canonical/<w>.js` (if <30 min old) ->
`qnfo-workers/main/<w>/deployed-current.worker.js` -> `qnfo-ops/main/cloud/<w>/deployed-current.worker.js`
-> `worker.js`. With `fleet_deploy_state.auto_heal = "1"`, the hourly `scheduled()` scan **PUTs any
canonical that is ahead of the deployed VERSION.**

> **Editing `worker.js` does nothing; writing `deployed-current.worker.js` IS the deploy trigger.**

Verified working 3x today in `fleet_deploys` (actor `deploy`, `ok=1`): `qnfo-backlog-exec`
1.2.6 -> 1.2.7 @08:01:43 · `qnfo-social` 0.5.2-checker-heal -> 0.5.3-failclosed @07:04:34 ·
`ai-health-prober` 2.3.1 -> 2.3.3 @07:00:53.

**No `fleet_deploys` row exists for `qnfo-ops`.** Its modifications today (13:50:43Z;
`modified_on` 14:00:14.377489Z) came from an actor outside the fleet deploy loop. Repo canonical
VERSION is **2.15.6** while the registry reports **2.15.7** — deployed is ahead of its own repo.

## 4. Root blocker: the write surface is wider than the verification surface

| | |
|---|---|
| `qnfo-ops/worker.js` | **182,623 B** |
| `github_repo_read` cap | **32,768 chars** |
| overage | **5.57x** |
| `github_file_write` | requires **full** content in one call |
| offset / range parameter | **none** |

This endpoint **cannot read its own source past the first 32,768 characters and cannot write it at
all.** No degree of autonomy changes this; self-upgrade is architecturally impossible here.

### Deployability matrix

| worker | bytes | under cap | over by | blocker |
|---|---:|---|---:|---|
| qnfo-ops | 182,623 | no | 149,855 | 6 patches staged, unshippable |
| qnfo-cloud-ops | 129,467 | no | 96,699 | hourly SyntaxError, 25/25 failed |
| personal-companion | 62,666 | no | 29,898 | hourly failed downgrade |
| qnfo-ai-calibration | 33,551 | **no** | **783** | misses cap by 783 B |
| research-daily-brief | 13,740 | yes | 0 | stale-canon self-seal |
| qnfo-twin-maintain | 5,211 | yes | 0 | stale-canon self-seal |
| osf-integrity-check | 3,479 | yes | 0 | stale-canon self-seal |
| obsidian-writer | 1,193 | yes | 0 | stale-canon self-seal |

The four under-cap workers are **writable** but not **safe to write**: a canonical written ahead of
the deployed VERSION is PUT to production by the hourly scan, and the live source of those four
cannot be read from this endpoint to confirm the repo canonical still matches it. Writing a stale
canonical downgrades a running worker — the hazard already proven for `personal-companion`
(`v1.1.0` vs `1.0.0`) and `qnfo-ai-calibration` (`deployed-ahead`).

Counter-evidence to the "canonical mirrors production" assumption: `qnfo-ops/deployed-current.worker.js`
has the same blob sha as `worker.js` (VERSION 2.15.6) while production is 2.15.7. The mirror is one
version stale for the endpoint itself, so the property cannot be assumed for others.

## 5. D17 is doubly blocked

The D17 fix needs BOTH a D1 write (`ALTER TABLE ops_jobs ADD COLUMN terminal_at TEXT;` — guard
rejects) AND a worker change (deploy — blocked). Live schema confirms neither shipped: `ops_jobs`
has exactly 10 columns (`id, status, model, strategy, payload, response, tool_log, error,
created_at, updated_at`) and is missing **all four** staged columns — `terminal_at`, `idem_key`,
`parent_id`, `chain_depth`.

Live state: 121 jobs — 96 succeeded, 12 continuing, 8 failed, 5 running; **17 non-terminal (14.0%)**.

## 6. Deliberately not done

**No speculative patch applier was authored.** The repo pattern
(`scripts/hotfix-code-gate-classifier.mjs`) is a fail-closed `.mjs` applier asserting
`split(OLD).length - 1 === 1`. But `patches/2026-09-13-AUDIT-AND-FIX-consolidated.md` supplies only
the **NEW** code for D17/D19/D20/D21 and never quotes the exact **OLD** anchor. The current
response-only write sits past the 32,768-char read cap, so the anchor text is unreadable from the
only tool that can write. An applier built on guessed anchors could match at the wrong site —
worse than no applier.

**No unattended production deploy was fired** for the four under-cap workers, for the reason in §4.

## 7. Limits

- The 24h failure rate is endpoint-wide; `ops_d1_query` is 2nd worst (171 failures) but its own
  denominator is not exposed, so its per-call rate is unknown.
- The `ok=0` / long-loop correlation is association, not cause. No stack is captured on failure.
- The canonical resolution order is read from a doc, not from `qnfo-fleet-control` 0.4.11 source
  (unreadable past the cap).
- The four under-cap workers are classified *writable*, not *safe-to-write*; only the first is
  established.
