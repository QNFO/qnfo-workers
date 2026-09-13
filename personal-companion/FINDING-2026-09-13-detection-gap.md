# Finding — why nothing caught any of this: 78% of the fleet is unprobed, and none of today's defects are in the backlog

Date: 2026-09-13. Author: qnfo-ops. Measured this session via `fleet_status`, `ops_issues_list` and
`telemetry_analyze`.

## 1. Only 12 of 55 deployed workers are health-probed

`fleet_status` returns `deployedCount: 55`, `healthyCount: 12`. The other **43** carry
`healthy: null, probe: "api"` — meaning they were **enumerated from the Cloudflare API** (name,
`modified_on`, `handlers`) but **never HTTP-probed**. They are not known-unhealthy; they are
**unknown**.

Among the 43 unprobed:

| worker | modified_on |
|---|---|
| `personal-companion` | 2026-09-12T11:32:13Z |
| `qnfo-fleet-control` | 2026-09-12T10:28:24Z |
| `qnfo-ops` (this endpoint) | 2026-09-12T15:05:12Z |
| `qnfo-cloud-ops` | 2026-09-12T09:28:26Z |

**All four workers named in today's findings are unprobed.** `personal-companion` last modified
2026-09-12T11:32Z — consistent with v1.1.0 landing that morning, which is also when the deploy loop
began targeting `1.0.0`.

This is the structural reason the deploy loop's 18-hour failure streak went unnoticed: the loop
targets two workers (`personal-companion`, `qnfo-cloud-ops`), and **neither is health-probed**. A
cron failing 14 times in a row produced no health signal, so nothing escalated it.

## 2. None of today's defects are in `agent_issues`

`ops_issues_list` (open, 25 rows) contains **no** issue about the reading gate, the companion voice
defect, the standing-filter gap, or the deploy downgrade loop. The open backlog is dominated by
model-health and calibration noise:

| category | count (approx) |
|---|---|
| `model-health` / `ai-calibration` | 17 |
| `research-pipeline` | 2 |
| `infra` | 1 |
| `backlog` | 1 |
| `fleet-self-improve` | 1 (`SOCIAL-CHECKER-FAILOPEN`, 676) |

So the eight artifacts committed today are **documentation with no ticket behind them**. Nothing in
the fleet will pick them up. `qnfo-ops` has no insert tool, so it could not file them even had it
wanted to — the same gap the earlier session recorded.

## 3. The self-heal analyzer does not see them either

`telemetry_analyze(hours=6)`: `scanned: 9`, `persistent: []`, `recovered: 7`, `autoResolved: 1`,
**`filed: 0`**, `alreadyOpen: 1`.

Its predicate is "≥2 errors with no success since the last error" on **this endpoint's own tool
calls**. Today's defects are not tool failures — they are content and deployment defects in other
workers — so the analyzer is structurally blind to them. It reported a clean bill of health
(`filed: 0`) on a day that produced a live downgrade loop.

**That is the same defect class as everything else found today, one level up: a self-improvement
loop reporting health on evidence that cannot contain the failure.**

## 4. What this implies

The fleet's three detection layers each miss this class:

| layer | why it missed |
|---|---|
| health probing (`fleet_status`) | 43/55 workers unprobed, including both deploy-loop targets |
| backlog (`agent_issues`) | no ticket exists; no insert path from this endpoint |
| self-heal (`telemetry_analyze`) | scoped to this endpoint's own tool errors only |

Adding a ticket would help, but the durable fix is **probing `personal-companion` and
`qnfo-fleet-control`** — the two workers whose behaviour matters most right now are the two that
nothing is watching.
