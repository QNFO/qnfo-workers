# SLOs, error budgets and automatic postmortems (BP26-SLO-ERROR-BUDGETS-1)

Charter pillar: autonomy. Program QNFO.OPS, project BP26.AGENTOPS. agent_issues 1000357, GitHub 4453. Written 2026-10-28.

## Guidance applied (Google SRE book and workbook, "Implementing SLOs")

- An SLI is a ratio of good events to valid events; an SLO is a target for it over a window; the error budget is `1 - SLO` of the events in the window.
- Spent budget changes behaviour: while it is spent, change that is not about reliability waits. A postmortem is blameless, has a timeline, a root cause and
  actions with owners, and is written for every incident that burns budget or is user-visible.

## What exists

| Piece | Where |
|---|---|
| SLI: one availability sample per public HTML host per runner pass (answer 2xx, 3xx, 401 or 403 in under 5 s) | `scripts/bp26_web.py` > `bp26_probe_results`, subject `avail:<host>` |
| SLO per surface (13 hosts): objective 0.995 over 28 days | `slo_definitions` (migrations/2026-10-28-bp26-slo-budgets.sql) |
| Error-budget state per surface, hourly: samples, bad, attainment, share of budget spent, `ok` / `warn` (50 percent) / `spent` (100 percent) | `slo_budget_state`, written by `scripts/bp26_slo.py` |
| "Budget spent" signal | `ops_config.slo_budget_spent` (comma list, empty when none) |
| Incidents: availability episodes (consecutive failed samples) and control-plane canary reverts or failures | `incidents` |
| Automatic blameless postmortem per incident: timeline, root-cause class the evidence supports, contributing facts, actions; an episode of two or more samples or on a spent surface files `SLO-POSTMORTEM-ACTION-1 <surface>` in `agent_issues` | `postmortems` |
| Metric `slo_attainment_28d_min` (lowest 28-day attainment, target 0.995 or more) | `scripts/bp26_web.py` (unchanged) |
| Metric `postmortem_coverage` (incidents judged in 30 days with a completed postmortem within 72 h / all, target 1.0) | `scripts/bp26_slo.py` |

## State when this landed (2026-10-28, measured)

`slo_attainment_28d_min` read 0.7273: `travel.q08.org` answered 24 of 33 samples, `qnfo.org` 30 of 33. Those are real failures, and the first pass of the
collector turns each failure episode into an incident with a postmortem. Incidents that closed more than 72 hours before the first pass were not written up in
time, so `postmortem_coverage` can read below 1.0 until they leave the 30-day window; that is the honest reading and is not corrected by backdating.

## Limits and what is next

- Only availability has recorded history. Latency and freshness SLIs (the q08 desk published by 09:00 CET) are not defined yet because nothing records them; they are
  added to `slo_definitions` when a producer exists. The `q08-research-desk-freshness` SLI is filed as roadmap row `ROADMAP-1: QNFO.OPS BP26-SLO-FRESHNESS-1`.
- "The merge lane takes reliability changes only when a budget is spent" is the lane's decision in `qnfo-fleet-control` (claimed by the code loop at the time of writing):
  roadmap row `ROADMAP-1: QNFO.OPS BP26-SLO-MERGE-LANE-1` carries the `code-task:` line; the flag it reads is live.
- Samples are hourly: an outage shorter than the gap is invisible, and the root-cause class is what the sample detail shows (timeout, TLS, 5xx, 4xx), not a human diagnosis.
