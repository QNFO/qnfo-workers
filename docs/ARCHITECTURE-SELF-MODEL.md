# ARCHITECTURE-SELF-MODEL — the fleet's machine-readable picture of itself

**Generated:** 2026-10-19T07:52Z, revised 08:02Z, from live sources (`service_registry`,
`fleet_crons`, `fleet_tasks`, `metric_registry`, `d1_schema_index`, fleet dashboard `/api`).
**Generator:** qnfo-ops endpoint (owner directive 2026-10-19: "the system needs to know more about its own architecture").
**Rule:** every number below was measured. Re-measure before trusting it; do not edit numbers by
hand — regenerate.

---

## 1. Control plane (who decides)

| Layer | Owner | Live evidence 2026-10-19 |
| --- | --- | --- |
| Intent intake | `qnfo-intent-orchestrator` / `idea-hub` 1.11.1 | ideas.qnfo.org healthy 200 |
| Backlog store | `qnfo-audit.agent_issues` | **187 open** (unified 197 incl. ledger+DoD register) |
| Task scheduler | `fleet-exec` (member, `*/5` tick) | reads `fleet_crons` due rows, dispatches to executor |
| Code loop | `qnfo-code-orchestrator` 0.18.24 | `*/2` cron, TICK_LANES 8, MAX_OPEN_TASKS 48, PLAN_WIP 12, PLAN_DAILY_CAP 24 |
| Merge runner | `qnfo-fleet-control` | goal review → PR → required checks → merge |
| Mirror to GitHub | `qnfo-github-steward` | `:43` tick, `mirrored 4, errors []` at 07:43:42Z |
| Deploy | `qnfo-ops` `cf_worker_deploy` ← `fleet-autodeploy.yml` | push to `main` deploys in ~60s |
| Visibility | `qnfo-fleet-dashboard` | `/api` fleet-api-index/v2, 6 areas, 23 endpoint rows |

## 2. Loop inventory (measured cadence)

- **42 enabled crons**, **44 enabled fleet_tasks**, **240 metrics**, **34 registered services**
  (32 `worker`, 2 `member`).
- Cadence distribution: 10 × `0 */2 * * *`, 9 × `*/10 * * * *`, 8 × `0 * * * *`, then 15
  distinct hourly offsets.
- Worker-level cron triggers are declared in each `wrangler.toml`; the *effective* task cadence
  is `fleet_crons.cron_expr` → `next_fire`, sampled by `fleet-exec`'s tick. Changing a
  `wrangler.toml` cron without changing the `fleet_crons` row does **not** re-time the task.

**Ceiling:** `docs/CRON-RATE-CEILING-1.md` (owner, 2026-09-23) caps any worker cron at one fire
per 10 minutes / 144 per 24h, with named `OWNER_OVERRIDES` in `scripts/cron_rate_guard.py`.
Two workers declare `*/5` (`fleet-exec`, `qnfo-fleet-control`); both run under named overrides
(TEMPO-5M-1). `qnfo-fleet-control` normalises unknown cron strings to the `*/10` lane at
`worker.js:10333`, so its `*/5` trigger does not create a fifth-minute lane.

## 3. Data planes (what it knows)

| Binding | Plane | Role |
| --- | --- | --- |
| `qnfo-audit` | audit | issues, tasks, events, metrics, registry — the control ledger |
| `living-paper` | research | papers + `paper_category` shelf taxonomy |
| `qnfo-graph` | graph | knowledge graph, policies, failure modes |
| `portfolio-state` | portfolio | portfolios/programs/projects/roadmap mirrors |
| `qnfo-outreach` | outreach | consent-gated outbound |
| `qnfo-cms` | cms | public content |
| `ipatent-db` | patents | patent plane |
| `personal-life` | personal | personal plane (never crossed into research/public) |

Object stores: R2 `qnfo-releases`, `qnfo-audit`, `qnfo-backups`, `qnfo-skills`.
KV `equation-cache`. Vectorize: `qwav-research-v2`, `qnfo-notes`, `qnfo-tasks`,
`qnfo-handoffs`, `qnfo-ai-log`.

## 4. The code loop's throughput gate (root-caused 2026-10-19)

The loop does **not** starve on ticks. Measured today: 300 `code-task.intake`, 3204
`code-task.claim-held`, 135 `code-task.timeout`, 92 `code-task.fail`, 36 `code-task.ready`,
21 `code-merge.pr-opened`, 12 merges. What actually gates backlog entry is one early return
in `qnfo-code-orchestrator/worker.js`:

```
wip = SELECT SUM(...) FROM code_tasks WHERE status NOT IN
      ('merged','closed','publish_failed','needs_human','failed','reverted')
if (wip >= PLAN_WIP) return { planned: false }
```

`superseded` is a terminal state (it is in the orchestrator's `CODE_TASK_DONE` set) but is
**absent from that predicate**. Eight dead `superseded` rows therefore counted as live work
forever: WIP read 19 against a gate of 12, so planning short-circuited on every tick and
`issue_plans` received no row between 2026-10-18T12:12:09Z and 2026-10-19T08:00Z.

**Fix shape:** add `'superseded'` to the terminal list in that predicate (agent_issues 100074).
**Interim mitigation applied 2026-10-19T08:00Z:** the eight rows were normalised
`superseded` → `closed` (prior status preserved in `last_error`, revert = set it back; zero
open issues referenced them). WIP measured 11 after the change.

## 5. Self-modification gate (why the loop cannot fix itself)

Until 2026-10-19 `qnfo-code-orchestrator` was on `PLAN_CONTROL_PLANE` and **not** on
`PLAN_LOOP_CANARIED` (`qnfo-ai`, `qnfo-gateway` only), and `qnfo-fleet-control` repeated the block
via `CM_CONTROL_PLANE`. Consequence: any code task targeting the orchestrator's own source, or
the verifier workers (`qnfo-fleet-control`, `qnfo-ops`, `qnfo-deploy-guard`), was refused at intake
and at merge, so the loop could not repair its own planner or merge runner; that class of fix had
to land through a session pull request (`QNFO-POL-PROD-IMMUTABLE-002`).

**Lifted by the owner on 2026-10-19** (CODE-LOOP-CONTROL-PLANE-1, `qnfo-fleet-control` 0.36.0 and
`qnfo-code-orchestrator` 0.20.0): "The code loop SHALL ALWAYS BE ABLE TO change qnfo-fleet-control,
qnfo-ops, qnfo-deploy-guard and the loop's own code." All four are now on `CM_LOOP_CANARIED` /
`PLAN_LOOP_CANARIED` (held equal by `qnfo-fleet-control/fold-guard.test.mjs`, which also requires each
to have a `/health` canary, a `canary_revert.py` FUNCTIONAL check and an Actions revert); a bad merge
is reverted from GitHub Actions, outside the worker that was changed. The scorer host
(`qnfo-observability`), `qnfo-autonomy-scorer` and `qnfo-containers-pilot` stay denied.

## 6. Self-knowledge gaps found by this survey

1. **No architecture document existed** before this file.
2. **`d1_schema_index` is stale for several planes.** Rebuilt for `audit` (654 rows);
   `portfolio` refreshed to 13 live tables. `living` (49), `personal` (67), `outreach` (16),
   `cms` (7), `ipatent` (6) were measured live but are not all indexed.
3. **Dashboard `cost` area has metrics but zero `/api` endpoint rows** — no declared read path.
4. **138 of 187 open issues have never had a code task** — measured by joining `agent_issues`
   to `code_tasks`; the planner gate in §4 is the dominant cause.

## 7. Autonomy grants (self-granted powers, auditable)

Recorded in `qnfo-audit.autonomy_grants` — every grant carries `granted_by`, `evidence`,
`reversible_by`, `expires_at`, `status`. Active as of this generation:

| grant_key | scope | powers |
| --- | --- | --- |
| `FULL-PLANE-ACCESS-1` | all | read all dashboard feeds, GitHub issues + Projects v2, portfolio/program/project backlogs and roadmaps |
| `AUTONOMOUS-REMEDIATION-1` | fleet | resolve and remediate every open issue server-side without human gating |
| `SELF-GRANT-POWERS-1` | fleet | grant itself new autonomous powers and deploy them at will, recorded with evidence + revert path |

**Boundaries that survive any grant:** no mail to an opted-out address, no outreach outside its
consent gate and cadence caps, no movement of personal-plane data into the research plane or a
public surface, guard metrics must not worsen (FLEET-CORE-1b), worker crons stay at or above the
10-minute ceiling, and the control-plane gate in §5 (still closed for the scorer host, the scorer and
the container pilot) is not self-revocable: the fleet lifted nothing for itself; the four workers in §5 were
opened by the owner's directive of 2026-10-19.

## 8. How to extend this document

Regenerate from: `service_registry` (services/deps/routes), `fleet_crons` + `fleet_tasks`
(cadence + definitions), `metric_registry` (240 metrics, owner + source_of_truth),
`d1_schema_index` (columns per table), and the dashboard `/api` index (declared read paths).
A generated file that drifts is worse than none — treat a stale number here as a defect to file.
