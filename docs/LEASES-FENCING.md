# Leases, fencing tokens, caps, breakers and the kill switch (BP26-LEASES-KILLSWITCH-1)

Charter pillar: autonomy. Program QNFO.OPS, project BP26.AGENTOPS. agent_issues 1000361, GitHub 4457. Written 2026-10-28.

## Guidance (OWASP agentic top 10 ASI08 cascading failures and ASI10 rogue agents; Cloudflare Durable Objects docs, read 2026-10-28)

- A lease needs a TTL, a heartbeat and a **fencing token**: a number that grows with every new holder and is checked by the resource on each write, so a holder that
  paused past its TTL cannot overwrite the work of the next holder (Kleppmann, "How to do distributed locking").
- Durable Objects give single-threaded, strongly consistent per-key state and alarms, which is why the catalogue names one DO per work item as the lease authority.
- Loops need caps per iteration (steps, tokens, wall-clock, money), a circuit breaker (N consecutive failures pause the loop and file an issue), a global kill switch
  that every loop reads and a monthly test that proves it works. Side effects carry idempotency keys.

## What the fleet had and what this adds

| Practice | State 2026-10-28 |
|---|---|
| Lease with TTL | qnfo-deploy-guard `deploy_locks` (D1 row with expiry) behind `/work-lock`, `/lock`, `/secret-lock`; expired claims are swept (LEASE-EXPIRY-SWEEP-1); metric `orphaned_leases` = 0 |
| Heartbeat | renewal with the token extends the TTL |
| **Fencing token** | NEW (deploy-guard 1.4.0): `work_claims.fence`, next number per path on every fresh claim, returned by acquire and renew; `POST /work-lock/check {key, token, fence}` is valid only for the live token and live fence |
| **Global kill switch** | NEW: `ops_config.fleet_kill_switch` (`off` default). deploy-guard refuses new claims, renewals, deploy leases and secret leases with 503 `kill-switch` while `on` and writes `kill-switch.observed`; `GET /kill-switch` reads it |
| **Tested kill switch** | NEW: `cf-ops-actions` action `kill-switch-drill` flips it on for under 10 minutes, checks the refusals and the event, flips it off in every case, checks resumption and appends `kill_switch_tests` (mode live). Metric `kill_switch_test_age_days` reads the newest live pass |
| Circuit breaker | LOOP-BREAKER-1 (`scripts/loop_breaker_runner.py`: a signature that repeats 3 times in 24 h files an issue). Not yet "N consecutive failures pause the loop" |
| Caps per iteration | `fleet_budget` caps and the code loop's per-tick budget exist; steps, tokens, wall-clock and EUR per iteration are not uniform. Roadmap row `ROADMAP-1: QNFO.OPS BP26-KILLSWITCH-CAPS-1` |
| Idempotency keys on side effects | per worker, not audited fleet-wide; open |
| Durable Object lease authority | not built: the D1 lease with a fence number gives the same guarantee for the current volume (tens of claims an hour); revisit when a lease needs sub-second handoff |

## How a writer uses the fence

```
acquire -> {token, fence: 7}
... work ...
POST /work-lock/check {key, token, fence: 7}   # before each write that matters
200 {valid: true}  -> write
409 {valid: false, reason: "stale fence"|"token does not hold a live claim"} -> stop
503 {reason: "kill-switch"} -> stop at this step boundary
```

## Honest limits

- The kill switch is read by qnfo-deploy-guard only so far. That stops every deploy, secret write and session claim, but not a loop that never asks for a lease
  (the tick workers, qnfo-social posts, mail). The drill states this in its evidence (`readers` and `readers_pending`), and each further worker is added to `KS_READERS`
  in `scripts/cf_ops_actions.py` in the change that teaches it the flag (roadmap row `ROADMAP-1: QNFO.OPS BP26-KILLSWITCH-READERS-1`). `kill_switch_test_age_days` therefore
  measures the drill of the readers that exist, not "every loop"; the issue stays open until the pending readers are done.
- The fence is advisory until writers call `/work-lock/check`; scripts/ and the code loop adopt it as they are touched.
- A stuck-on switch blocks deploys. Revert: set `ops_config.fleet_kill_switch` to `off` (qnfo-ops D1 tool or the drill action); deploy-guard's cache is 30 seconds.
