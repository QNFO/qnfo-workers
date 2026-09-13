# Fleet audit 2026-09-13 — ADDENDUM 2: new findings + two more self-corrections

Supplements `docs/FLEET-AUDIT-2026-09-13-stale-workers.md` (`ddb195af`) and
`docs/FLEET-AUDIT-2026-09-13-CORRECTIONS.md` (`b5556557`). Runtime-inert (`docs/` is never
resolved by the deployer's `canonical()`).

## N1. NEW P0 — a second thrash loop: self-rewrite yields nothing, ever

`self_rewrite_state`: **68 rows, 9 distinct workers, 100% `reverted-or-rejected`. Zero
successful rewrites in the table's entire history.**

| worker | attempts | window | detail |
|---|---|---|---|
| **jnl-referee** | **48** | 2026-09-11T14:07:37Z → **2026-09-13T14:06:15Z (still firing hourly)** | `snapshot read 404` |
| obsidian-writer | 4 | 09-10T18:21 → 09-11T09:05 | `PUT 400 10021 Uncaught TypeError: "" is not a function` |
| qnfo-ai-search | 3 | 09-10T22:05 → 09-11T08:06 | same parse rejection |
| qnfo-citation-watch | 3 | 09-10T20:05 → 09-11T06:05 | same |
| qnfo-email | 3 | 09-10T21:06 → 09-11T07:06 | `PUT 400 100329 Binding 'AUDIT_DB' of type 'd1' requires an ES module Worker` |
| qnfo-lifecycle | 3 + 1 | 09-10T19:06 → 09-11T10:06 | `100329 Binding 'AI' of type 'ai' requires ES module` + `SyntaxError: Unexpected end of input` |
| calendar-api | 1 | 09-11T11:06 | parse rejection |
| jnl-watch | 1 | 09-11T13:06 | `SyntaxError: Unexpected identifier 'https'` |
| personal-events-radar | 1 | 09-11T12:06 | `SyntaxError: Unexpected end of input` |

Two distinct defects:
1. **No circuit breaker.** 48 identical failures on `jnl-referee` should trip after 3. The
   loop retries hourly, forever, against a snapshot that does not exist.
2. **`jnl-referee` is a shadow worker.** It is **not** in the 55-worker `fleet_status`
   roster and **not** in `service_registry` (only `errata-hub` and `jnl-pipeline` match
   `jnl`/`referee`). A two-day, 48-failure loop is therefore invisible to every monitor in
   the fleet.

## N2. There is NO per-target deploy exclusion — so re-enabling `auto_heal` is UNSAFE

`fleet_deploy_state` (46 keys) contains only `enabled`, `auto_heal`, and `scanerr:<worker>`
diagnostic strings. **No allowlist, no denylist, no per-target toggle.**

Consequence: flipping `enabled`/`auto_heal` back to `1` restores healing for 9 drifted + 9
ahead + 4 stale-canon workers, **but also resumes the two loops that were switched off** —
including the one that actively **downgraded** `personal-companion` v1.1.0 → v1.0.0. With no
exclusion key, that downgrade risk cannot be scoped.

**Recommendation: do NOT flip the flag yet.** The correct fix is a target allowlist (or
backoff) in `qnfo-fleet-deploy`, then re-enable. I am stating this as a judgment with the
counter-argument attached: leaving the healer off means *no* worker reconciles, and drift
now accumulates unopposed — that cost is real and grows daily.

## C12. CORRECTION — `demo-heartbeat` is a liveness probe, not dead weight

The parent audit listed `demo-heartbeat` (`SELECT 1 AS beat`, ~480 runs/day) as the prime
"firing and doing nothing" candidate. **Deleting it would be a mistake.** It is the only
writer to `fleet_runs`, and `freshness_guard` tracks `fleet_runs` as a `heartbeat` signal
(threshold 24h). Remove it and `fleet_runs` goes stale, tripping `WATCH:fleet-runs-stall`.
Its value is proving the scheduler executes; the waste is the `*/15` frequency. **Fix:
reduce to hourly, do not delete.**

## C13. CORRECTION — `systems-watch-hourly` "all steps rows: 0" is NOT proof of breakage

I claimed the 8 steps returning `rows: 0` meant it "cannot alert on anything". That was
overstated. Each step is `INSERT OR IGNORE ... SELECT ... WHERE (<threshold>) AND NOT
EXISTS (recent alert)`. **Zero rows is the correct no-alert outcome**, not a failure. Live
proof it works: `proactive-alert` events with status `err` exist (`n=8`, last
2026-09-13T11:09:59Z). The watch is functioning. Its real defect is narrower: the dedupe
compares ISO-8601 (`...T14:09:06Z`) against `datetime('now')` space format
(`2026-09-13 11:09:06`), and `'T'` > `' '` in byte order, so suppression is more aggressive
than the 3-hour window intends.

## N3. The deployer still tracks ~19 phantom workers (corroborates #722)

`fleet_deploy_state.scanerr:` keys name workers absent from both the 55-worker roster and
the registry: `fleet-executor`, `fleet-scheduler`, `jnl-reviser`, `jnl-zenodo`,
`job-market-watch`, `personal-life-indexer`, `personal-life-maintain`, `personal-life-search`,
`qnfo-arxiv-radar`, `qnfo-citation-watch`, `qnfo-container-executor`, `qnfo-errata-publish`,
`qnfo-errata-respond`, `qnfo-errata-watch`, `qnfo-idea-factory`, `qnfo-research-radar`,
`qnfo-scorecard`, `qnfo-thread-ingest`, `qnfo-wrangler-test`.

Stale-canon flagged (7): obsidian-writer, osf-integrity-check, personal-life-maintain,
qnfo-arxiv-radar, qnfo-research-radar, qnfo-twin-maintain, research-daily-brief.
No-canon (3): qnfo-container-executor, qnfo-scorecard, qnfo-wrangler-test.

This is the source of the three-way roster disagreement: deployer ~80, `service_registry`
55, `fleet_status` 55.

## N4. Fix surface, stated precisely

Executable from qnfo-ops: D1 reads/writes (audit + 7 others), KV, R2 (releases/audit/
backups/skills only), GitHub repo files, workspace.
**Not executable: worker deploys, `qnfo-canonical` R2 writes, branch creation, CF API
mutation, D1 `agent_issues` closure by mechanism.**

So of the P0/P1 list, exactly **zero** can be closed from here. Everything found in this
audit needs either a deploy-capable client or an operator decision (N2). Filing tickets is
possible; repairing is not — and per C4/C5 of the corrections file, filing more tickets
makes the headline metric worse without closing anything.
