# REDEPLOY REQUIRED — this worker is the only consumer of `idea_proposals`

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).

## Why this file exists

496 rows sit in `qnfo-audit.idea_proposals` with `status='new'`, `decision IS NULL`,
`score IS NULL`, `triaged_at IS NULL`. Nothing consumes them. This worker did, and this worker is
retired. **Do not "fix" the intake stall by changing `TRIAGE_URL` — that is necessary but not
sufficient, and on its own it drains nothing.**

## 1. This worker is the consumer

`qnfo-idea-triage/worker.js` (39,837 B, sha `21661c12`, `VERSION = "1.4.0-intake-only"`), in
`runPending()`:

```js
const props = await env.QNFO_AUDIT.prepare(
  "SELECT * FROM idea_proposals WHERE status='new' ORDER BY created_at ASC LIMIT ?1"
).bind(limit).all();
for (const row of props.results || []) {
  ...
  s = await scoreIdea(env, desire);
  await env.QNFO_AUDIT.prepare(
    "UPDATE idea_proposals SET decision=?, score=?, rationale=?, triaged_at=?, status=? WHERE id=?"
  ).bind(s.decision, s.score, s.rationale || "", new Date().toISOString(),
         s.decision === "ACCEPT" ? "triaged_accepted" : "triaged_hold", row.id).run();
```

The `decision` / `score` / `rationale` / `triaged_at` columns on `idea_proposals` exist **for this
worker**, and the `triaged_hold` / `triaged_accepted` statuses are its vocabulary. Nothing else in
the fleet writes them.

## 2. It is retired

| signal | value |
|---|---|
| present in `fleet_dashboard_state.fleet.workers` (55) | **no** |
| `service_registry` (55 rows) | **no** |
| `fleet_status` probe | **no** |
| listed in `qnfo-observability/fleet.js` pre-fix stale set | **yes** (captured 09-10, retired after) |
| last `idea_proposals` write (`triaged_hold`) | **2026-09-11T13:11:45.257Z** |
| last `triaged_accepted` write | 2026-09-10T21:11:04.951Z |
| `qnfo-idea-triage.q08.workers.dev/health` | **404** |

Totals written before retirement: `triaged_hold` 47, `triaged_accepted` 14. Rows since: **0**.

## 3. `qnfo-intent-orchestrator` is NOT a substitute

`qnfo-pipeline-ops`'s `TRIAGE_URL = "https://qnfo-idea-triage.q08.workers.dev"` returns 404 on every
run (visible as `meta.triage_health: 404` in each heartbeat). The obvious repair is to repoint it at
`qnfo-intent-orchestrator`, which does expose `POST /triage/run`. **That would not drain the 496.**
Its batch triage reads a different table:

```js
// qnfo-intent-orchestrator/worker.js, runBatchTriage()
const rows = await env.D1.prepare(
  "SELECT * FROM intents WHERE status='pending' AND type='research' ORDER BY created_at DESC LIMIT 40"
).all();
```

`intents`, not `idea_proposals`. Evidence that this path is also idle and separate:
`intents` holds `type='research', status='triaged'` n=33 with newest `2026-09-09T15:45:47Z`, and
**zero** `type='research', status='pending'` rows. The orchestrator's triage has nothing to do while
496 proposals rot.

Two further blockers to repointing at it: the orchestrator's triage surface is auth-gated behind
`INTENT_TOKEN` (`auth()` runs before every non-`/health` route), and `/triage/run` would still not
touch `idea_proposals`.

## 4. The repo source already contains the fix for the original freeze

The 2026-09-03..09-06 silent freeze was `scoreIdea` returning *"all scoring models failed"* after a
Workers AI response-envelope change. This version's `extractText()` handles all four envelopes:

```js
const ch = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
if (ch) return String(ch);
const c2 = r.result && r.result.choices && ... ;
if (c2) return String(c2);
if (typeof r.response === "string") return r.response;
if (r.result && typeof r.result.response === "string") return r.result.response;
```

plus a `MODEL_CHAIN` fallback across four models. **The envelope fix is in the repo and not in
service.**

## 5. To redeploy

Bindings: `QNFO_AUDIT` (D1 qnfo-audit), `LIVING_PAPER` (D1 living-paper), `AI` (Workers AI).
Secrets required: **`TRIAGE_TOKEN`** (bearer auth), **`DISPATCH_TOKEN`** (X-Sync-Token for
qnfo-agent-orchestrator), **`INDEXNOW_KEY`**.
Crons: `0 * * * *` (triage), `*/10 * * * *` (stage machine).

Prerequisites before enabling the crons: `fleet_deploy_state.auto_heal` is currently `1`, and this
worker is not in the deploy control plane's scan set — confirm it will not be caught by the hourly
redeploy loop described in `personal-companion/FINDING-2026-09-13-deploy-loop-DO-NOT-FIX-10021.md`.

## 6. What I could not do

No deploy route and no ability to set secrets from this endpoint, so this is a source-level note
only. `ops_d1_query` is SELECT/WITH, so the 496 rows cannot be touched either.
