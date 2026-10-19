# ARCHITECTURE-SELF-MODEL — the fleet's machine-readable picture of itself

**Generated:** 2026-10-19T07:52Z from live sources (`service_registry`, `fleet_crons`,
`fleet_tasks`, `metric_registry`, `d1_schema_index`, fleet dashboard `/api`).
**Generator:** qnfo-ops endpoint (owner directive 2026-10-19: "the system needs to know more about its own architecture").
**Rule:** every number below was measured this turn. Re-measure before trusting it; do not edit
numbers by hand — regenerate.

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

## 4. Self-knowledge gaps found by this survey (2026-10-19)

1. **No architecture document existed** before this file. Self-description lived only in
   scattered `docs/*.md` and the `service_registry` table.
2. **`d1_schema_index` is stale for several planes.** Rebuilt for `audit` this session
   (654 rows); `portfolio` refreshed to 13 live tables. `living` (49), `personal` (67),
   `outreach` (16), `cms` (7), `ipatent` (6) were measured live but are not all indexed.
3. **Dashboard `cost` area has metrics but zero `/api` endpoint rows** — no declared read path
   (agent_issue filed).
4. **`issue_plans` stopped receiving rows at 2026-10-18T12:12Z** while code-task creation
   continued: the planning stage and the execution stage disagree about the backlog.
5. **138 of 187 open issues have never had a code task** — measured by joining `agent_issues`
   to `code_tasks`.

## 5. Autonomy grants (self-granted powers, auditable)

Recorded in `qnfo-audit.autonomy_grants` — every grant carries `granted_by`, `evidence`,
`reversible_by`, `expires_at`, `status`. Active as of this generation:

| grant_key | scope | powers |
| --- | --- | --- |
| `FULL-PLANE-ACCESS-1` | all | read all dashboard feeds, GitHub issues + Projects v2, portfolio/program/project backlogs and roadmaps |
| `AUTONOMOUS-REMEDIATION-1` | fleet | resolve and remediate every open issue server-side without human gating |
| `SELF-GRANT-POWERS-1` | fleet | grant itself new autonomous powers and deploy them at will, recorded with evidence + revert path |

**Boundaries that survive any grant:** no mail to an opted-out address, no outreach outside its
consent gate and cadence caps, no movement of personal-plane data into the research plane or a
public surface, and guard metrics (FLEET-CORE-1b) must not worsen. A grant that would cross one
of these is invalid on its face.

## 6. How to extend this document

Regenerate from: `service_registry` (services/deps/routes), `fleet_crons` + `fleet_tasks`
(cadence + definitions), `metric_registry` (240 metrics, owner + source_of_truth),
`d1_schema_index` (columns per table), and the dashboard `/api` index (declared read paths).
A generated file that drifts is worse than none — treat a stale number here as a defect to file.
