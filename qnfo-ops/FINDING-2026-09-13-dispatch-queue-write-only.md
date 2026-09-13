# FINDING — the remediation dispatch queue is write-only (5 exec attempts across 34 items)

Date: 2026-09-13 (~15:20Z). The mechanical cause of the repair bottleneck.

## Measurement

`fleet_issue_dispatch`: **34 rows, all `state='queued'`** — the state machine never advances past
`queued`.

| `exec_state` | n | total `exec_attempts` | oldest |
|---|---|---|---|
| **NULL (never executed)** | **9** | **0** | 2026-09-12T11:14:31Z |
| `executed` | 10 | 2 | 2026-09-12T09:47:19Z |
| `needs-human` | **11** | **0** | 2026-09-12T09:47:18Z |
| `no-action` | 4 | 3 | 2026-09-12T09:47:23Z |

**Total execution attempts: 5 across 34 dispatches.** 33 of 34 have a GitHub issue number.

## Executed ≠ repaired

`exec_result` for the `executed` rows:

```
queue-drain   -> {"ok":true,"worker":"qnfo-research-exec","version":"0.8.1","drained":[]}
queue-drain   -> {"ok":true,...,"drained":[]}
chain-produce -> {"ok":true,...,"out":{"status":"ok","claimed":0}}
chain-produce -> {"ok":true,...,"out":{"status":"ok","claimed":0}}
issue-triage  -> kaizen report generated (26088ms)
```

Every `queue-drain` returned **`drained: []`**; every `chain-produce` returned **`claimed: 0`**.

## E1 was detected and queued 27h before this audit

`fleet_issue_dispatch` `iss-98f1c548`, `integration-chain`, action `chain-produce`, created
**2026-09-12T11:14:34.454Z**, `exec_state: NULL`, `exec_attempts: 0`:

> `"Integration chain Telemetry (trace -> worker_logs): warn - trace rows 24h=0 (components may
> probe green)"` — remediation: *"Run the chain's producer; a green component feeding an empty
> sink means the wiring is broken - repoint the stage."*

**The fleet identified the exact defect this audit proved, 27 hours earlier, with a remediation,
and never executed it.** `fleet_issue_log`: 94 consecutive occurrences (2026-09-12T11:14:27 →
2026-09-13T14:16:36).

| dispatch | subject | finding | state |
|---|---|---|---|
| `iss-98f1c548` | Telemetry chain, trace rows 24h=0 | **E1** | queued, 0 attempts |
| `iss-cac511bc` | AI model health, 5 degraded | **E5** | queued, 0 attempts, ×86 |
| `iss-1eb53b62` | Research intake, untriaged=496 | E4 | queued, 0 attempts, ×91 |
| `iss-13152cf9` | outreach_queue stale | outreach staleness | queued, 0 attempts, ×94 |
| `iss-313bc84c` | Research execution, published 7d=0 | E3 class | queued, 0 attempts, ×94 |

## The 11 `needs-human` items — zero attempts each

| action | n | subjects |
|---|---|---|
| `gateway-classify` | 6 | "Ops AI gateway (24h)": 3→18 failed (ok=0), avg 43,876–48,914 ms |
| `model-fallback-pin` | 3 | AI model health: 24 models, 5 not-ok |
| `worker-rollback` | 1 | "1 worker(s) with 24h errors: qnfo-fleet-dashboard(3)" |

## `fleet_issue_loop` corroborates

34 rows; **26 with `miss_streak > 0`, max 93**; oldest close 2026-09-12T10:31:02Z.

## Conclusion — the repair chain, measured

| stage | verdict |
|---|---|
| detect | **works** — 94 consecutive detections with remediation text |
| queue | works — 34 items, 33 with GitHub issues |
| execute | **near-nil** — 5 attempts / 34; 9 never executed; 11 `needs-human` |
| repair | **fails even when executed** — `drained: []`, `claimed: 0` |
| deploy | 85% failure (23/27 today); 9 workers deployed-ahead of a stale canonical |

This is **upstream of** the deploy bottleneck: the deploy path can only fail on work that reaches
it, and almost nothing does. It also reframes the audit — these were not unknown defects, but
defects already detected, queued, remediated on paper, and filed as GitHub issues, none of which
executed.
