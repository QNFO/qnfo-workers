# CRON-RATE-CEILING-1 — Worker cron rate ceiling

**Owner directive, 2026-09-23:**

> NO CLOUDFLARE QUNIVERSE WORKER CRON SHALL EXECUTE MORE THAN ONCE EVERY 10 MINUTES,
> NOT MORE THAN 144 TIMES IN ANY 24-HOUR PERIOD

## 1. The rule

144 = 24 x 60 / 10. The two clauses are the same invariant stated two ways:

| clause | meaning |
| --- | --- |
| "not more than once every 10 minutes" | consecutive fires of one cron are >= 10 minutes apart |
| "not more than 144 times in any 24-hour period" | worst-case rolling-24h fire count <= 144 |

Interpretation: the ceiling is **per cron trigger** (per `crons = [...]` entry), which is the
unit the Cloudflare Workers API models and the unit a deploy applies. Per-worker *aggregate*
spacing is reported as a warning, not a failure — see §4.

Cloudflare's own floor for Workers cron is one minute, so nothing upstream prevents a `*/5`
from being applied. The ceiling is enforced by us.

## 2. Why it matters

A cron finer than 10 minutes multiplies, with no diagnostic gain:

- Worker invocations (billable CPU/wall time, and rate-limit headroom)
- AI Gateway / Workers AI neuron spend on any scheduled AI step
- D1 read/write volume and Vectorize query count
- Log/analytics noise that buries real signal

## 3. Canonical violations found 2026-09-23 (live audit)

Live audit of all 54 scripts (41 carrying cron triggers, 0 API errors):

| worker | cron | fires/24h | spacing | state |
| --- | --- | --- | --- | --- |
| `qnfo-calendar-intake` | `*/5 * * * *` | 288 | 5 min | LIVE + repo violation |
| `vault-indexer` | `*/5 * * * *` | 288 | 5 min | LIVE + repo violation |
| `qnfo-email` | `*/5 * * * *` | 288 | 5 min | repo-only latent (LIVE was already `0 7 * * *`) |

At-the-ceiling but **compliant** (exactly 144 fires/24h at exactly 10-minute spacing):
`qnfo-deploy-guard`, `qnfo-research-exec`.

## 4. Remediation applied

| worker | was | now | safety argument |
| --- | --- | --- | --- |
| `qnfo-calendar-intake` | `*/5 * * * *` | `*/15 * * * *` | `scheduled()` runs `sch()` + `dis()` with no cron-string branch; `dis()` dispatches `WHERE remind_at <= now LIMIT 20`, so reminders land within one interval of target. Reminder offsets (-1440 / -60 min) unaffected. |
| `vault-indexer` | `*/5 * * * *` | `*/15 * * * *` | `scheduled(event, env, ctx)` calls `run(env)` with no cron-string branch. |

| `qnfo-email` | `*/5 * * * *` (repo) | `0 7 * * *` (repo) | Repo declaration re-synced to the value already LIVE. The repo was a latent violation any `wrangler deploy` would have applied. |

**External drift, re-probe 2026-09-23 (CRON-SCHEDULE-EXTERNAL-DRIFT-1).** This cycle first
set both workers to `*/10` in LIVE (verified: `PUT` 200, then `GET /schedules` returned
`["*/10 * * * *"]`). A later re-probe found LIVE at `*/15` on both. `*/15` is neither the
prior value (`*/5`) nor the value this cycle wrote (`*/10`), so it cannot be an
eventual-consistency artefact — a **concurrent actor re-timed LIVE out-of-band**. Repo has
been realigned to LIVE. `*/15` (96 fires/24h, 15-minute spacing) satisfies the same ceiling
as `*/10` (144/24h) and leaves headroom rather than sitting exactly on the limit.

**Drift is ongoing, not a one-off (observed 2026-09-23, same cycle).** While this cycle was
closing out, a further live sweep showed `qnfo-deploy-guard` and `qnfo-research-exec` at
`*/20 * * * *` (repo still declares `*/10`). Both are compliant, but repo/LIVE parity cannot
be *held* while a concurrent actor keeps re-timing schedules out-of-band. This is the
argument for **enforcement over pinning**: the ceiling is guaranteed by
`cron_rate_guard.py --live` running on a fleet cron — which rejects any value, no matter who
writes it — rather than by aligning individual strings in the repo.

**Dispatcher safety is a precondition, not an assumption.** `jnl-pipeline` is a *counter-example*
and was deliberately NOT re-timed: its `scheduled()` branches on the literal cron string —

```js
if (event.cron === "*/10 * * * *") return jnlWatchMod...scheduled(event, env, ctx);
if (event.cron === "23 */2 * * *")  return jnlRefereeMod.default.scheduled(event, env, ctx);
```

— so shifting `23 */2` by even a few minutes would silently disable the referee lane. Every
re-time must be preceded by reading the dispatcher (see `memory: read runTick/source first`).

## 5. Aggregate (per-worker) findings — WARN, not FAIL

A worker with several compliant triggers can still be invoked with < 10 minutes between two
*different* triggers. This is reported, never silently "fixed":

| worker | crons | aggregate gap | nature |
| --- | --- | --- | --- |
| `jnl-pipeline` | `*/30` + `23 */2` | 7 min | genuine sub-10-min spacing |
| `qnfo-fleet-control` | `*/20` + `0 * * * *` + ... | 0 min | two triggers on the same minute |
| `qnfo-cloud-ops` | 21 triggers | 0 min | overlapping weekday/hourly entries |
| `qnfo-email-orchestrator` | `*/15` + `0 */3` | 0 min | `*/15` already covers `:00` |
| `qnfo-lifecycle` | 8 triggers | 0 min | hourly `0 * * * *` swallows the daily ones |
| `qnfo-idea-triage` | `*/10` + `0 * * * *` | 0 min | `*/10` already covers `:00` |
| `radar-hub` | 9 triggers | 0 min | same-minute collisions |
| `personal-companion` | `0 * * * *` + `0 21 * * *` | 0 min | same-minute collision |

**Why aggregate is a warning and not a failure:** a `*/10` trigger and *any* other trigger on
the same worker are always within 5 minutes of each other, so under a strict aggregate reading
every multi-trigger worker would be permanently non-compliant without a dispatcher refactor
(single trigger, branch on `scheduledTime`). The fleet architecture is many-triggers-per-worker;
enforcing per-cron is the reading that is both faithful to "a worker cron" and mechanically
satisfiable. `cron_rate_guard.py --strict-worker` escalates these to failures for anyone who
wants the stricter reading.

Escalation path if the aggregate reading is intended: `jnl-pipeline` is the only case that is
genuinely close-in-time rather than a same-minute duplicate; `*/30` there matches no dispatch
branch and is a dead trigger (48 wasted invocations/day) — a separate finding.

## 6. Enforcement (permanent)

- `scripts/cron_rate_guard.py` — single source of truth for the rule.
  - `--root <dir>` static sweep of every `*/wrangler.toml`
  - `--live` audits LIVE Cloudflare schedules (closed-loop re-probe)
  - `--strict-worker` escalates aggregate warnings
  - `--json` machine-readable
- `scripts/deploy_gate.py` — `cron_rate_gate()` now runs on **every** gated deploy, so a
  non-compliant `crons = [...]` cannot be deployed (fail-closed, exit 3).
- `.github/workflows/deploy-gate.yml` — a repo-wide sweep step runs on **every** push, over
  **all** worker dirs, so a cron regression fails CI even when the edited worker is not the one
  carrying the offending cron.

Exit codes: `0` compliant, `1` violation(s), `2` usage error.
