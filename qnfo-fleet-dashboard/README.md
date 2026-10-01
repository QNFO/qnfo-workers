# qnfo-fleet-dashboard

ONE human page: https://fleet.qnfo.org/  answers "what do I have to do, and should I keep investing?" and nothing else (HUMAN-DASHBOARD-1 + INVEST-DECISION-1 + OWNER-RESPOND-1).
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
- Cost basis is `fleet_budget ai_spend:total` (qnfo-fleet-control): the 30-day unified-billing spend, which is what the cap meters (#1699, BYOK-BILLING-SPLIT-1). It must be <6h old. The billing API's current-period-to-date is shown as context only (it reads ~$0 early in a month), and the all-provider list-cost estimate can never trigger SCALE_BACK/KILL on its own.
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

## Respond from the dashboard (OWNER-RESPOND-1)
The owner's side of "manage, track, initiate server-side prompts" lives in the one page. (For reference: `ai.qnfo.org` and `personal.qnfo.org` are separate key-gated chat playgrounds, `ops.qnfo.org` is API-only (`/v1/jobs`, driven from DeepChat/ChatBox), and `qnfo-agent-ws` is RETIRED pending RM-AGENT-WS-DECISION-1.)

**Access.** The page was public. Responding needs identity, so it is gated by one secret, `OWNER_TOKEN` (24+ characters; set it in the Worker's Settings > Variables and Secrets, or `wrangler secret put OWNER_TOKEN`; no agent session can or should mint it). Until it is set the page behaves as before and shows a card asking for it. Once set: anyone without the owner cookie gets a locked shell, `/api/human` and `/api/decision` return only the verdict (machine callers use `x-loop-token`), login sets an HttpOnly/Secure/SameSite=Strict cookie holding `sha256(token)`, every write needs that cookie plus `x-fleet-ui: 1`, and login is throttled (10 failures / 10 min).

**Per card** (`POST /api/owner/respond {key, kind, days?, note?}`): *Done* / *Not doing* resolve or dismiss a queue item (`human_actions`, evidence "owner via dashboard"); *Snooze 3d/7d* hides any item (derived items return if still true); *Add note* keeps a note with the item and files it as one `agent_issues` row (`OWNER-NOTE-<id>`, category `owner-request`, priority high) for the fleet's issue pipeline (OWNER-NOTES-ROUTE-1; the */15 cron files any the request missed); it is also listed in `/api/human`. Derived items (mail, objective revisions, issue-loop, code-loop) clear when their source clears, so they can be snoozed or noted, not marked done.

**Prompts** (`POST /api/owner/prompt {text, mode}`, 20/day, `OWNER_PROMPTS_DAILY_CAP`): *Ask now* runs the prompt through qnfo-ai over the dashboard's service binding (authenticated by binding props, no key), grounded in the current queue and decision, with no tools; *Queue as task* records a `pending` intent (listed in the 06:00 UTC intent digest) and files one `agent_issues` row (`OWNER-TASK-<id>`, category `owner-request`) for the fleet's issue pipeline; the panel shows that issue's status. The intent triage itself reads only `research` intents, so before 1.13.0 a queued task reached no consumer (OWNER-NOTES-ROUTE-1). Both are listed and tracked on the page (`owner_prompts`, joined to `intents.status` / `triage_decision`).

Tables (created on first use): `human_responses`, `owner_prompts`. The owner-only to-dos from the charter are seeded by `migrations/2026-10-01-owner-only-actions.sql`; the objective-revision item is derived live from `goals`. Dated items more than 14 days away sit under "Coming up" and do not count toward the banner. The first five cards show; the rest sit under "N more waiting on you".

**Objective revisions** are decided on their card (`POST /api/owner/objective {id, decision: ratify|reject}`), and each line says what ratifying will do (OBJECTIVE-REVISION-APPLY-1, 1.13.0):
- A weight change ("weight of X from A to B", one or more) applies the moment it is ratified, when every term is in `sai_config`, every "from" is the live weight, the verb matches the direction and the weights still sum to 1.00. One D1 batch updates `sai_config`, rewrites the SAI formula in the active `objective-function` row (version + 1, `ratified_by` the owner) and marks the goal `adopted`. A change that fails any check gets no Ratify button; the card says why, and Reject clears it.
- Anything else (a new constraint, a re-evaluation) is filed on ratification as one `agent_issues` row (`OBJECTIVE-REVISION-<id>`) for the fleet's issue loop; the goal stays `ratified`.
- The */15 cron applies any revision ratified outside the route (at most 5 a tick). Every outcome is logged once in `objective_revision_applies` (`applied`, `filed-as-work`, `not-applicable`, `partial`), so nothing is retried forever.
- Offline suite: `objective-apply.test.mjs` (deploy-gate).

**No Claude dependency (NO-CLAUDE-RUNTIME-DEPENDENCY-1).** Every response, prompt and decision is stored and acted on in Cloudflare; the dashboard never links claude.ai or anthropic.com (`safeLink`, also enforced on `POST /api/human`). *Ask now* uses `@cf/zai-org/glm-5.3-flash` on Workers AI through qnfo-ai.

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
`/api/state`, `/api/actions`, `/api/loop`, `/api/loop/sync`, `/api/loop/execute`, `/api/integration`, `/api/refresh`, `/health`, plus `/api/reach` and `POST /api/reach/ingest` (REACH-SIGNALS-INGEST-1, STRATEGY-1; the daily ingest still runs in the cron). The HTML reach scorecard that briefly lived on `/roi` is folded into the one page as a reach line in the business case; the full 7d/28d data stays at `/api/reach`. Every response carries `X-Robots-Tag: noindex` (DASHBOARD-NOINDEX-1).

## Refresh and storage
- Cron `*/15`: rebuilds system state, runs the issue loop, and runs `governanceSnapshot` (GraphQL spend/pageviews, survival gates).
  `governanceSnapshot` keeps the write-backs the old root page did on view: `impact_thresholds.state` (GATE-STATE-LIVE-1) and `survival_state`.
- State cached in qnfo-audit D1 `fleet_dashboard_state`; money snapshot in `fleet_loop_meta` key `human_gov_snapshot`; queue in `human_actions`.
- Secret `CF_TOKEN` (account analytics read); `LOOP_TOKEN` guards the POST endpoints.

## Daily portfolio guard and owner page (PORTFOLIO-DAILY-1, OWNER-PAGE-1, v1.10.0)
- `portfolioDailyRun` (cron, once per UTC day after 05:00Z, throttled on `cloud_ops_events` id `portfolio-daily-<day>`): OWNER-VOICE-GUARD-1 over Bluesky (last 24h: mojibake, q08.org links; 7-day cadence vs `SOCIAL_WEEKLY_CAP`, default 2) and `outreach_log` (last 24h: `Re:` follow-ups, more than 8 sends). A violation sets `pipeline_flags.social_paused='1'` (qnfo-audit) and/or `pipeline_state.external_sends_enabled='0'` (qnfo-outreach) and files one deduped `OWNER-VOICE-GUARD-1` agent_issue. It never re-enables a stream. Then one `portfolio_runs` row (`daily-cron`, `weekly-cron` on Mondays, `monthly-cron` on the 1st with KPI deltas vs the rows 7 and 28 days earlier); `needs_owner` comes from `owner_actions`. A source that fails is `null` and listed in `skipped`.
- `/owner` and `/owner/doc/<key>`: private owner page (owner_actions, last 7 portfolio_runs, `owner_docs.identity` rendered as escaped markdown). Gated by `LOOP_TOKEN` (`Authorization: Bearer`, `x-loop-token`, or the page's POST form; never a query string). 401 without it; no-store, noindex, no scripts.
- `/owner/edit/<key>` (OWNER-EDIT-1): the owner edits an owner document; optimistic saves, each replaced version kept as `<key>--v<ts>`, archives read-only. Opens with the owner cookie (OWNER_TOKEN) plus a same-origin check, or LOOP_TOKEN typed into the form.
- Owner documents live in the private D1 `qnfo-identity` (binding `IDENTITY`, bound only to this worker; IDENTITY-STORE-1). On first use the worker copies every `qnfo-audit.owner_docs` row across, byte-checked, and records it in `store_meta` (an interrupted or failed copy records nothing and is redone); without the binding it falls back to `qnfo-audit`. The move copies and never deletes: the shared copy stays until the owner removes it, is no longer read, and any later write to it is synced across by the */15 cron and on each /owner visit (newer `updated_at` becomes current, the other version is kept as a `--v<stamp>` history row; `store_meta` `audit_seen`, `last_sync`). Owner documents never render links to claude.ai or anthropic.com.
- IDENTITY-WEEKLY-1: the weekly identity review runs from the `*/15` cron on Mondays after 06:00Z (once, throttled on `cloud_ops_events` `identity-weekly-<day>`), writes a `portfolio_runs` row and, when something is urgent, one owner queue card.
