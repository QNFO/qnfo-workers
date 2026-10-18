# TEMPO-POLICY-120M-5M-1 — the 120-minute cap and the 5-minute tick

**Owner directive, 2026-10-18:**

> ACCELERATE ALL TIMELINES, SLAS, CRON SCHEDULES AND ANY/ALL TIME-RELATED METRICS TO MOVE
> MORE ISSUES AND MORE CONTENT THROUGH PIPELINES. NO TIME-RELATED METRIC OR SCHEDULE SHALL
> EVER EXCEED 120 MINUTES, AND HEARTBEAT/TICK TIME/TEMPO SHALL INCREASE TO A MAXIMUM OF ONCE
> EVERY 5 MINUTES. IMPLEMENT SYSTEMWIDE ACROSS CLOUDFLARE QUNIVERSE FLEET AND GITHUB, ETC.

This supersedes the 10-minute floor for the heartbeat only. It does not repeal
`CRON-RATE-CEILING-1` for producers: a producer cron still may not fire more often than every
10 minutes (144/24h), because a finer producer cron multiplies AI/neuron spend, D1 writes and
rate-limit exposure with no diagnostic gain.

## 1. The two rules

| rule | scope | enforced by |
| --- | --- | --- |
| **≤ 120 min** | every time-related metric and schedule: SLAs, queue SLAs, cadence registries, metric refresh, producer cron triggers, fleet job triggers, GitHub workflow crons | `v_tempo_violations` / `v_tempo_cron_violations` (D1), `cron_rate_guard.py` TEMPO list, this doc's §4 |
| **≤ 5 min** | the heartbeat/tick: the task dispatcher and the fleet's fast lane | `cron_rate_guard.py` `HEARTBEAT_WORKERS` (a heartbeat worker with no trigger at 5-minute tempo FAILS the deploy gate) |

## 2. What is a heartbeat and what is a producer

A **heartbeat** is the loop that decides what to do next. This fleet has three:

| worker | role | trigger |
| --- | --- | --- |
| `fleet-exec` | reads `fleet_crons`, dispatches every due job to the executor | `*/5 * * * *` (was `*/10`) |
| `qnfo-fleet-control` | fast lane: code merges, PR opening, branch lane, deploy-drift runner, SLA tick, remediation contracts | `*/5 * * * *` (was `*/10`) |
| `qnfo-code-orchestrator` | the code loop | `* * * * *` (owner override 2026-10-17) |

Everything else is a **producer**: it does one job on its own period. Producers must sit
between 10 and 120 minutes.

Retiming `fleet-exec` changes *latency*, not job frequency: each `fleet_crons` row still fires
on its own `cron_expr`, so a job due at `:00` now starts by `:05` instead of `:10`.

Retiming `qnfo-fleet-control` does change frequency — that is the point: merges, remediation
and SLA measurement run twice as often. The 20-minute steps (journeys, research backpressure,
metric refresher, PDF relay, advisor) stay on a **true 20-minute grid** (`slotMin % 20 < 5` ⇒
`:00`, `:20`, `:40`). The previous `Math.floor(slotMin / 10) % 2 === 0` was a 10-minute-period
test; on a `*/5` trigger it would have fired those steps six times an hour.

## 3. D1 time metrics normalised (2026-10-18)

Applied in `qnfo-audit` with table copies `bak_20261018_tempo_*`:

| table | change | rows |
| --- | --- | --- |
| `fleet_crons` | daily/weekly/4h/6h triggers → `0 */2 * * *` | 9 |
| `process_cadence` | `cadence_min` and `sla_min` clamped to 120 | 32 |
| `cadence_sla` | `interval_min` / `sla_min` clamped to 120 (weekly newsletter surface included) | 7 |
| `metric_registry` | `refresh_cadence` daily / weekly / 6h / 24h / `*/3h` → `2h` | 41 |
| `sla_registry` | windows ≤ 120m; the three 24h-worded metrics re-worded to 120m | 4 |

`queue_sla` was already compliant (highest `sla_min` = 120).

`tempo_policy` holds the directive itself; `v_tempo_violations` and
`v_tempo_cron_violations` are the live ledgers. Both returned 0 rows after the migration.

## 4. Producer backlog (visible, tracked — not silently ignored)

`cron_rate_guard.py` prints a `TEMPO` line for every producer cron still above 120 minutes.
At the 2026-10-18 sweep there were **50 expressions across 33 workers** (daily, weekly and
monthly triggers). They are not all equal:

- **Migratable now** (idempotent probes, drains, syncs): `qnfo-archive`, `qnfo-autonomy-scorer`,
  `qnfo-backlog-exec`, `qnfo-paper-indexer`, `qnfo-paper-reviser`, `qnfo-skill-sync`,
  `qnfo-twin-maintain`, `qnfo-register-guard`, `qnfo-fleet-feed`, `qnfo-events`,
  `qnfo-model-eval`, `qnfo-github-steward`, `qnfo-venue-radar`, `qnfo-paper-explainer`,
  `qnfo-blank-audit`, `qnfo-auditor`, `qnfo-chat-canary`, `qnfo-kaizen`, `osf-integrity-check`.
  Each needs its dispatcher read first (several branch on the literal cron string) — a cron
  expression cannot be moved without moving the branch that matches it.
- **Blocked by an external side effect** — retiming the trigger would send or submit far more
  often, so the period is a business period, not a throughput schedule:
  `qnfo-subscribers` (weekly newsletter digest), `qnfo-gateway` and `qnfo-social`
  (search-engine submission / outbound posts), `qnfo-outreach` (outbound email),
  `personal-api` / `personal-companion` (owner-facing briefs).

The migration path for the blocked set is a due-gate inside the handler (tick hourly, act once
per period), not a shorter cron. That is one handler edit per worker and it is tracked work.

## 5. GitHub

Workflow `schedule:` crons in `QNFO/qnfo-workers` normalised to ≤120 minutes: `deploy-drift`,
`deploy-gate`, `mirror-autosync`, `remediation-bridge`, `apply-unmangle-worker-js`,
`container-config-autoverify`, `model-floor-guard` (its duplicate daily+weekly pair collapsed
to one `17 */2 * * *`).

Deliberate exceptions, documented here so they are decisions rather than oversights:

| workflow | cron | why it keeps its period |
| --- | --- | --- |
| `codeql.yml` | `17 4 * * 1` (weekly) | security analysis is heavy CI compute, not a pipeline stage |
| `indexnow-submit.yml` | `23 6 * * *` (daily) | external search-engine submission; accelerating it is spam |

## 6. Enforcement

```bash
python3 scripts/cron_rate_guard.py --root .        # ceiling + heartbeat + TEMPO backlog
python3 scripts/cron_rate_guard.py --live          # same against live Cloudflare schedules
```

`deploy_gate.py` runs the same gate on every deploy, so a heartbeat cron slower than 5 minutes
or a producer finer than 10 minutes cannot land. The exceptions are `OWNER_OVERRIDES` entries
carrying the owner's words and the date; deleting an entry restores the default ceiling.

D1 side:

```sql
SELECT * FROM v_tempo_violations;        -- cadence, SLA, queue, metric registry
SELECT * FROM v_tempo_cron_violations;   -- fleet_crons
```
