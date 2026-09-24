# Fleet Consolidation Plan — 2026-09-13

Produced by the qnfo-ops endpoint from live D1 reads, `fleet_status` probes and
source reads in `QNFO/qnfo-workers`. Every figure below is reproducible from the
named table or file.

Status: **plan only.** Nothing here is deployed. This endpoint has no
wrangler-authenticated deploy channel.

---

## 1. Why this plan exists

The directive is that every worker must be productive or be merged. Applying
that test naively produced a false result, so this plan records both the method
and its failure modes.

**Retracted method:** ranking workers by `service_registry` completeness. Rows
with `purpose: null` and `capabilities: []` looked idle. They are not. The
registry row is written by each worker's own `/registry/register` call, so a
worker that never registers looks empty no matter what it does. Four of four
workers tested this way proved to be substantial implementations with live
sinks:

| worker | worker.js | sink | newest write |
|---|---|---|---|
| audit-hub | 56,702 B | `fleet_audit_runs` | 2026-09-13T13:45:58Z |
| audit-hub | — | `feedback_probes` | 2026-09-13T13:46:06Z |
| companion-hub | 101,530 B | `companion_runs` (personal D1) | 2026-09-13T12:01:52Z |
| idea-hub | 146,817 B | `idea_proposals` | 2026-09-12T09:50:44Z |
| errata-hub | 750,226 B | `errata_watch` cursor | `last_email_id = 682`, fully consumed |

**Correct method:** a worker is a consolidation candidate only when its output
sink is dead AND there is no counter-evidence of use.

---

## 2. Confirmed duplicate — merge

### companion-hub + personal-companion

Two deploys of one codebase. 12 of 13 compared header lines are identical; the
only difference is the VERSION string.

| | companion-hub | personal-companion |
|---|---|---|
| worker.js | 101,530 B | 62,666 B |
| VERSION | `"v1.0.0"` | `"1.0.0"` |
| D1 | `PERSONAL` e8d6c61a-10b7-4086-b81e-9e6e85afa407 | same |
| R2 | `MEDIA` personal-media | same |
| service | `EMAIL` → qnfo-email | same |
| extra | `DDRIVE` d-drive | — |
| fleet_deploys since 09-10 | — | 30 attempts, 4 ok |

Identical constants: `MODELS` [kimi-k2.6, gpt-oss-120b, glm-5.3], `EMBED_MODEL`
bge-base-en-v1.5, `GEN_MAX_TOKENS 9e3`, `GEN_TIMEOUT_MS 9e4`,
`CRITIQUE_TIMEOUT_MS 3e4`, `EMBED_TIMEOUT_MS 3e4`, `SIM_THRESHOLD 0.9`,
`ACCEPT_FLOOR 5`, the same 16-entry `BANNED_MODELS`, the same `RHYTHM`, the same
14-entry `TOPICS`.

**Action:** pick one name, carry the `DDRIVE` binding over if used, retire the
other deploy. Verify `companion_runs` stops receiving duplicate runs.

---

## 3. Confirmed no-op scheduled work — retire or repair

`fleet_runs` ids 458–487:

| task | cron | result | fires/day |
|---|---|---|---|
| `demo-heartbeat` | `*/15 * * * *` | `{"type":"sql","rows":1,"sample":[{"beat":1}]}` — a literal `SELECT 1` | 96 |
| `systems-watch-hourly` | `9 * * * *` | 8 workflow steps, every step `"rows":0` | 24 |
| `demo-venue-radar` | `45 6 * * *` | `enabled=0`, `last_fired: null` | 0 |

`systems-watch-hourly` is described as *"systems watch: proactive degradation
alerts"*. The monitor is a no-op.

**Action:** retire `demo-heartbeat` and `demo-venue-radar`. Repair
`systems-watch-hourly`'s eight queries — it should be the control that catches
everything else in this document.

Orphan `fleet_tasks` (enabled=1, no `fleet_crons` row, no `fleet_runs` row):
`bench-arc-sample-01`, `bench-arc-10task`, `probe-qwen38`, `demo-fleet-census`.

---

## 4. Dead sinks — wire or retire

| sink | newest | age |
|---|---|---|
| `paper_index` | 2026-07-13 | 62.3 d |
| `analytics_daily` | 2026-07-15 | 60.6 d |
| `social_media_posts` | 2026-08-27 | 17.4 d (3 rows ever) |
| `errata_queue` | 2026-09-01 | 12.4 d (input-driven, cursor consumed) |
| `proofs` | 2026-09-04 | 9.1 d |
| `paper_explain_log` | 2026-09-11 | 2.0 d — **fires daily, writes nothing** |
| `subscriber_digest_runs` | never | 0 rows ever |
| `outreach_log` | 2026-09-02 | 11.2 d (expected: ACTIVATION_AT 09-15) |

None of `paper_index`, `analytics_daily`, `social_media_posts` is tracked by
`freshness_guard`.

---

## 5. Instrumentation defects that hide all of the above

1. **Trace ingest dead 75.1 h.** `trace_ingest_state.last_key` frozen at
   `workers_trace/20260910/…101640Z…`; `worker_logs` newest
   2026-09-10T11:17:40Z. No per-worker request/error evidence for 3 days.
2. **`freshness_guard` idle-suppression.** `outreach` (269.3 h vs 72 h) and
   `pipeline_status` (161.5 h vs 24 h) reported as **`idle`**, not `stale`. A
   `mode='event'` signal that stops emitting can never fail.
3. **`ai_model_health` split.** All 20 rows `status='ok'`, but 8 were last probed
   45.6–45.9 h ago against a 26 h threshold: qwen3-30b, gemma-4-26b, glm-5.2,
   qwen2.5-coder-32b, deepseek-r1-qwen-32b, glm-4.7-flash, llama-3.2-11b-vision,
   qwq-32b. `freshness_guard.amh_coverage` correctly says `8/20 stale`.
4. **`fleet_deploy_state`**: `enabled=0`, `auto_heal=0`, updated
   2026-09-13T14:23:10Z. Pre-disable: `qnfo-cloud-ops` 25 deploys / 0 ok.

---

## 6. Misconfigured binding — jnl-pipeline

`jnl-pipeline/wrangler.toml` binds `AUDIT` to
`8be80cdb-979d-401f-b3ab-6a16869473ec`. The canonical qnfo-audit id is
`35e2e573-92f3-46ac-83c6-22f6429fc5e5`, and `8be80cdb` is absent from
`audit_d1_databases` (which lists only 8 databases). Consequence: the worker
creates `jnl_records` and `jnl_polls` in a database no registry lists, and
neither table exists in qnfo-audit (`no such table: jnl_polls`). The
`[[kv_namespaces]]` binding `STATE` also has `id = "None"` as a literal string.

`jnl-pipeline/worker.js` is 108,292 B, VERSION 0.1.9, BUILD
`selfexclude-2026-09-10`, wrapping `jnlWatchMod` (Zenodo community
`87f14e85-7156-4146-84e9-9e3a11e29c1d`, PAGE_SIZE 25, MAX_PAGES 40, self-exclude
via ORCID 0009-0002-4317-5604). Substantial code, wrong binding.

**Do not merge.** Fix the binding.

---

## 7. Blocked queue

`version_queue`: 16 `published`, **1 `error`** — v2.0.1 → v2.0.2, DOI
10.5281/zenodo.22732639, created 2026-09-11 10:22:29, `updated_at`
2026-09-13 14:16:11 (retried hourly, failing each time). Matches issue 706
(`NL is not defined`). `cloud_ops_events` `kind='v2-drain'` n=23, newest
2026-09-13T14:16:11Z.

---

## 8. Do not merge

Event-driven workers where "fires daily" is the wrong test: `qnfo-pdf`,
`qnfo-gateway`, `qnfo-ai`, `calendar-api`, `qnfo-ipatent`, `qnfo-tools-mcp`,
`qnfo-agent-ws`, `qnfo-memory-mcp`, and the hub set in §1.

---

## 9. Execution order

1. Re-arm trace ingest (§5.1) — without it nothing else is measurable.
2. Repair `systems-watch-hourly` (§3).
3. Merge the companion pair (§2).
4. Fix `freshness_guard` idle-suppression and add the untracked sinks (§5.2).
5. Fix `ai_model_health` stale-ok (§5.3).
6. Retire the no-op crons and orphan tasks (§3).
7. Fix the `jnl-pipeline` binding (§6).

## 10. Limits

- The companion-duplicate claim rests on the header block where shared constants
  live, not a full-file diff; divergence deeper in the bodies is not excluded.
- "No sink writes" can mean a dead worker or a worker writing to a store not
  queried here (R2/Vectorize).
- 43 of 55 workers are unprobed (`probe:"api"`, healthy null) — unknown, not bad.
- `cf_analytics` by_worker covers 8 workers of 281,106 account requests.
- No cron trigger is declared in the hub `wrangler.toml` files although
  `fleet_status` reports a `scheduled` handler for each. Those tomls are
  documented incomplete mirrors of the deployed config, so this is reported, not
  proven.
