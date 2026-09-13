# FINDING — three producers with no consumer, and one declared chain that is nominal

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).
Every count below is a live `qnfo-audit` read this session; every code claim is from a repo read
this session.

## 1. `fleet_improvements` — 75 actionable rows, no consumer anywhere

| status | priority | n | oldest | newest |
|---|---|---|---|---|
| approved | P3 | 38 | 2026-09-09 07:19:56 | 2026-09-09 07:28:42 |
| **proposed** | **P1** | **29** | 2026-09-09 19:25:21 | **2026-09-13 00:04:56** |
| approved | P2 | 5 | 2026-09-09 07:19:53 | 2026-09-09 07:50:36 |
| proposed | P2 | 2 | 2026-09-09 19:19:59 | 2026-09-11 10:40:39 |
| approved | P1 | 1 | 2026-09-09 07:25:05 | 2026-09-09 07:25:05 |

`fleet_improvements` **is still being written** (newest 2026-09-13 00:04:56, i.e. today), and
**nothing reads it.** Checked and refuted as consumers:

- **`qnfo-kaizen`** (24,980 B, sha `71963f56`, v0.3.2-glm53) — the declared consumer for the
  `issues` chain. Its `runScan()` reads `SKILLS_BUCKET`, `agent_issues`, `ops_ai_log` and
  `kaizen_candidates`. **It contains no reference to `fleet_improvements`.** It also does not
  reference `task_dod_register`.
- `qnfo-fleet-control` — read 32,768 of 75,875 B; the advisor module does not reference it. The
  deploy module was never read, so this one is **not** excluded.

Sources that write it: `scan` (51), `register` (25), `manual` (10), `probe` (7), `audit` (3),
`deepchat-agent` (3), plus small manual/health/perf/hygiene batches.

## 2. The self-renewing loop, now with both ends measured

`fleet_improvements` rows filed with `source='register'` are titled
`Register row N OVERDUE (due <date>, owner agent)`, all P1, and were written in bursts —
ids 653–660 landed within **7 seconds** at 2026-09-13 00:04:49–00:04:56.

The other end: `task_dod_register` holds **open = 99** (done 100, cancelled 19, in-progress 1;
oldest open due 2026-09-11, newest 2026-10-30).

**Nothing drains `fleet_improvements`, so the overdue rows stay open, so the daily scan re-derives
the same set and files another P1 burst.** The loop cannot self-clear. This is the same shape as the
register-guard emails I found earlier (spam: "register guard: 26 overdue" on 09-13T03:10:43Z,
"7 overdue" on 09-12T03:10:46Z) — the 7 → 26 growth is the loop running.

## 3. The `issues` chain is nominal, not real

`qnfo-fleet-dashboard/registry.js` and `integration_state` both declare:
`issues: producer "ops gateway" -> consumer "qnfo-kaizen", medium agent_issues`.

`qnfo-kaizen`'s only use of `agent_issues` is:

```js
const rows = await env.QNFO_AUDIT.prepare(
  "SELECT source, COUNT(*) AS cnt FROM agent_issues WHERE status='open' GROUP BY source").all();
for (const r of rows.results || []) incidents[(r.source || "other").toLowerCase()] = r.cnt;
```

That is an **input to a skill-staleness score** (`incidentScore`). It counts open issues per source;
it does not read, triage, act on, or close any of them. **So the declared consumer consumes nothing
of the chain's medium.** The chain's `status: "stuck"` reading in `integration_state` (n=15,
"backpressure: 15 waiting") is about `agent_issues` volume, which kaizen neither causes nor relieves.

Separately, `agent_issues` *does* have a nominal drainer — `qnfo-backlog-exec` — but it is a no-op
for this class. A prior session measured it: `openBacklogBefore: 25, processed: 25, closed: 0,
rechecked: 25, escalated: 0`, every row `note: "no probe target"`. The drain only auto-closes
health-availability rows whose re-probe PASSes; the open rows are `research-pipeline`,
`ai-calibration`, `model-health` and `infra` — none carry a probe target.

## 4. The pattern is not universal — `kaizen_candidates` works

For contrast, `qnfo-kaizen` *does* consume `kaizen_candidates`, with an explicit weekly pass:

```js
// Weekly candidate disposition pass (register contract: "Dispositioned in next kaizen report").
// The auditor's upsertCandidate only promotes on re-upsert; quiet candidates would sit 'proposed' forever.
const mature = await env.QNFO_AUDIT.prepare(
  "SELECT id FROM kaizen_candidates WHERE status='proposed' AND created_at < ?1 LIMIT 20")...
await env.QNFO_AUDIT.prepare(
  "UPDATE kaizen_candidates SET status='promoted', updated_at=?1 WHERE id=?2")...
```

The author documented exactly the failure mode that `fleet_improvements` is now suffering —
*"quiet candidates would sit 'proposed' forever"* — and fixed it **for that table only**.

## 5. Summary of orphaned producers found this session

| table | rows awaiting action | consumer | state |
|---|---|---|---|
| `fleet_improvements` | **75** (29 × P1) | none found | orphaned |
| `idea_proposals` | **496** (`new`, `unscored: 496`) | `qnfo-idea-triage` — **retired** | orphaned; see `qnfo-idea-triage/REDEPLOY-REQUIRED-2026-09-13.md` |
| `task_dod_register` | **99** open | none (read only for a display count) | orphaned |
| `agent_issues` | 12 open | `qnfo-backlog-exec` (no-op for this class) | nominal |
| `kaizen_candidates` | 0 pending | `qnfo-kaizen` weekly pass | **works** |

## 6. What I could not do

Writing a consumer for any of these is a code change plus a deploy, and this endpoint has neither.
`ops_d1_query` is SELECT/WITH only, so none of the 682 rows across these tables can be touched from
here either. The one thing I could fix — the stale `FLEET` roster in
`qnfo-observability/fleet.js` — is committed as `2b9fbeee`.
