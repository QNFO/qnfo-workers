# QNFO/QWAV Full-Stack Integration Plan — 2026-09-13

Author: qnfo-ops / ops-exec. Companion to `docs/INTEGRATION-DEFECTS-2026-09-13.md` (D1–D17).
Every figure is a live tool return from this session (2026-09-13, reads 13:22–13:30Z).
Term caveat stands: "Quniverse" resolves to no entity in any bound store; the subject is
the QNFO/QWAV fleet (55 deployed workers, 8 D1, 5 Vectorize, 4 R2, 1 KV).

## 0. Verified live state (this session)

| probe | live return |
|---|---|
| `fleet_status` | 55 deployed / **12 binding-probed healthy** / 43 `healthy:null` (unprobed, not down); ts 13:22:56Z |
| `backlog_status` | `{"healthy":true,"http":200,"version":"1.2.7","openBacklog":12}` |
| `agent_issues` by status | closed 318 / wontfix 258 / resolved 96 / **open 12** |
| `issue_ledger` | 325 rows — **open 303** / resolved 21 / acknowledged 1 |
| `ops_jobs` by status | succeeded 40 / **continuing 28** / failed 8 / running 4 |
| `idea_proposals` | **496 new** / 47 hold / 14 accepted / 1 registered |
| `integration_state` | 32 rows, newest **2026-09-11T14:17:37Z** (~71 h stale) |
| `fleet_drift_report` | 1,689 rows / 62 workers / 09-08 16:09Z → 09-13 13:03:53Z |
| `report_card_history` | 1 row, `sai=NULL`, `grade=NULL`; columns = id,ts,sai,grade,scores_json,signals_json (**no `source`**) |
| `self_heal_actions` | healed 528 / **deferred 445** / detected 170 / resolved 130 / failed 50 / dispatched 35 / executed 10 / no-action 4 |

**The scan ledger is the single most informative line in the fleet:**
`cron: scanned=55 clean=33 drifted=8 ahead=10 healed=0 errors` at **13:03:53Z**, and
`healed=0` on the 12:02:52Z scan as well. The detector runs hourly and classifies
correctly; the actuator closes nothing.

## W1 — ACTUATOR: the heal gate is the binding constraint (D4 + D8) — highest leverage

The 8 `canonical-ahead` rows at 13:03Z, split by *why* the healer cannot act:

**(a) 7 blocked by a non-semver live `VERSION` — the comparator cannot order them.**

| worker | deployed_version (live) | canonical_version | source_path |
|---|---|---|---|
| qnfo-archive | `qnfo-archive/fabric-20260910` | `1.2.0+cors-fixed` | `…/deployed-current.worker.js` |
| qnfo-ddocs-indexer | `qnfo-ddocs-indexer/fabric-20260910` | `1.0.0+server-side` | `…/deployed-current.worker.js` |
| qnfo-email | `qnfo-email/fabric-20260910` | `0.3.4-glm53` | `…/deployed-current.worker.js` |
| qnfo-lifecycle | `qnfo-lifecycle/fabric-20260910` | `1.6.1-memory-maintain-fixed` | `…/deployed-current.worker.js` |
| qnfo-paper-indexer | `qnfo-paper-indexer/fabric-20260910` | `2.2.0+scheduled-daily` | `…/deployed-current.worker.js` |
| qnfo-qwav | `qnfo-qwav/fabric-20260910` | `2.1.0` | `…/deployed-current.worker.js` |
| qnfo-agent-orchestrator | `qnfo-agent-orchestrator/fabric-20260910` | `v1.0.0` | `…/agent-orchestrator/deployed-current.worker.js` |

These are exactly the `fabric-20260910` live tags. Counter-evidence that the *code* is fine:
every heal that succeeded today had a semver live version — `qnfo-social`
0.5.2-checker-heal → 0.5.3-failclosed (07:04:34Z), `ai-health-prober` 2.3.1 → 2.3.3
(07:00:53Z), `qnfo-backlog-exec` 1.2.6 → 1.2.7 (08:01:43Z). The deploy path works; the
*comparison* does not. This makes F12 (`non-semver VERSION`, filed as `severity: low`) a
**causal** defect, not a style violation.

**Action:** in the deployer's drift comparator, treat `canonical !== deployed` as
heal-worthy when the canonical parses as semver, regardless of the deployed string's
format, behind a per-worker allowlist; and stop emitting non-semver `VERSION` constants
(the `fabric-*` tag belongs in a comment, not in `VERSION`).
**Acceptance:** next hourly scan reports `healed ≥ 1` and the `drifted` set shrinks below 8.

**(b) 1 blocked at upload time — `personal-companion`.**

`deployed_version v1.1.0` vs `canonical_version 1.0.0`; the healer attempts the deploy
hourly and fails hourly (`fleet_deploys`: ok=0 at 08:01:23, 09:01:23, 10:01:24, 11:01:23,
12:01:24, **13:01:23Z**) with `HTTP 400 code 10021 — Workflow GenerationFlow must be
exported or a script_name must be specified`.

Two file-level findings that **falsify the obvious fix**:
1. `personal-companion/worker.js` and `personal-companion/deployed-current.worker.js` are
   **byte-identical** — 62,666 B, sha `c06edffb22f3cefeed2d7568e1a7275f076320cc`, both
   `VERSION = "1.0.0"`. There is **no shadow to unshadow**; the shadow-copy class of fix
   (which did work for `qnfo-pipeline-ops`) does not apply here.
2. `personal-companion/wrangler.toml` (393 B) declares **no `[workflows]` block at all** —
   only `[ai]`, `[[services]] EMAIL`, `[[r2_buckets]] MEDIA`, `[[d1_databases]] PERSONAL`.
   So the workflow binding the API is validating against comes from the *deployer's*
   per-worker config, not from this file.

**Action (requires the deployer):** either drop the `GenerationFlow` binding for
`personal-companion` from the deploy config, or commit an artifact that exports it. The
repo currently holds only `1.0.0`, while live is `v1.1.0` — so the repo is *behind* live and
the healer is trying to **downgrade**. Second action: make the healer refuse a downgrade
when the canonical is older than live (currently it attempts one every hour).

## W2 — Unify the issue ledgers (D14, violates A3)

`agent_issues` open **12** (what every ops tool reports) vs `issue_ledger` open **303**.
Ratio ≈ 25×. Ops-sourced backlog figures are structurally wrong, and the drain cannot see
the 303. Staged DDL + view in `sql/APPLY-QUEUE-2026-09-13.sql` §1.
**Acceptance:** `backlog_status` and `ops_issues_list` both report ≥ 303, or the ops read
path explicitly names which store it counts.

## W3 — Restore the SAI time series (D16)

`report_card_history` = 1 row with `sai`/`grade` NULL; columns lack `source`, which is the
exact string in `fleet_runs` id=111's failure (`table report_card_history has no column
named source`). The trigger value is therefore smuggled into `signals_json`. Staged in
`sql/APPLY-QUEUE-2026-09-13.sql` §2 (add column + backfill from `signals_json`).
**Acceptance:** the weekly `report-card` run writes a row with non-NULL `sai`.

## W4 — Probe coverage 12/55 → 55/55 (D1), and registry contract fields (D8)

43 workers are `healthy:null`. That is *unprobed*, not *down* — no outage claim is
supported by these rows. Extend probes via **service bindings**, not public hostnames
(same-account Worker→`workers.dev` returns 404 by edge artifact; `*.qnfo.org` returns 530).
Add the 4 missing Worker-Contract registry fields: `health_url`, `owner`,
`autonomy_level`, `crons`.
**Acceptance:** `fleet_status` reports `healthyCount ≥ 50`.

## W5 — Make `ops_jobs` reach a terminal state (D17)

28 rows sit in `continuing` (40 succeeded / 8 failed / 4 running). Terminal status must be
written in the same statement as `response`; add `terminal_at`; add a reaper. Staged as a
report-first, guarded statement in `sql/APPLY-QUEUE-2026-09-13.sql` §3 — the worker-side
atomic write is preferred over the data fix.

## W6 — Un-freeze `integration_state` (D5)

32 rows, newest 2026-09-11T14:17:37Z, writer `qnfo-observability` on `*/15` → ~284 missed
cycles. Also `fleet_size` is mis-sized (80 vs 55 live).

## W7 — Drain intake before adding intake (D6)

`idea_proposals` 496 `new` (all `ip_hash='l8-reentry'`), triage last acted 2026-09-11.
110 of 262 `signals` carry an empty open-question set `U` → ε=0 by the organism's own rule,
i.e. structurally inert, not stalled. Fix the triage cadence before the L8 re-entry loop
adds more.

## W8 — Gateway capacity (D10) — largest live reliability signal

Live from the drain's own recheck notes (13:2xZ, 24 h window): `@cf/baai/bge-base-en-v1.5`
**3,638**, `@cf/qwen/qwen2.5-coder-32b-instruct` **1,974**, `@cf/qwen/qwen3.8-27b` **842**,
`@cf/moonshotai/kimi-k2.6` 282, `@cf/moonshotai/kimi-k2.7-code` 94, `@cf/zai-org/glm-5.2` 93,
`@cf/google/gemma-4-26b-a4b-it` 46. The embedding tier dominates; the `[gw-fail]` 24 h
auto-close predicate is **structurally unsatisfiable** (append-only at ~48 sweeps/day, ~48
rows/model/day), so those tickets can never self-close. Fix the predicate (compare against
the sweep's own `lastTs`), then the capacity.

## W9 — One autonomy/kill-switch evaluator (D7)

State is split across `governance_kernel.autonomy_boundary`, `fleet_deploy_state`
(`enabled=1`, `auto_heal=1`), and `autonomy_scores`, with no single evaluator consulted
before an L5 action. This is why W1(b)'s unbounded hourly retry is possible. Note the
kernel is **live and blocking** (`gov_gate_log`: 2 × BLOCK on `qnfo-research-exec`,
2026-09-11) — the defect is fragmentation and infrequent exercise (3 log rows ever), not
absence.

## 1. What this session executed

- `fleet_status`, `backlog_status`, `ops_issues_list`, `ops_d1_query` (21 reads across
  `agent_issues`, `issue_ledger`, `ops_jobs`, `idea_proposals`, `integration_state`,
  `report_card_history`, `fleet_drift_report`, `fleet_deploys`, `self_heal_actions`,
  `fleet_deploy_state`, `sqlite_master`, `pragma_table_info` ×6), `workspace_read` ×8,
  `workspace_list` ×2, `github_repo_read` ×13, `ops_issue_run(confirm:true)`.
- Drain result (live): `processed 11, closed 1, rechecked 10, noiseClosed 1, escalated 0`.
  The 10 rechecked are the `[gw-fail]` rows and the drain's own note on each is
  *"gateway failures CURRENT: N/24h — real defect, root fix pending"* — i.e. the drain
  correctly refuses to close real defects. This is W8, quantified by the drain itself.
- This document + `sql/APPLY-QUEUE-2026-09-13.sql` committed to canon.
- Workspace mirror: `ops-workspace/audits/2026-09-13-integration-plan-and-execution.md`.

## 2. Blocked, with the exact reason

| item | blocker |
|---|---|
| W1(a) comparator fix | `qnfo-fleet-control/worker.js` is **75,875 B** against a **32,768-char** `github_repo_read` cap → the heal gate cannot be read, therefore cannot be reproduced byte-exact for a write. |
| W1(b) personal-companion | canonical artifact is **62,666 B** → same cap. And it is already identical to `worker.js`, so there is nothing to unshadow. |
| W2, W3, W5 (apply) | `ops_d1_query` is SELECT-only. **No D1 write path on qnfo-ops.** Staged as SQL instead. |
| W4 | No tool can probe the 43 unbound workers; `web_fetch` hits the same-account edge 404. |
| W8, W9 | Worker source (`qnfo-ai` 5.25.1, deployer) is over the read cap; no deploy tool. |
| Any deploy | **No deploy tool on qnfo-ops.** Every source fix here is staged, not shipped. |

## 3. Honest limits and counter-arguments

- **The W1(a) root cause is a hypothesis, not a read.** It is inferred from the correlation
  "non-semver live version → never healed" plus the fact that the heal gate is unreadable at
  75,875 B. The falsifier I could not run: reading `canonical()`/`drift()`/`redeploy()`.
- **The scan row is self-reported** by the healer (`note: "cron: scanned=55 …"`). `healed=0`
  is its own claim. It is corroborated independently by `fleet_deploys` (no ok=1 row for any
  of the 8) and by `fleet_drift_report` (the same 8 repeated hourly).
- **`issue_ledger` inflates itself.** Its rows include this endpoint's own confirm-gate
  refusals swept as errors. 303 open is a real count of *rows*, not 303 real defects.
- **`agent_issues.created_at` mixes epoch INTEGER and ISO TEXT** — cross-row time ordering
  in that table is unreliable.
- **Point-in-time.** `issue_ledger` moved 270 → 305 → 303 within one day; the scan reruns
  hourly and re-classifies.
- **Strongest counter-argument:** the fleet is partially instrumented, not broken.
  `qnfo-social`, `ai-health-prober` and `qnfo-backlog-exec` all healed today; `qnfo-cloud-ops`
  **stopped** failing after the 404-tombstone landed (last failed attempt 07:02:38Z, absent
  from the 08:00–13:03 scans). Three of the four named loops are already closed. The
  remaining gap is one comparator rule and one upload binding.
- **Correction carried:** `qnfo-cloud-ops`'s loop is no longer live. Its
  `deployed-current.worker.js` is now a 1,605 B resolver-honoured tombstone (sha
  `a8dfe8ba29ce4367730c7826d2311b5e2c2a9798`) and `worker.js` resolves as canonical
  (129,457 B, sha `59dd468d83ec5f176b63abacdbd113951d0fe922`).
