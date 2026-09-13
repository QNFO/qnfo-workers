# BIG PICTURE + ACTION PLAN — 2026-09-13T14:30Z

Supersedes the prose in the 12-document audit and the ~195 workspace audit artifacts for 2026-09-13.
All numbers below are live tool output from this session, not carried forward.

## 1. BIG PICTURE IN ONE PARAGRAPH

The fleet is not down. It is **frozen**. 55 workers are deployed, the ones that are probed answer, and
spend/error rates are low ($12.45 / 1.13M neurons / 187 errors in 281,106 invocations over 30d = 0.067%).
What is broken is the *ability to change anything* and the *ability to see anything*.

The deploy plane's auto-heal was switched OFF at 2026-09-13T14:15:02Z
(`fleet_deploy_state.auto_heal` -> '0', `enabled` -> '0', both rows updated 14:23:10Z) to stop one
worker's hourly downgrade loop. Since the last successful deploy (qnfo-backlog-exec 1.2.7 -> 1.2.8 at
14:02:44Z) nothing has shipped. Every known code fix is therefore staged-but-unshippable.

In parallel the observability plane is dead: trace ingest cursor frozen since 2026-09-10T10:15:58Z,
43 of 55 workers unprobed, heartbeat table holds 1 row, cron registry holds 4 rows. The fleet's own
instruments cannot tell you whether a fix worked.

Meanwhile the *ticketing* loop runs hotter than the *fixing* loop: 55 new agent_issues filed in the
last 3 hours, and 4-5 different "open backlog" numbers coexist across parallel ledgers.

## 2. WHERE THE FLEET ACTUALLY STANDS (verified this session)

| surface | value | source |
|---|---|---|
| workers deployed / probed healthy | 55 / 12 | fleet_status 14:25:59Z |
| agent_issues open | 39 (28 high, 10 med, 1 low) | qnfo-audit agent_issues |
| issue_ledger open | 305, rising (247 -> 261 -> 266 -> 270 -> 305) | fleet_audit_runs 09-12..09-13 |
| agent_issues filed in last 3h | 55 | qnfo-audit |
| deploy auto-heal | OFF (`auto_heal=0`, `enabled=0`) | fleet_deploy_state 14:23:10Z |
| last successful deploy | qnfo-backlog-exec 1.2.7 -> 1.2.8, 14:02:44Z | fleet_deploys id 75 |
| failing deploys today | personal-companion x8 (hourly, all ok=0), qnfo-cloud-ops x2, qnfo-observability x1 | fleet_deploys |
| trace ingest | frozen since 2026-09-10T10:15:58Z; cursor reset did NOT fix it (issue 702 reopened) | trace_ingest_state, issue 702 |
| alerts, last 24h | 4 rows (2 error, 2 warning) — the "802 critical" storm is historical, not live | alerts |
| endpoint self-telemetry 24h | 10,338 calls / 872 failures (8.4%); web_fetch 355, ops_d1_query 273, github_file_write 84 | telemetry_report |
| email | 682 total, 23/24h, 289 sent, 45 spam | email_stats |

## 3. ACTION PLAN

Ordered by leverage. The actuator is named because the actuator is the binding constraint.

**T0 — restore the ability to fix anything: unfreeze the deploy plane, deliberately.**
`auto_heal=0` was a stopgap aimed at ONE worker. A global freeze also stops the ~5 deploys/day that
were working. Correct end state: `auto_heal=1` plus a per-worker no-downgrade exclusion for
personal-companion.
Actuator: D1 write on qnfo-audit.fleet_deploy_state for the two state rows (available from this
endpoint); the per-worker exclusion lives in qnfo-fleet-control source and needs a qnfo-canonical R2
write + deploy (NOT bound to this endpoint).
Closes: nothing else can close until this is decided.

**T1 — ship the three dead-consumer fixes (all blocked only by T0).**
- qnfo-research-exec `NL is not defined` — version_queue v2-drain dead since 2026-09-11T12:41Z (issue 706).
- qnfo-cloud-ops canonical SyntaxError at worker.js:1:2 — 25 attempts, 0 ok, hourly.
- qnfo-observability canonical 1.1.4 rejected while the repo fix is v1.1.6 single-module.
Actuator: qnfo-canonical R2 put + deploy. Not available from this endpoint.

**T2 — repair the instruments before trusting any of them.**
Trace ingest cursor; the 43-worker probe gap; the 1-row heartbeat; the 4-row cron registry; the 91% of
invocations with no worker attribution. Until this is done every "is it fixed?" answer is unverifiable.

**T3 — collapse the ledgers. One ledger, one number.**
305 (issue_ledger) vs 39 (agent_issues) vs four other reported values; 55 tickets in 3h; ~195 audit
artifacts; 7 FINAL/CLOSING labels. Filing more tickets before this is net-negative.

**T4 — research pipeline.**
Terminal-failure-never-materializes re-pick loop; 496 malformed Zenodo rows; research-daily-brief
arXiv 429 with no canonical to patch.

## 4. WHAT CHANGED THIS SESSION

Reads and verification only. No deploy, no canonical write, no production mutation by this endpoint.
Two actions are gated and were NOT taken: `ops_issue_run` (needs explicit "drain it"), and reversing the
`auto_heal=0` freeze (a deliberate safety action by a sibling session — not silently undone).

## 5. FAILURE MODES / OPEN CONTRADICTIONS

1. **The causal story for the stopped downgrade loop fails on ordering.** personal-companion's last
   attempt is 13:01:23Z and there is no 14:01 attempt, but `auto_heal` was only set to 0 at 14:15:02Z —
   *after* 14:01. The freeze cannot explain the missing 14:01 slot. Something else stopped it.
2. **A prior claim that "the D1 write is blocked" is refuted.** ops_d1_write executed against
   qnfo-audit.fleet_deploy_state at 14:15:02Z (status ok). What is genuinely unbound is the
   qnfo-canonical R2 bucket.
3. **The denominator is unreliable.** 43/55 workers are unprobed, so "12 healthy" describes the probe
   set, not the fleet.
4. **cf_analytics attributes only 23,971 of 281,106 invocations** to a worker name; per-worker
   conclusions are unsupported.
5. **The 39 vs 305 gap was not reconciled here.** They are different tables; neither is asserted correct.
6. Only 30,000 of 75,875 bytes of qnfo-fleet-control/worker.js were read, so the exact `enabled`/
   `auto_heal` gating logic is inferred, not read.
