# qnfo-fleet-dashboard

ONE human page: https://fleet.qnfo.org/  answers "what do I have to do?" and nothing else (HUMAN-DASHBOARD-1, v1.8.0).
Mirror: https://qnfo-fleet-dashboard.q08.workers.dev/

## The page
- Banner: `N things need you` / `Nothing needs you` / `Can't confirm` (a source could not be read, or system data is >60 min old; it never claims all-clear blind).
- One card per human action: what, why only you, what happens if you wait, what to do, link.
- Money and clock: AI spend 30d vs the $150 cap, days to the 2026-12-31 review gate, pageviews vs prior 30d, subscribers.
- One collapsed line for everything the system handles itself (red flags, drift, probes). It opens by itself only when an error has been unresolved past the 2h SLA.
- `/ops`, `/roi` and the old 9-panel failure inventory were folded in; `/ops`, `/roi`, `/api/roi` redirect (301) to `/`.
- The page is public and unauthenticated: third-party mail is shown as domain + count + age only, never an address or subject.

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
