# Closeout — D1 trigger-depth deadlock and the 55-metric breach (2026-10-17)

Owner directives this thread, in order:

1. "AUDIT AND RESOLVE 55 metrics in breach across five areas"
2. "AUDIT AND REMEDIATE ALL BOTTLENECKS, ALL ERRORS, ALL SUB-OPTIMAL PIPELINE STEPS, AND ALL ROOT CAUSES. OPTIMIZE FULLY"
3. "IMPLEMENT AND DEPLOY ALL. TEST UPDATED WORKERS"
4. "IDENTIFY AND RESOLVE ALL RELATED FLEET ISSUES SYSTEMWIDE"
5. "CLOSEOUT THIS THREAD AND HANDOFF ALL REMAINING TASKS TO SERVER-SIDE"

Everything below is measured from `qnfo-audit` (D1 `35e2e573-92f3-46ac-83c6-22f6429fc5e5`) unless marked.

---

## 1. The keystone root cause

D1 refuses any write whose trigger chain nests more than 10 levels, **counted at compile time** (self-updating triggers count, and so does an INSERT … WHERE 0). `agent_issues` had regrown to **31 triggers, ~14 of them self-updating timestamp triggers** (8 normalisers + 2 defaulters + predicate_default + directive_newline + evidence_annotate + recheck_count). The `remediation_verifications` INSERT path — `autoclose_ins → INSERT issue_triage → triage_close_sync_issue_ins → UPDATE agent_issues → the timestamp normalisers → …` — exceeded the limit, so **every self-heal verification write failed with `triggers nested too deep` (SQLITE_ERROR 7500)** since 14:40Z.

One fault, ~40 of the 55 breaches: nothing verified → nothing closed/reopened → `remediation_tick_age_min` 300 (target ≤20), `remedy_efficacy_30d` 0.25, `fix_hold_rate_30d` 0.42, `code_task_success_30d` 0.27, `runtime_verified_share_24h` 9.2 (verification monoculture), `open_agent_issues` 204, `sla_breaches_over_120m` 761, `stuck_items_over_sla` 31.

This was a **recurrence** of `D1-TRIGGER-DEPTH-1` (2026-10-08, migration `2026-10-08-16-trigger-depth.sql`), which documented the exact mechanism and the fix pattern (drop/consolidate self-updating triggers, add a depth canary).

## 2. Shipped, deployed, verified

| change | PR | verified by |
| --- | --- | --- |
| migration `2026-10-17-consolidate-agent-issues-ts-triggers.sql`: folds the 10 timestamp triggers into 2 (`agent_issues_ts_norm_ins` / `_upd`), behaviour bit-identical | #1396 (merged, squash `d95c38a`) | scratch SQLite parity test (null/text/secs/ms + UPDATE all agree); `apply_migrations.py --check` + `--apply` to qnfo-audit; `migration_runs` status ok 20:20:53Z |
| offline suite `…test.mjs` (28 assertions) + `IF NOT EXISTS` hardening on the two CREATE TRIGGER statements (so a raw re-apply outside the sha256-guarded runner is a no-op, not "trigger already exists") | #1400 (merged) | `node migrations/2026-10-17-consolidate-agent-issues-ts-triggers.test.mjs` → 28/28 |

**Measured after deploy (live):**

| check | before | after |
| --- | --- | --- |
| `remediation_verifications` INSERT/UPDATE | refused 7500 | compile clean |
| full sweep, **465 tables**, zero-row trigger-depth probe | — | **0 failures** |
| `agent_issues` trigger count | 31 | 23 |
| self-heal verifications (90 min) | 0 | **561** |
| remediation consumer items attempted/pass | 0 / 593 stuck | 16 attempted / 14 pass per run |
| `fleet_tick` | stalled | writing (20:30:34Z) |
| close/reopen loop | stalled | active (8 reopen + 5 disposition in first hour) |
| `deployment_history` INSERT/UPDATE (also flagged 7500) | — | compile clean (its chain reaches agent_issues) |

Breach total: **55 → 53** within the session.

## 3. Corrections / things checked and NOT changed

- **Cost re-run (#2473 RERUN-ROUTE-1)** — already live: `qnfo-research-exec` is at `0.18.30-ai-backoff-sweep-dup-1`, which contains RERUN-ROUTE-1, VERIFY-CYCLE-CAP-1, AI-BACKOFF-1. The `fleet_ai_run_rate_30d_usd` metric is a 30-day lagging window; it cannot reset in one tick.
- **Code-loop "empty reply"** — already self-rotated off `deepseek-v4-flash` (1 task / 3 days vs 21 qwen + 14 kimi). No deploy needed.
- **Social "stall"** — buffer posts flowed 14:30–17:31 today; the watchmaker `social-rollup`/`social-channels` "stalled 50.5h" is a heartbeat-ledger gap, not a distribution outage. **But** see §5.4: `SOCIAL-PAUSE-BYPASS-1` (#2818) is a real finding — social posted at 14:30 while `pipeline_flags.social_paused` was set.
- **Reach / subscribers / credit** — owner-gated, not code.

## 4. Cost evidence (the next lever, for whoever picks it up)

`ai_call_counters` last 2 days, by neurons:

| worker | purpose | neurons (2d) |
| --- | --- | --- |
| qnfo-research-exec | binding:ensemble | 594k |
| q08-signal-engine | binding | 547k |
| qnfo-research-exec | binding:revise | 515k |
| qnfo-research-exec | binding:review | 282k |
| qnfo-code-orchestrator | ladder | 229k |

`qnfo-research-exec` ensemble+revise+review = **1.39M neurons / 2d** — the re-run driver, and it is the same fix #2473 already shipped. `q08-signal-engine` (547k) is the second consumer; its `q08_neurons_per_published_piece_7d` metric (75,387 vs 6,000) is the research-area star. Neither needs a *new* code task today; both need re-measurement after the self-heal drain stabilises.

## 5. Remaining tasks — handed to server-side

### 5.1 Owner-gated (no code path; surface as owner cards)

- **AI credit runs out in ~0 days** — $14.65 left, $55.93 burned in 24h. Top up, or repoint the untagged desktop client on the stored gateway key to Workers AI.
- **Reach/growth (6 metrics)** — 0 confirmed subscribers/mo vs a 50-by-2026-12-31 review gate; outreach reply rate 1.3%; work-with-me pageviews 18.
- **Model-ladder spend decision** — switch `code_gen` off flash-class is a cost/quality tradeoff; the loop already self-rotated, so this is optional.

### 5.2 Open high-priority issues (not this thread's fault, but live)

`#2817 AGENT-ISSUES-TRIGGER-DEPTH-1` is **now fixed** — it should be closed with this migration as evidence (it was filed before the fix; the consolidation is the resolution). Others still open: `#2818 SOCIAL-PAUSE-BYPASS-1`, `#2846 DOI-RECONCILE-1`, `#2847 REVISE-STRIDE-1`, `#2850 DEPLOY-CANONICAL-KEY-EMPTY-1` (secrets.OPS_ROUTER_AUTH_KEY empty), `#2855 LOOP-BREAKER-1 fleet_tick UNIQUE constraint`, `#2859 PERSONAL-COMPANION-UNDEPLOYABLE-1`, `#2860 CONSUMER-CI-LOOP-1`.

### 5.3 Metrics still in breach (recovering, not yet resolved)

- **Cost (5)** — lagging; fixed code is live, needs the 30d window to age out.
- **Autonomy (28) + reliability (10)** — will keep falling as the self-heal drain re-evaluates the re-opened backlog; `remedy_efficacy`/`fix_hold_rate` need several more ticks.

### 5.4 New findings to file (found this thread, not yet filed)

- `SOCIAL-PAUSE-BYPASS-1` (#2818) already filed by the fleet. Confirm `social_paused` enforcement path.
- `#2855` `fleet_tick` UNIQUE-constraint D_ERROR in qnfo-code-orchestrator — likely the two-producer fleet_tick insert (code-orchestrator + dashboard) colliding; verify the single-flight/`loop_lock` and the INSERT OR IGNORE.

## 6. State at closeout

- `qnfo-code-orchestrator` live: `0.18.7-ladder-revert-1`; cron `*/2`; 8 lanes; `loop_lock`; spend cap armed.
- `qnfo-research-exec` live: `0.18.30-ai-backoff-sweep-dup-1`.
- PRs merged this thread: #1396, #1400.
- `agent_issues`: 1983 closed / 212 open / 273 resolved / 349 wontfix (open recovered 205 → 212 as the loop re-opens for re-evaluation).
- Verifications in the 90 minutes before closeout: 561.
