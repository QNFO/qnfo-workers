# Closeout — fleet-wide error audit and remediation, 2026-10-17

Session: `session-chatbox-20261017` · Wallet: quniverse · Scope: whole estate (29 workers, 190 repos)
Closeout because the owner asked for all remaining work to live server-side, not in a chat thread.

## Claim sheet

Each claim lists the evidence that supports it. Anything I could not verify is marked as such.

| Claim | Evidence | Status |
|:--|:--|:--|
| GitHub App broker was dead; now mints | `qnfo-fleet-control` 0.33.0 `ghAppKeyDer` wraps PKCS#1 in PKCS#8; `GET /gh-app` → `gh_app: ok`; `github_app_token_ok=1` | HOLDS |
| GitHub estate reconciled to declared state | `qnfo-github-steward` 0.1.2, cron `17 */6 * * *`; runs converge 0 drift / 0 errors over 61 active repos | HOLDS |
| Org hardening applied | `default_repository_permission=read`, workflow token `read`, `can_approve_pr_reviews=false` (read back from the API) | HOLDS |
| 55/61 default branches protected | 6 private repos refused with `403 Upgrade to GitHub Pro` | HOLDS, ceiling |
| Gateway 429s were one account condition, not model faults | 415/24h all `429 "Spend limited"`; fleet's own spend $0.53/day vs `ai_spend_owner_local` $55.02/day from an external `node` client | HOLDS |
| A degraded model had been pinned 23 days | `deepseek/deepseek-v4-flash` `degraded`, `consecutive_failures=0`, probe 2026-09-24; cleared by `AMH-RECONCILE-SPEND-1` at the 15:00:34Z tick | HOLDS |
| `RECONCILE-READ-1` resolved | fix live in `0.18.19-revise-flex` (worker.js 3410-3425); 0 rows carry the new unreadable message; the 2 affected rows published; 148 papers in 10 days, newest 14:31Z | HOLDS |
| `ops_d_query` loop breaker was a false positive | `logToolEvent` (qnfo-ops 4990-4997) puts the tool NAME in `text` and the error in `meta.error`; the view grouped on `text`, collapsing 3 distinct errors. View rebuilt on `text \|\| json_extract(meta,'$.error')`; signature gone | HOLDS |
| The completeness sweep stopped failing | 96 occurrences, **0 since 14:41:36Z** (fleet's idempotency fix) | HOLDS |
| `reading.q08.org` stall is a convergence defect, **not** budget | `companion_runs` 15:05-15:10Z shows live fact-prune r1→r4 each deleting 6-9 sentences; 1,767 `stage` / 243 `rejected` / 3 `ok` in 48h; last publish 2026-10-15T12:10Z | HOLDS — corrected from an earlier budget-only claim |
| My own worker had BP debt | issue 2757: constant-time key compare + declared traces; fixed and verified 401/401/200 | HOLDS |

## Deployments made this session

| Target | Change | Verified by |
|:--|:--|:--|
| `qnfo-fleet-control` 0.33.0 | PKCS#1→PKCS#8 App key conversion | `/gh-app` ok, metric 1 |
| `qnfo-github-steward` 0.1.1 → 0.1.2 | reconcile loop; then const-time key + traces | 0 drift; 401/401/200 |
| `qnfo-ai-calibration` 1.5.3 | `AMH-RECONCILE-SPEND-1` | stuck row cleared at 15:00:34Z |
| `QNFO/.github` workflows | permissions repaired, concurrency/timeout, gate scheduled | YAML re-parsed; gate re-read `17 5 * * 1` |
| `qnfo-audit.v_loop_breaker_signatures` | signature now carries the error | `ops_d_query` collapsed signature disappeared |

## Remaining work — routed, not left dangling

**Fleet-actionable (no owner input needed).** The fleet's own loops already own these; they are
open with next actions recorded in `agent_issues`.

1. **2779 `SIGNAL-SQL-ARITY-1`** — 25 × `D1_ERROR: Wrong number of parameter bindings` in
   q08-signal-engine, last 13:07Z. Definition of done is already written: log the first 160 chars
   of SQL plus the bound-parameter count on that error class, let one occurrence name the statement,
   fix it, then confirm the signature is absent for 24 h.
2. **2669 `COMPANION-PUBLISH-STALL-AUTO-1` (critical)** — the fact-prune cycle does not converge
   (`r1`→`r4`, sentences removed each round, never passes). Needs a round ceiling that degrades to
   "publish the best surviving draft" instead of looping, or a prune budget that fails closed.
3. **2748 `Q08-GATE-CONTRACT-1`** — misdiagnosed as a quality problem; re-read it against 2669
   before changing any gate threshold.
4. **2780 `GW-PAPER-CONTEXT-THROW-1`**, **2755 binding-census**, **2726 `PATH-CLAIM-CEILING-1`**,
   **2116 prompt-cache**, **2694 `ask_p95`** — all have a named defect and a repo path.
5. **2507 / 2508 GHA audit** — the workflow work I did touches these two directly; re-run
   `scripts/workflow-lint.py` before closing either.

**Owner decision required (the fleet cannot settle these).**

1. **2750 / 2778 / 2731 — AI budget.** The fleet spends $0.53/day; an external `node` client spends
   $55.02/day on Anthropic and trips both caps (gateway `$600/30d`, Workers AI `$150`). Options:
   rotate the gateway auth token so the stale client fails, or fund more credit. I did not spend
   money or revoke a credential on the owner's behalf.
2. **2751 `SECRET-CHANGE-OBSERVED: radar-hub`** — a security signal; review before dismissing.
3. **2757-adjacent BP debt** for other workers is routine; no decision needed.

**Known ceilings — no action possible.**

* 6 private repos cannot get branch protection or auto-merge on the free plan.
* `two_factor_requirement_enabled` returns HTTP 200 from `PATCH /orgs/QNFO` and applies nothing.
* `qnfo-fleet` App cannot be granted `administration`, so repo/org settings keep needing the PAT.

## State at close

```
workers        29/29 healthy            open issues  148 (1 crit, 21 high, 111 med, 15 low)
models         0 degraded               loop-breaker 3 signatures, top one stale since 14:41Z
github         61/61 repos in declared state, 55/61 protected, app token ok
```
