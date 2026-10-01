# qnfo-fleet-dashboard

ONE human page: https://fleet.qnfo.org/  answers "what do I have to do, and should I keep investing?" and nothing else (HUMAN-DASHBOARD-1 + INVEST-DECISION-1, v1.9.0).
Mirror: https://qnfo-fleet-dashboard.q08.workers.dev/

## The page
- Banner: `N things need you` / `Nothing needs you` / `Can't confirm` (a source could not be read, or system data is >60 min old; it never claims all-clear blind).
- One card per human action: what, why only you, what happens if you wait, what to do, link.
- Money and clock: AI spend 30d vs the $150 cap, days to the 2026-12-31 review gate, pageviews vs prior 30d, subscribers.
- One collapsed line for everything the system handles itself (red flags, drift, probes). It opens by itself only when an error has been unresolved past the 2h SLA.
- `/ops`, `/roi` and the old 9-panel failure inventory were folded in; `/ops`, `/roi`, `/api/roi` redirect (301) to `/`.
- The page is public and unauthenticated: third-party mail is shown as domain + count + age only, never an address or subject.

## Real-time
The queue is read live from D1 on every request and the page re-fetches `/?frag=1` every 10s (green/amber/red dot = how fresh the last update is, so a frozen page cannot pass as all-clear). System state is rebuilt on demand when >5 min old; money/return inputs are re-measured on demand when >5 min old (throttled to one run per 2 min) and by the */15 cron and the 10-min fleet-exec heartbeat. Cloudflare analytics and billing are themselves minutes behind; the page shows when each was measured.

## Keep investing? (INVEST-DECISION-1)
`decideInvestment` applies the rule in `impact_thresholds.review_gate_2026_12_31` (continue iff credibility_events>=2 OR confirmed_subscribers>=50 OR funding_secured, AND spend within the cap, judged 2026-12-31) to measured inputs and shows the trajectory:
CONTINUE (on track / at risk) | SCALE_BACK (cash over the cap; or at risk <=45 days out) | KILL (gate failed, or the shutdown_manifest early trigger fired) | UNKNOWN.
- ADVISORY: nothing here retires a worker, deletes data or raises a cap (AUTONOMY-DECISION-POLICY.md). `shutdown_manifest` stays the only retirement path.
- Cost basis is billing-API gross usage ("cash"). The gateway-metered figure is an estimated list cost (#1699) and can never trigger SCALE_BACK/KILL on its own.
- Facts no machine can measure are attested with evidence: `POST /api/decision/fact {"key":"credibility_events|funding_secured|revenue_30d_usd","value":..,"evidence":".."}` (x-loop-token). At the gate date with nothing ever attested the verdict is UNKNOWN (a human call), never KILL by omission.
- `GET /api/decision` (`fleet-decision/v1`) returns verdict, reasons, what flips it, levers, inputs and feed status.

### Feeds it publishes to (idempotent; installed by the */15 cron and `/api/decision?refresh=1`)
| Consumer | What it reads | Written by this worker |
|---|---|---|
| qnfo-fleet-control `evaluateMetricTriggers` (hourly) | `metric_registry` + `analytics_metric_triggers` | metrics `invest_decision_level` (0 continue, 1 at risk, 2 scale back, 3 stop, -1 unknown), `human_actions_open`, `human_wait_oldest_days`; triggers: level>=2 files an `agent_issues` row, oldest human wait>=7d raises a digest alert |
| qnfo-ops (`ops_issues_list`, `unified_open_issues`) | `agent_issues` | one deduped `INVEST-DECISION-*` issue when the verdict becomes SCALE_BACK / KILL / gate-due |
| fleet-exec (`*/10`) | `fleet_tasks` + `fleet_crons` | task `invest-decision-heartbeat` (http GET `/api/decision?refresh=1`); `fleet_runs` keeps the verdict trail; definition mirrored in `docs/fleet-tasks-canonical.json` |
| qnfo-autopilot `thinkLoop` | `metric_registry.invest_decision_level` | paused (reversible T1 spend lever) while level>=2 and fresh (<3h) |
| autonomy scorer / staleness views | `metric_registry` (cadence `*/15`) | a silent publisher shows as a stale metric |
| audit trail | `invest_decision_log` | a row on every change of verdict/risk/basis and at least daily |

## What counts as "needs the human" (docs/AUTONOMY-DECISION-POLICY.md T2)
| Source | Rows that appear |
|---|---|
| `human_actions` (D1 qnfo-audit) | the canonical queue; any worker or session files one |
| `v_waiting_on_human` | governance register rows owned by user/mixed |
| `gtd_register` | open lines owned by user/mixed |
| `fleet_issue_dispatch` | `exec_state='needs-human'` (issue loop found no safe autonomous action) |
| `code_tasks` | `status='needs_human'` (code loop could not verify / no PR credential) |
| `v_email_human_pending_v2` | inbound mail from real people |
| `shutdown_manifest` | owner-confirm gates after phase 1 fires; gates due within 45 days |

File or clear an action from any worker/session (header `x-loop-token`, secret `LOOP_TOKEN`):

    POST /api/human {"op":"add","slug":"cf-access-rollout","title":"...","why":"...","default":"what runs meanwhile","action":"...","url":"https://...","sev":"urgent","due":"2026-10-20"}
    POST /api/human {"op":"resolve","slug":"cf-access-rollout","resolution":"<evidence>"}

`GET /api/human` returns the same view as JSON (`fleet-human/v1`).

## Machine endpoints (unchanged; consumed by qnfo-fleet-control and qnfo-autopilot)
`/api/state`, `/api/actions`, `/api/loop`, `/api/loop/sync`, `/api/loop/execute`, `/api/integration`, `/api/refresh`, `/health`.

## Refresh and storage
- Cron `*/15`: rebuilds system state, runs the issue loop, and runs `governanceSnapshot` (GraphQL spend/pageviews, survival gates).
  `governanceSnapshot` keeps the write-backs the old root page did on view: `impact_thresholds.state` (GATE-STATE-LIVE-1) and `survival_state`.
- State cached in qnfo-audit D1 `fleet_dashboard_state`; money snapshot in `fleet_loop_meta` key `human_gov_snapshot`; queue in `human_actions`.
- Secret `CF_TOKEN` (account analytics read); `LOOP_TOKEN` guards the POST endpoints.
