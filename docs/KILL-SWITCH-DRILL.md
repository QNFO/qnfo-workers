# Kill-switch drill protocol (BP26-LEASES-KILLSWITCH-1)

Charter pillar: autonomy. Practice (BP26 catalogue item 3.5, OWASP ASI08 and ASI10): a global kill-switch flag every loop reads, exercised monthly, with the
proof that every loop stopped and then resumed. Metric `kill_switch_test_age_days` (target 30 or fewer) reads the newest row of `kill_switch_tests` with
`mode = 'live'` and `outcome = 'pass'`; it stays UNMEASURED while no such row exists.

## State read on 2026-10-26 (what exists, what does not)

- No global kill switch exists. `ops_config` holds no key with halt, pause, kill, freeze, panic, emergency, stop, circuit or breaker in its name, and
  `pipeline_flags` holds one per-loop flag only: `social_paused` (qnfo-social). A drill today would have nothing to flip, so no honest age exists and none is
  written (a number made up to look measured is the failure this metric guards against).
- Exists and stays: the loop breaker (LOOP-BREAKER-1, `scripts/loop_breaker_runner.py`: a signature that repeats 3 times in 24 h files an issue), the deploy and
  secret locks, the work-claim ledger (expired claims are closed by qnfo-deploy-guard 1.3.34, PR 4729), the per-loop budgets of `fleet_budget`.
- Missing and owned (code-tasks in the issue): the flag and its readers, fencing tokens on the leases, per-iteration caps, the monthly schedule.

## The switch to build (contract)

`ops_config.fleet_kill_switch` with value `off` (default) or `on`, read by a single helper per worker (`killSwitchOn(env)`, one D1 read cached for 30 s).
While `on`:
1. no external side effect starts: publish, send (mail, post, DM), deploy, merge, secret write, paid model call outside the cheapest free model;
2. reads, probes, metric refreshes and the heartbeat keep running (the fleet must be able to see itself and to turn the switch off);
3. work in flight finishes its current step and stops at the next step boundary, recording `kill-switch observed` (a `cloud_ops_events` row of kind
   `kill-switch.observed` carrying the loop name) once per loop per switch change.
Readers to cover first, in order of blast radius: qnfo-ops (tool executor and `/ops/deploy`), qnfo-code-orchestrator (the code loop), qnfo-fleet-control
(every tick loop), qnfo-social, qnfo-email-orchestrator, qnfo-research-exec, qnfo-cloud-ops (dispatchers), qnfo-github-steward.

## The drill (monthly, fleet-run, never by a session)

A drill pauses live loops for at most 10 minutes. That is a reversible fleet decision (DECISION-AUTOPROCEED-1): it is recorded in `decision_log` with its revert
path before it starts, and the fleet runs it, not an owner step.

Preconditions: no deploy lock held (`deploy_locks` empty of live rows), no publication SLA window open (the q08 desk window around 09:00 CET), the audit
chain verifies (`audit_chain_verify` = 1), `loops_expected` read from `GET https://qnfo-fleet-control.q08.workers.dev/loops` (LOOP-WATCH-1).

1. T0: set the flag to `on` (one write by the fleet, through qnfo-fleet-control or the qnfo-ops tool, never by hand in D1).
2. By T0 + 2 ticks (10 minutes at most) every expected loop must show a `kill-switch.observed` event, and `agent_actions` (BP26-AUDIT-LOG-1) must hold no row of kind
   publish, send, deploy or secret-write with a time after T0 + 2 ticks: the audit log is the evidence that nothing acted.
3. T1 (at most T0 + 10 minutes): set the flag to `off`.
4. By T1 + 2 ticks every loop must show a heartbeat newer than T1 and a normal tick result: resumed.
5. One append-only row in `kill_switch_tests`: `flag`, `mode = 'live'`, `loops_expected`, `loops_observed_stopped`, `loops_observed_resumed`, `outcome`
   (`pass` only when both counts equal `loops_expected`, otherwise `fail`), `evidence` (the event ids and the count of side-effect rows after T0).
6. A `fail` files one `agent_issues` row per loop that did not stop or resume, with a `code-task:` line for its worker; the next drill is due within 7 days.

Rollback at any point: set the flag to `off`. If the flag cannot be written, the loops' own breaker and the deploy-guard lease expiry (30 to 120 minutes) bound the
damage; a failed write is itself a `fail` row.

Dry-run mode (`mode = 'dry-run'`) reads the flag in every reader without flipping it and records the reader count; it never counts toward the metric.

## Why the metric is not given a number today

`kill_switch_test_age_days` is "days since the switch was last exercised and every loop was seen to stop and resume". With no switch there is no last exercise, so the
value is undefined, not zero. `scripts/bp26_auditchain.py` writes nothing for it, records the reason in `bp26_probe_results`, and the practice issue stays open with the
build tasks above until a live drill passes and the first row exists.
