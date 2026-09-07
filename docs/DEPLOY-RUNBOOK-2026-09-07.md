# DEPLOY RUNBOOK — 2026-09-07 (audit + machine-readability + CF capability integration)

Status: ARTIFACTS COMMITTED, CODE/DEPLOY PENDING. Run in order; each step has acceptance criteria.
Repo: QNFO/qnfo-workers (single monorepo — includes qnfo-ops/, qnfo-cloud-ops/, docs/, machine-readability/).

## Step 1 — Fix ops_issues_list (live bug, one line)

File: `qnfo-ops/worker.js` v2.5.1, function `listIssues()` (~line 39k of file).
Bug: `.all()` result is not awaited -> `res.results` undefined -> tool ALWAYS returns count 0
(even status=all), while D1 holds 504 rows (10 open / 31 resolved / 211 closed / 252 wontfix at audit).

Before:
```js
const stmt = env.QNFO_AUDIT.prepare(sql);
const res = params.length ? stmt.bind.apply(stmt, params).all() : stmt.all();
```
After:
```js
const stmt = env.QNFO_AUDIT.prepare(sql);
const res = await (params.length ? stmt.bind.apply(stmt, params).all() : stmt.all());
```

Acceptance criteria (POST /v1/chat/completions via ops tool `ops_issues_list`):
- status=open -> count 10, newest first, ids match D1 `SELECT id FROM agent_issues WHERE status='open'`
- status=closed -> count 211; priority=high composes with status; limit respected (1-50)
- status=all -> count 504
- sibling handlers (d1Query/registryList/recentOpsLog/serviceDiscover) all await correctly; this is the only offender.

Deploy: `wrangler deploy` in qnfo-ops/ (single-file worker, no build step).

## Step 2 — Apply D1 migrations (QNFO_AUDIT)

Files (both verified on main):
1. `qnfo-cloud-ops/migrations/2026-09-07-cf-capability-catalog.sql`
   - creates `cloudflare_capability_catalog` (product slug/name/triggers_issue/owning skill/docs URL/
     status not_considered|proposed|approved|in_use|reviewing/linked agent_issues id + after-metric ref)
   - seeds 34-product need->product map from cloudflare/skills
   - 6 issue-linked recommendations (504s->Workers Cache; qwen 400s->AI Gateway; container-executor->
     Containers; exceptions->Observability; orphan probe->DNS hygiene)
2. `qnfo-cloud-ops/migrations/2026-09-07b-machine-self-description.sql`
   - additive registry doc-pointer columns + `service_self_descriptions` store
   - `cf_advisory_decisions` decision-gate log (proposed->approved->applied->reverted + before/after metrics)

Command: `wrangler d1 execute QNFO_AUDIT --file=qnfo-cloud-ops/migrations/<file>.sql --remote`
Acceptance: `SELECT COUNT(*) FROM cloudflare_capability_catalog` = 34; `PRAGMA table_info(cf_advisory_decisions)` shows lifecycle columns.

## Step 3 — Registry enrichment (Loop 2: actual workload state)

Gap quantified: 76 services registered; 71 blank `purpose`; enrichment must target `purpose`
(not capabilities/routes, which are populated via self-registration).
- Extend `qnfo-ops/worker.js` `registryRefresh()` additively (preserve REGISTRY-PRESERVE-1 self-registered entries;
  do not overwrite rich entries with empty CF-API metadata).
- Have every worker publish `/.well-known/self.json` validating against
  `machine-readability/service-self-description.schema.json`; store to `service_self_descriptions`.
- Crawler backfills `service_registry.purpose` from self.json/`/health` body.

Acceptance: blank-purpose services < 10 after two refresh cycles; self.json of qnfo-ops validates.

## Step 4 — CF capability digest (Loop 1 + feedback)

In `qnfo-cloud-ops/worker.js` v1.13.4 `AMS_SCHEDULE` add `cf-capability-sync` (Mon 04:00 UTC), reusing
ghGet/recordEvent/stateGet helpers:
- diff `cloudflare/skills` repo + developers.cloudflare.com/changelog -> upsert catalog deltas (status=not_considered)
- advisor mapping pass: open agent_issues category/pattern -> candidate products in capability_catalog
  (policy: auto only when product solves concrete [ERROR]/cost/performance problem; else proposed)
- weekly digest gains "Cloudflare capability digest" (deltas, adoption status, accepted/rejected recs)

Acceptance: catalog rows for changed products flip to not_considered; digest shows deltas + linked issue ids.

## Step 5 — Machine-readability rollout (already committed, code-level example)

Artifacts (verified): machine-readability/README.md, self-documentation.prompt.md,
service-self-description.schema.json, examples/ (qnfo-ops.self.json + listIssues.self.js carrying @self header).
Apply the @self header convention to services as they are touched; publish self.json alongside.

## Evidence snapshot (2026-09-07 ~06:52 UTC, all live)
- Fleet: 71 workers, 12/12 service-bound core healthy; backlog-exec openBacklog=10
- agent_issues by status: open 10 / resolved 31 / closed 211 / wontfix 252 (total 504)
- ops_issues_list tool returns count 0 for status=all -> Step 1 bug, confirmed live
- Telemetry 24h: 822 tool calls, 81 failures (9.9%), 217 chats, 0 chat failures;
  top failing tools: ops_d1_query 29, run_code 12, workspace_write 9, web_fetch 9, web_search 8
- Self-heal: 0 open telemetry issues at snapshot; earlier 48h analyze: 8 scanned/6 recovered/1 auto-resolved

## Owners
- Steps 1-2: qnfo-ops / deploy path (wrangler + D1 execute)
- Steps 3-4: qnfo-cloud-ops + qnfo-ops scheduled handlers
- Full spec: docs/CLOUDFLARE-CAPABILITY-INTEGRATION.md + docs/FIX-2026-09-07-ops_issues_list-await.md
