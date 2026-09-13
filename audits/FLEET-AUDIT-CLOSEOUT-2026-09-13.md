# FLEET AUDIT CLOSEOUT — 2026-09-13

Consolidates `FLEET-ERROR-AUDIT-2026-09-13.md` and its deploy-path addendum into a single
action-ordered handoff. Written by qnfo-ops (ops-exec) after auditing every error, warning
and alert surface in the fleet.

---

## 0. THE ONE ACTION THAT UNBLOCKS EVERYTHING

```sql
UPDATE fleet_deploy_state SET value='0', updated_at=datetime('now')
 WHERE key IN ('auto_heal','enabled');
```

**Verified live this session (2026-09-13 ~14:25Z):**

| key | value | updated_at |
|---|---|---|
| `auto_heal` | **`1`** | 2026-09-08 16:25:49 |
| `enabled` | **`1`** | 2026-09-08 16:25:49 |

`qnfo-fleet-control/README.md` documents **both as fail-closed `0`** and warns against
enabling `auto_heal` before canonicals are synced ahead of deployments. The drift table
holds **1,492 rows across 50 workers** — that precondition is not met, and has not been
for five days.

`auto_heal=1` is what drives the hourly impossible-deploy loop. Flipping it to `0` stops
**51 of the 54 failed deploys** (94%) immediately, with no code change and no deploy.
This is a single-row D1 write. **This endpoint cannot perform it** — `ops_d1_query` is
`SELECT`/`WITH` only. It requires a runner with D1 write access.

---

## 1. Audit scope and what was actually found

Every surface audited live: `fleet_status`, `backlog_status`, `telemetry_report`,
`ops_issues_list`, `cf_analytics`, `email_stats`/`email_check`, `cloud_ops_events`,
`alerts`, `ai_gateway_failures`, `ai_model_health`, `agent_issues`, `research_queue`,
`idea_proposals`, `version_queue`, `fleet_deploys`, `fleet_drift_report`, `fleet_deploy_state`.

**Result: the fleet is materially healthier than its alert volume implies.**

| Surface | Measured | Reading |
|---|---|---|
| Fleet | 55 deployed, **12/12 probed = 200** | healthy |
| `agent_issues` | open **3** / closed 320 / wontfix 258 / resolved 105 | backlog collapsed 17 → 3 |
| `backlog_status` | v1.2.8, `openBacklog: 3` | agrees with D1 exactly |
| `ops_issues_list` | `count: 3`, matches SQL | **FIXED** (long-standing await defect resolved) |
| `cf_analytics` 30d | 1,137,177 neurons ≈ **$12.51**; 280,655 req / 187 err | nominal |
| `alerts` | 802 critical — but **4 conditions** re-alerted up to 121× | storm, not 802 problems |

## 2. Four false-alarm classes — do not chase these

| Signal | Volume | Truth |
|---|---|---|
| `web_fetch` failures | 282/24h | **Observer artifact.** The endpoint probes its own public host. `qnfo-ops.q08.workers.dev/health` and `qnfo-ai…/health` → **HTTP 404** to `web_fetch`, while `fleet_status` (service binding) → **200**. Documented in `qnfo-observability/FINDING-2026-09-13-jobs-status-public.md` §2.2. |
| `ops_d1_query` failures | 185/24h | **Guard rejections** (`add LIMIT n`, `no such column`) — structured refusals counted as errors. |
| `worker-health` errors | 15 | **False alarm.** Reports `qnfo-ai`/`personal-api`/`*-chat` at **530 / code 1016**; `fleet_status` shows `qnfo-ai` **200 v5.25.1** the same minute. Public-URL probing. |
| 43 workers `healthy:null` | — | **Unprobed, not down** — no service binding. Reading null as failure is a reporting defect. |

**Consequence: the 8.8% tool-failure rate is not real.** Separate observer failures from
target failures, and stop counting `rejected` as `error`.

## 3. Real defects, ordered by what unblocks what

| # | Defect | Evidence | Blocked by |
|---|---|---|---|
| **0** | `auto_heal=1` with unmet precondition | `fleet_deploy_state`; 1,492 drift rows / 50 workers | **D1 write** |
| **E** | Deploy path: **76 attempts, 54 failed (71%)** | `fleet_deploys` | E0 |
| E-a | `personal-companion` 26× impossible downgrade `v1.1.0→1.0.0` | CF 10021 "GenerationFlow must be exported" | healer D2+D6 |
| E-b | `qnfo-cloud-ops` 25× corrupt canonical | `SyntaxError at worker.js:1:2` | healer D4 |
| E-c | `qnfo-observability` "No such module `fleet.js`" | blocks JOBS-STATUS-PUBLIC-1 | bundle |
| E-d | `qnfo-pipeline-ops` **0 deploy attempts ever** | not in deploy set | set membership |
| A | Alert storm | 121× / 71× / 24× repeats of 3 conditions | E-d (fix v0.5.4 in repo) |
| B | **543** proposals stalled `triaged_hold` | `idea_proposals`; `research_queue` has **0** `status='new'` | triage worker (`TRIAGE_URL` 404) |
| D1 | 2 terminal research failures (687, 688) | `bibCount:0, srcFetched:false`, `terminal_rearms:3` | source starvation (arXiv 429) |
| D3 | Gateway caller bugs every 30 min | `qwen2.5-coder-32b` sent `messages`, needs `prompt` (×42); `qwen3.8-27b` system-order (×18); `bge-base` 429 ×79 | caller payloads |
| D4 | 5 `degraded` models → `autoRoute` excludes them | `ai_model_health` | D3 |
| D5 | `latex-fail` ×23 | pdfTeX log returned as `text/plain` | pdf pipeline |
| D6 | `zenodo-stats` **218/218 fetches failed** | `fetched:0, errors:218` | credential/endpoint |
| D7 | `telemetry_report` ignores `hours` | `hours=1` → `windowHours:24`; sibling honors it | file 161,339 B > 32,768 read cap |
| D8 | `gtd-overdue-guard` 7 → **26** in 24h | `fleet_drift_report` regOverdue=26 | **E-b** — the gtd-guard deploy dies on the corrupt artifact |
| D9 | `research-daily-brief` FAILED | 2026-09-13T06:07:35Z | — |
| F | **Self-heal blind to all of the above** | `telemetry_analyze(24h)` → scanned 11, **filed 0** | detects only erroring tools |

**D8 is a downstream symptom of E-b.** Mechanism: `qnfo-cloud-ops`'s canonical `worker.js`
opens with the *outer bundle* version `const VERSION = "1.14.1"`, so `versionOf()` returns
`"1.14.1"` == deployed → classified **CLEAN**. The `1.14.1-gtd-guard` change is therefore
neither deployed nor tracked. **The drift monitor became a mask.**

## 4. Honest attribution — this repeats prior work

Defects E-a…E-d are **not new**. `qnfo-fleet-control/FINDINGS-2026-09-13-deploy-subsystem-source-verified.md`
already source-verified the deploy subsystem (its D1–D6) and `PATCH-2026-09-13-CONSOLIDATED.mjs`
carries the fixes, fail-closed, superseding five partial patches.

This session adds only:
1. **Quantification** — 76 attempts / 54 failed (71%); 51 of 54 from two workers.
2. **Re-verification that the blocker is still live** — `auto_heal=1`/`enabled=1` as of
   2026-09-13 14:25Z, five days after being set.
3. **The D8 ↔ E-b causal link** via the false-clean mechanism.
4. **Alert-surface classification** — which signals are false (four classes, §2).
5. **State changes since yesterday** — `ops_issues_list` fixed; backlog 17→3; `version_queue`
   id=18 self-recovered (issue 677 now stale).

## 5. Remediation order

1. **Flip `auto_heal`/`enabled` to `0`** *(§0 — one row; stops 94% of deploy failures)*
2. Run `PATCH-2026-09-13-CONSOLIDATED.mjs --apply` in `qnfo-fleet-control/`, then deploy
3. Repair the `qnfo-cloud-ops` canonical artifact *(unblocks D8)*
4. Bundle `fleet.js` into `qnfo-observability`'s canonical *(unblocks JOBS-STATUS-PUBLIC-1)*
5. Add `qnfo-pipeline-ops` to the deploy set; ship v0.5.4 *(kills the alert storm)*
6. Fix `TRIAGE_URL`; drain the 543 `triaged_hold` *(Defect B)*
7. Functional fixes: D1, D3, D5, D6, D9 — then close 677 with recovery evidence
8. **Only after 1–7:** bring the 18 `deployed-ahead` canonicals forward, *then* consider
   re-enabling `auto_heal`

## 6. What this endpoint cannot do

- **No deploy** — `service_discover(qnfo-fleet-deploy)` → `service: null`; no exec/wrangler;
  `run_code` is isolated compute (no network/fs/bindings).
- **No D1 writes** — `ops_d1_query` is read-only. The §0 fix, the 543 rows, and issue 677
  cannot be touched from here.
- **No large-file edits** — `github_repo_read` caps at 32,768 chars; `qnfo-ops/worker.js` is
  161,339 B, so D7 is unpatchable here.
- **Drain is not the remedy** — `ops_issue_run` only auto-closes *re-probed-healthy* rows;
  these are code/pipeline defects with no probe target.

## 7. Residual uncertainty

1. **The healer's retry/backoff logic was not read** — the loop is inferred from
   `fleet_deploys` (26 identical hourly attempts, no escalation). The consolidated patch's
   anchors are prior-session work I did not re-verify.
2. **`personal-companion`'s downgrade direction** (`v1.1.0→1.0.0`) is read from
   `from_sha`/`to_sha`; whether it is an intended rollback or inverted comparison is
   undetermined — both fit.
3. **`scanned=` is unstable** (52/55/75/77/78/79/80 across scan notes). The same account
   yields different worker counts hour to hour. Unexamined; may be a seventh deploy defect.
4. **Defect B was partially pre-documented** — a prior session measured 496 `status='new'`
   at 07:16Z; I measured 543 `triaged_hold` at 14:20Z. Same condition, later state.
5. **The 8.8% failure rate is inflated** by `rejected` (205) and observer-404s.
