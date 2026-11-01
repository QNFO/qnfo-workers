# qnfo-fleet-dashboard

ONE human page: https://fleet.qnfo.org/  answers "what do I have to do, and should I keep investing?" and nothing else (HUMAN-DASHBOARD-1 + INVEST-DECISION-1 + OWNER-RESPOND-1).
Mirror: https://qnfo-fleet-dashboard.q08.workers.dev/

## The page
- **Organised by functional area (AREAS-1, 1.38.0; pages and navigation by area since AREA-PAGES-1, 1.45.0, below).** Five tiles under the verdict: Cost, Research and content, Reach and growth, Autonomy loop, Reliability and security. Each shows one star metric with its 14-day direction (improving or worsening is judged against the breach operator, so a falling run-rate is good and falling subscriber growth is bad). A tile is green with no breach, amber with breaches below priority 8, red with a priority 8 or higher breach or eight or more breaches. The overview puts the failure/root-cause rows before the owner queue, so the cause is visible without scrolling past the actions.
- **Management by exception.** Before the queue, each area lists only metrics in breach (qnfo-audit v_metric_trigger_state, hit = 1), worst three first (priority, then size of the gap), each with owner, 14-day sparkline from metric_history and a Diagnose control that fills the command line (nothing runs until the owner presses Enter). The remainder is a count that opens a command-line listing. A metric maps to one area by key (AREA_DEFS); an unmapped key falls into Autonomy loop rather than disappearing.
- **Pipelines and bottlenecks** (on each area's page since 1.45.0; the overview shows a bottleneck on the area's row). The Code loop flow
  (30 days) splits "closed" by what happened to the pull request, from `code_task_pr_links` (CODE-FLOW-PR-SPLIT-1, 1.46.0): closed, never
  opened a PR; PR closed unmerged; superseded (`status` or `merge_state` superseded, or a `last_error` that starts with superseded), which is
  not a failure and stays out of the failure share. Open issues by age, code loop (30 days), research queue and outreach, one bar per stage. The bottleneck is named by rule: failing stages that hold over 40% of finished work, else the largest waiting stage with at least 5 items and 30% of the pipeline. Age buckets and declined items never qualify, but a stale bucket is flagged.
- **Removed as redundant:** the four-number KPI strip (now the tiles and the verdict reasons), the Business case grid (every figure is a tile, a verdict reason or the Progress card), the Open data link card (the footer carries the JSON links). GET /api/areas returns the same model (fleet-areas/v3); a source that cannot be read is named in blind and its pipeline is left out, never shown as zero.
- Banner: `N things need you` / `Nothing needs you` / `Can't confirm` (a source could not be read, or system data is >60 min old; it never claims all-clear blind).
- One card per human action: what, why only you, what happens if you wait, what to do, link.
- Money and clock: AI spend 30d vs the $150 cap, days to the 2026-12-31 review gate, pageviews vs prior 30d, subscribers.
- One collapsed line for everything the system handles itself (red flags, drift, probes). It opens by itself only when an error has been unresolved past the 2h SLA.
- `/ops`, `/roi` and the old 9-panel failure inventory were folded in; `/ops`, `/roi`, `/api/roi` redirect (301) to `/`.
- The page is public and unauthenticated: third-party mail is shown as sender domain, age, category and authentication verdict, never a subject or an address; the sender's display name, address and the subject are shown only to the signed-in owner (or a loop-token holder), and no message body is ever on the page (1.17.8).

## Real-time
The queue is read live from D1 on every request and the page re-fetches `/?frag=1` every 15s (green/amber/red dot = how fresh the last update is, so a frozen page cannot pass as all-clear). The desktop navigation groups all six area pages under one **Areas** menu; the mobile menu retains the complete route list. System state is rebuilt on demand when >5 min old; money/return inputs are re-measured on demand when >5 min old (throttled to one run per 2 min) and by the */15 cron and the 10-min fleet-exec heartbeat. Cloudflare analytics and billing are themselves minutes behind; the page shows when each was measured.

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
The owner's side of "manage, track, initiate server-side prompts" lives in the one page. (For reference: `ai.qnfo.org` and `personal.qnfo.org` are separate key-gated chat playgrounds, `ops.qnfo.org` is API-only (`/v1/jobs`, driven from DeepChat/ChatBox), and `qnfo-agent-ws` is archived under RM-AGENT-WS-DECISION-1.)

**Access (OPEN-ACCESS-1; owner directive 2026-10-01: favor free, open access, no owner token).** There is no token, key or login for reading. The page, `/api/human`, `/api/decision`, `/api/watchmaker` and `/api/state` are open to everyone, and *Ask now* is open to everyone too (below). Nothing on the page asks anyone to set or enter a secret. What stays closed to the public is only what changes the fleet, because a note or task becomes an `agent_issues` row the issue and code loops act on, and ratify rewrites the live objective weights: those controls need a token holder (`x-loop-token`, the fleet's own `LOOP_TOKEN`, the secret every other POST endpoint takes; or the optional owner cookie, dormant unless an owner key is configured and never requested). So they are off on the public page. Writes still need `x-fleet-ui: 1`. Opening them to everyone would be a one-line change the owner can ask for; the clean way to give the owner buttons without a token is Cloudflare Access (an emailed code; needs Zero Trust enabled once, #1277). The private owner documents at `/owner` keep their own `LOOP_TOKEN` gate (the Identity doc holds unfiled legal and personal material).

**Per card** (`POST /api/owner/respond {key, kind, days?, note?}`): *Done* / *Not doing* resolve or dismiss a queue item (`human_actions`, evidence "owner via dashboard"); *Snooze 3d/7d* hides any item (derived items return if still true); *Add note* keeps a note with the item and files it as one `agent_issues` row (`OWNER-NOTE-<id>`, category `owner-request`, priority high) for the fleet's issue pipeline (OWNER-NOTES-ROUTE-1; the */15 cron files any the request missed); it is also listed in `/api/human`. Derived items (mail, objective revisions, issue-loop, code-loop) clear when their source clears, so they can be snoozed or noted, not marked done.

**Prompts** (`POST /api/owner/prompt {text, mode}`): *Ask now* is open to everyone and capped at 5 a day per anonymous visitor (a daily-rotating hash of the client IP; the IP is never stored) and 40 a day overall (`OWNER_PROMPTS_DAILY_CAP`); the answer is shown only to the asker and the question is not listed publicly. It runs the prompt through qnfo-ai over the dashboard's service binding (authenticated by binding props, no key), grounded in the current queue and decision, with no tools; *Queue as task* (token holders only) records a `pending` intent (listed in the 06:00 UTC intent digest) and files one `agent_issues` row (`OWNER-TASK-<id>`, category `owner-request`) for the fleet's issue pipeline; the panel shows that issue's status. The intent triage itself reads only `research` intents, so before 1.13.0 a queued task reached no consumer (OWNER-NOTES-ROUTE-1). Since 1.14.1 every pending `type='task'` intent, whatever sent it (ChatBox, DeepChat, qnfo-ops feeds), is filed the same way as `INTENT-TASK-<id>` and the intent is marked `promoted` with the issue id (TASK-INTENT-INTAKE-1); a dashboard task's intent is linked to its existing `OWNER-TASK` issue. An explicit `code-task: repo=<repo> path=<file>` line in the text reaches the code loop's ISSUE-INTAKE-1. Both are listed and tracked on the page (`owner_prompts`, joined to `intents.status` / `triage_decision`).

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
| `v_email_human_pending_v2` | inbound mail that owes you a reply: INBOUND-SLA-1's category when it has decided the message, otherwise the same header and subject rules (automated mail, receipts such as a funder's submission receipt, list mail and solicitations get no card and are listed as handled; OWNER-SURFACE-HONESTY-1) |
| `shutdown_manifest` | owner-confirm gates after phase 1 fires; gates due within 45 days |

File or clear an action from any worker/session (header `x-loop-token`, secret `LOOP_TOKEN`):

    POST /api/human {"op":"add","slug":"cf-access-rollout","title":"...","why":"...","default":"what runs meanwhile","action":"...","url":"https://...","sev":"urgent","due":"2026-10-20"}
    POST /api/human {"op":"resolve","slug":"cf-access-rollout","resolution":"<evidence>"}

`GET /api/human` returns the same view as JSON (`fleet-human/v1`).

## Pages by functional area (AREA-PAGES-1, 1.45.0)
Owner directive 2026-10-18, repeated 2026-10-19 ("REFACTOR FLEET DASHBOARD BY FUNCTIONAL AREA"): the dashboard is organised by the
same six functional areas as its feeds. `AREA_REGISTRY` in worker.js is the one table: for each area it holds the name and what it
covers, the metric keys that belong to it, its headline metric, root cause, pipelines, the cards and tabs that describe it, the
pipeline switches it owns and the owner-queue cards that are about it. `FEED_AREAS`, `AREA_DEFS`, `AREA_STARS`, `AREA_ROOT` and
`AREA_FLOW` are derived from it, so the page, `GET /api` and `GET /api/area/<id>` cannot disagree about which areas exist
(`area-pages.test.mjs` holds them to each other).

- **Navigation is the areas:** desktop navigation is Overview, one Areas menu (Cost, Research, Reach, Autonomy, Reliability, Platform), and Command line; the mobile menu retains all routes. Metrics (`/kpi`), Content
  (`/content`) and Changelog (`/changelog`) are pages of an area, not top-level tabs: they light their area in the navigation and show
  the area's sub-bar. The old anchors (`/#queue`, `/#areas`, `/#flow`, `/#invest`) still land on the overview.
- **Overview (`/`):** the owner queue (each card names its area; a receipt for a request of yours that the fleet closed sits apart under
  *Closed for you*, with its issue number and no issue text, and is never counted as waiting on you: OWNER-REQUEST-RECEIPT-1; the gate grades the same cards `notice`, OWNER-NOTICE-GATE-1), one row per metric area (the worst breach, its lever and, when there is one,
  a named bottleneck or a stopped pipeline switch), and the two headline answers the page promises: *Keep investing?* and *System health*.
- **`/area/<id>` for `cost`, `research`, `reach`, `autonomy`, `reliability`, `platform`:** the headline metric and trend; the queue cards
  that are about the area; the constraint and every breach; the area's pipelines; the cards that used to sit on the overview (Keep
  investing? under Cost, Progress and the social-distribution switch under Reach, System health under Reliability, the owner-queue
  switch under Autonomy); and a table of every read in the area, page and feed, with its source and worst-case lag. `platform` has no
  metrics (it is the API and the fleet state itself) and lists the feeds of every area. A source the model could not read is named at the top
  of the page, limited to the sources that area is built from, and is never shown as zero.
- **Live:** the page fetches `/area/<id>?frag=1&rev=<revision>` every 15 s and swaps the area in place; `204` while nothing in the area moved.
  Ages and the version are outside the revision, so an unchanged area keeps it.
- **Which area a queue card belongs to:** its source first (`billing`, `decision`, `shutdown` are Cost; `inbox` is Reach; `code-loop`,
  `issue-loop`, `objectives`, `register`, `gtd` are Autonomy), then the area's own words for a card with no source of its own
  (`AREA_REGISTRY[].queue.rx`); a card nothing recognises is Autonomy, as an unmapped metric is.
- **Not changed:** the command line, the owner console and the owner documents stay where they were; their code is mapped under Platform and
  Autonomy below.

## Code map by functional area
One worker is deployed as one file (`worker.js`, uploaded as a single module by the canonical path), so the code is mapped, not split.
Every region starts with a banner `// ==== AREA-MAP <area>: <what> ====`; `grep -n "AREA-MAP reach" qnfo-fleet-dashboard/worker.js` lists the
code of one area. `area-pages.test.mjs` fails on a banner with an unknown area, a repeated region name, or an area with no region, so a new
region gets its banner in the PR that adds it.

| Area | Regions (banner text) |
| --- | --- |
| `cost` | keep investing: decision rule, governance snapshot, spend and return (INVEST-DECISION-1) |
| `research` | q08 review decision; text generator inventory; Content tab (CONTENT-PIPELINE-1) |
| `reach` | human audience; engaged human sessions; reach signals ingest; work-with-me contacts; attention loop; GA4 ingest and the reach tick; reach scorecard; portfolio daily run and the owner-voice guard |
| `autonomy` | code task outcomes split by pull request (shared by the flow and the Metrics tab); issue ledger and the GitHub issue loop; autonomy score (SAI) and the weekly report card; owner queue tables and objective revisions; watchmaker index; owner queue mail classification and collectHumanActions; changes feed, the owner view model and published feeds; owner responses, prompts and Ask now; owner documents, identity store and the weekly review |
| `reliability` | schedule maths; state store, 24 h analytics and probes; live inventories; fleet state (buildState, integration view, report-card data) |
| `platform` | shared primitives; fleet state refresh coordination; read API (feed table, API index, revalidation); area registry; HTTP routes; worker entry; metric_registry refresh pass; area model (AREAS-1); area pages (AREA-PAGES-1); overview page and its wrapper; page shell and navigation (FLEET-UI-2); Metrics tab; Changelog tab; command line; fleet console |

## Feeds by functional area (AREA-FEEDS-1, 1.44.0)
Owner directive 2026-10-18: *refactor the fleet dashboard and API feeds by functional area; feeds shall always be updated
automatically from live data and real time.* The read surface is therefore organised by the same five functional areas the
page uses for breaching metrics, plus `platform` for the reads that describe the API and the fleet state itself.

`GET /api` (`fleet-api-index/v2`) returns `areas` and `by_area` beside `endpoints`: every row now names its `area`, whether
it is computed at request time (`source: live`), from the rebuilt fleet state (`snapshot`) or both (`mixed`), and the
worst case lag a client must assume (`lag_s`). Nothing has to be inferred from prose. The index revalidates like every
other read — body `revision`, `?since=<revision>`, `If-None-Match` — so a client that cannot send a header can still
dedupe it (1.44.4, where it had an ETag and no `?since=` of its own).

`GET /api/area/<id>` (`fleet-area-feed/v1`) is one area as its own feed: star metric and trend, breaches ranked, the named
constraint, the area's pipelines and the reads that belong to it with their lag. It reads the same model as `/api/areas`,
so the two can never disagree about a breach, and it revalidates like every other read (`ETag`, `If-None-Match`,
`?since=<revision>`; `?full=1` adds every breach row and the whole lever text). An unknown area is a 404 listing the ids, and
so is a malformed percent escape in the id (1.44.2: it answered 500 `URI malformed` until the decode was guarded). `blind`
is the same list of unreadable sources `/api/areas` sends, and `degraded` is true when it is non-empty, so a table that
failed can never render as "all clear" (1.44.3).

| area | page | own feed | other reads | source |
| --- | --- | --- | --- | --- |
| `cost` | `/area/cost` | `/api/area/cost` | (none: the metric triggers are the whole area) | live |
| `research` | `/area/research` (tab: `/content`) | `/api/area/research` | `/api/generators`, `/api/content`, `/api/q08-review` | live |
| `reach` | `/area/reach` | `/api/area/reach` | `/api/reach`, `/api/attention`, `/api/ga4` | live |
| `autonomy` | `/area/autonomy` | `/api/area/autonomy` | `/api/human`, `/api/actions`, `/api/loop`, `/api/changes`, `/api/watchmaker`, `/api/owner/*` | live + snapshot |
| `reliability` | `/area/reliability` | `/api/area/reliability` | `/api/integration` | live + snapshot |
| `platform` | `/area/platform` (tabs: `/kpi`, `/changelog`, `/cmd`) | `/api/area/platform` | `/api`, `/api/live`, `/api/areas`, `/api/state`, `/api/decision`, `/api/kpi`, `/api/changelog`, `/api/cmd` | live + snapshot |

Live means: `v_metric_trigger_state`, `metric_history` and the area's queues are read from D1 and cached at most 15 s per
isolate; the body says `live: true`, `max_lag_s: 15` and which tables it read (`computed_from`). Other indexed reads
declare their own worst-case lag in `GET /api`. A
snapshot-backed read (`/api/state`, `/api/actions`, `/api/integration`, `/api/decision`, `/api/live`) serves
`fleet_dashboard_state`; any of them now schedules a rebuild in the background once the record is older than 60 s
(`freshState`), which `/api/actions` and `/api/integration` previously did not do at all, so a poller could keep receiving
a fifteen-minute-old answer. The index row states the source and the lag; `/health` says the same in prose.

"Live" is measured, not asserted: the metrics themselves are refreshed by other workers, and on 2026-10-18 the registry
ranged from minutes to 18 hours old (196 of 227 under an hour, 14 between one and six, 17 over six). Every area feed
therefore carries `data: {age_min, metrics}`, the age of the oldest metric it reports, measured at request time (`age_min`
is a clock field for the digest, so it never moves the revision while `metrics` and the values do). A stale number cannot
hide behind a live-looking answer.

`GET /api/live` (`fleet-live/v3`) is the consolidated poller contract: beside the verdict, queue, decision and area summary,
`failure_summary` groups affected areas with their primary breach, root-cause explanation, ranked top breaches, owner, lever
and recent attempts. `remedy_history_available` and `unreadable_sources` distinguish a failed remedy-history read from a
readable history with no recorded lever or attempts; unavailable remedy values are `null`, not zero. `freshness` gives
request time and the measured age/cache bound for state, queue and areas, with the areas bound derived from the cache TTL.
Its revision excludes clock-only fields so clients can use `If-None-Match` or `?since=<revision>` without a new content revision each poll.
The root `GET /api/cmd` endpoint is POST-only; other methods return 405 with `Allow: POST` and a structured
`method_not_allowed` body, while the existing POST UI-header guard remains unchanged.

The page's area renderer (`focusRowsHtml`, which `humanHtml` calls) already listed all five areas. Each row now ends with a
link to that area's machine feed (`feed: /api/area/<id>`), including the rows that read `all clear`, so the page and the API
describe the same boundary. (`areaSectionsHtml` is dead code and is not the page; it was left alone rather than rewired.)
Since 1.45.0 each row's area name links to its own page, `/area/<id>`, and `GET /api` `by_area` and `GET /api/area/<id>` carry that page's path.

In `by_area`, `all_members_live` is about the area's member reads (false when one is snapshot-backed); the area feed
itself is always `live: true` with `max_lag_s: 15`. The two flags deliberately do not share a name.

`GET /api/ga4` was answering **500** live ("GA4 property ID not set"): an older handler for the same path stood in front of
the GA4-DATA-API-1 ledger read and called two retired helpers. Both the shadow handler and the orphaned helpers are gone, so
the route answers the ingest ledger and revalidates (`rt-api.test.mjs` K17/K18 pin it).

## Machine endpoints (unchanged; consumed by qnfo-fleet-control and qnfo-autopilot)
`/api/state`, `/api/actions`, `/api/loop`, `/api/loop/sync`, `/api/loop/execute`, `/api/integration`, `/api/refresh`, `/health`, plus `/api/reach` and `POST /api/reach/ingest` (REACH-SIGNALS-INGEST-1, STRATEGY-1; the daily ingest still runs in the cron). The HTML reach scorecard that briefly lived on `/roi` is folded into the one page as a reach line in the business case; the full 7d/28d data stays at `/api/reach`. `GET /api/q08-review` shows the Q08-REVIEW-2026-10-31 decision (agent_issues 1716, 1.16.0): from the first */15 tick at or after 2026-10-31T00:00Z the cron measures bot-filtered RUM page views (`bot: 0`) on q08.org and www.q08.org for 2026-10-24..30 through the reach ingest's GraphQL path, writes `ops_config.q08_review_2026_10_31` only on a real decision (keep, or cut-cadence under 50 a week, which also sets `ops_config.q08_max_per_day` to 2 in the same batch), records a failed or empty read as `deferred` in `cloud_ops_events` id `q08-review-2026-10-31` and retries hourly, and never runs again once decided. `POST /api/q08-review?to=<day>` (x-loop-token) runs the same measurement for any past 7-day window and writes nothing. Every response carries `X-Robots-Tag: noindex` (DASHBOARD-NOINDEX-1).

## Refresh and storage
- Cron `*/15`: rebuilds system state, runs the issue loop, and runs `governanceSnapshot` (GraphQL spend/pageviews, survival gates).
  `governanceSnapshot` keeps the write-backs the old root page did on view: `impact_thresholds.state` (GATE-STATE-LIVE-1) and `survival_state`.
- State cached in qnfo-audit D1 `fleet_dashboard_state`; money snapshot in `fleet_loop_meta` key `human_gov_snapshot`; queue in `human_actions`.
- Secret `CF_TOKEN` (account analytics read); `LOOP_TOKEN` guards the POST endpoints.

## Metrics tab (FLEET-KPI-1, v1.30.0, pillar reach)
`GET /kpi` (page) and `GET /api/kpi` (the same data as JSON) are open to everyone. Every figure is computed from `qnfo-audit`
when the page is opened and kept in memory for 60 seconds; each panel names its source table and the time it was computed.
A value nothing measures is `null` in the JSON and "not measured" on the page, never 0; a missing table or a failed read
makes that one panel unmeasured and is listed under `unreadable`.

| Section | What it shows | Source |
|---|---|---|
| Service levels (KPI-THRESHOLDS-1, 1.46.0) | every registered metric against its threshold: value, operator and threshold (or `no threshold`), state `BREACH` / `WARN` / `NO_READING` / `OK` / `NO_THRESHOLD`, time in breach, owner and area, `BREACH` first and longest first; items past their SLA by class with the age of the oldest | `v_metric_trigger_state`, `metric_registry`, `metric_history`, `v_sla_over_120m` |
| Issues | open now, by priority and category; opened and closed per day (14 days); median age; oldest; closed with evidence in 24 h and 7 d; code-loop tasks of the last 30 days by how they ended (merged, failed, never opened a pull request, pull request closed unmerged, superseded, in flight) | `agent_issues`, `issue_lifecycle`, `code_tasks` |
| Reach | bot-filtered page views per property and day (visits once the ingest's per-host row exists); outreach actions and events per channel and day; posts per channel; posts ranked by reader actions, with links; subscribers; mentions and citations | `reach_signals`, `outreach_log`, `social_threads`, `social_media_posts`, `social_engagements`, `social_replies`, `subscribers`, `subscribe_funnel`, `external_mentions`, `dissemination_tracker`, `outreach_learner_sends` |
| Buffer | connected channels, posts sent through Buffer, per-post statistics | `social_channels`, `social_media_posts`, `social_engagements` (platform `buffer`) |

**Service levels (KPI-THRESHOLDS-1, agent_issues 2727; owner directive 2026-10-17: "Last 7 days" and "All time" are meaningless).** The
document has no `last_7d` or `all_time` key; a figure is judged against the level it must hold. `BREACH` is the rule
`v_metric_trigger_state` applies (`hit = 1`). `WARN` is a metric that is not in breach but is past its registered `warning_band`, when
that band is a comparison and a number (`< 80`, `>= 2`, `> 6h behind`); a band that is not (`any rc != 0`) gives no `WARN`. `NO_READING`:
the trigger has no value. `NO_THRESHOLD`: a registered metric no trigger holds to a level, listed by name and never counted as OK. Time
in breach runs from the first of the current run of breached **daily** readings in `metric_history` (day resolution, the finest anything
records a breach at; a run that reaches the oldest day read, 45 days back, is shown as "at least"). SLA items come from every numeric
column of `v_sla_over_120m` except the total and the "oldest" helpers, so a class the view gains appears without an edit; a column named
`..._180m`, `..._3h` or `..._60m` carries its own SLA. `GET /api/kpi` returns `service_levels` (`counts`, `metrics[]`) and `sla`
(`total_over_sla`, `classes[]`). No new table, cron or model call.

The block never reads the private `qnfo-outreach` database and returns counts, public post links and public mention links
only. The daily reach ingest writes one `cf-rum-human` row per host (`entity_type = 'host'`, metrics `pageviews` and
`visits`). Suite: `node --no-warnings qnfo-fleet-dashboard/kpi.test.mjs`. Chart colours are a validated pair per theme
(light `#008A7B` / `#B5562A`, dark `#2AA595` / `#D06C3E`); the page has no script and every chart has a table.

## Architecture self-model (ARCH-SELF-MODEL-1, v1.48.0, pillar autonomy)
The fleet's model of itself, computed at request time and kept 5 minutes per isolate; open and read-only (OPEN-ACCESS-1), names and counts only.
Page `/architecture` (Platform area, sub-bar "Architecture"); JSON `GET /api/architecture` (`?full=1` adds the table index and per-worker table lists,
`?q=<text>` searches workers and tables), `/api/architecture/worker/<name>`, `/api/architecture/table/<name>` (bare name, suffix or `db.table`) and
`/api/architecture/impact/<worker>` (direct and transitive dependents, tables it writes that others read). An ambiguous name returns its candidates and
no detail; an unknown name returns no match, never an invented one.

| Part | Source |
|---|---|
| Workers, bindings, service dependencies both ways, schedules, routes, tables read and written, findings | the fleet code + live topology graph (FLEET-GRAPH-1: qnfo-graph `fg_node`, `fg_edge`, `fg_finding`, `fg_state`, binding `GRAPH`) |
| Purpose, version, state | `service_registry` |
| Last tick | `fleet_heartbeat` |
| Fleet-exec loops | `fleet_crons` |
| The fleet's memory (row counts) | the registries listed in `ARCH_REGISTRIES` |
| Layers, the change path, the lanes of authority | tables in the `ARCH-SELF-MODEL` block, written from CLAUDE.md and the doctrine (a description, not a measurement) |

A loop is **overdue** (`overdue_loops`, `overdue[]`, a marker on the page) when its last tick is older than its schedule's largest gap in a week plus 120 minutes (SLA-120M-1); a worker with no cron or a cron that pins a day of the month is not judged. Cloudflare cron day-of-week is 1-7 with 1 = Sunday. **Cron grid (ARCH-OVERDUE-GRID-1, 1.51.1):** CRON-GRID-1 put each worker's trigger on an hourly or five-minute grid and runs the worker's own jobs from it, so for a worker whose grid ticks logged `idle` in `cron_fire_log` (last eight days) the trigger is not the schedule that produces its heartbeat. Such a worker is judged by the jobs it has run (`cadence_source` `cron-grid`, the job expressions that are not its trigger) and by nothing until one has (`cron-grid-unknown`, `cadence_min` null); every other worker keeps its trigger (`cron`). The 1.50.0 reading listed personal-api, qnfo-gateway and qnfo-intent-orchestrator as 441, 383 and 357 minutes late behind hourly triggers although their jobs are daily.

The model reports what it cannot see: `self.sources` (each read and whether it succeeded), `self.blind` (reads that failed: the part is missing, not empty) and
`self.limits` (static extraction misses a table named through a variable; layers are a judgement; a worker no layer names is `unclassified`). No secret name or value
is read. Suite: `architecture.test.mjs`.

## Content tab (CONTENT-PIPELINE-1, v1.37.0, pillars research and reach)
`GET /content` (page) and `GET /api/content` (JSON, `content-pipeline/v1`) are open to everyone and follow the Metrics tab's
rules (60 s cache, sources named, `null` = not measured). They show every content item on one production line: the stage
board (in flight, past SLA, oldest, state breakdown, enforcing worker), a property x stage matrix, flow balance (accepted into
research vs published per day, wait by Little's law), the oldest items in flight, the gate and SLA catalogue, release-gate
verdicts on papers.qnfo.org (`living-paper.papers`), q08.org signal-to-piece gates (`q08-signal`) and the latest transitions.
Sources: `qnfo-audit.content_stages`, `v_content_pipeline`, `v_content_stage_summary`, `content_stage_events`
(migrations/2026-10-14-03-content-pipeline.sql). reading.q08.org is on the personal plane and is not read. The cron writes
metric `papers_live_failing_release_gate` hourly (`contentGateMetric`). Method: docs/CONTENT-PIPELINE.md. Suite:
`node --no-warnings qnfo-fleet-dashboard/content-pipeline.test.mjs`.

## Work-with-me contacts (WORK-WITH-ME-METRIC-1, v1.17.2, pillar reach)
- qnfo.org/work-with-me (qnfo-gateway WORK-WITH-ME-1) offers five ways to work with the owner; each button mails
  rowan.quni@qnfo.org with a subject that starts `[work-with-me:<offer>]` (`jpcub`, `agent-review`, `talk`, `research`, `role`,
  `general`; `WWM_OFFER_KEYS`, kept in parity with the gateway by its test).
- Inside the daily reach ingest (same throttle and day), step g counts, over the 30 UTC days ending that day: distinct senders
  of tagged inbound mail in `qnfo-audit.emails` (`inbound_contacts_30d`), messages, tagged mail marked spam (shown, not
  counted), and RUM page views of the page from the cf-rum rows with the days covered. Sent mail, the fleet's own domains,
  bounces and `email_command_senders` (owner and agent test addresses) are excluded. No RUM day in the window writes no
  page-view row. Rows: `reach_signals` source `work-with-me` (INSERT OR REPLACE per day, so reruns are idempotent); the live run
  also refreshes `metric_registry` `inbound_contacts_30d` and `work_with_me_pageviews_30d` (daily). `GET /api/reach` serves the
  latest snapshot as `work_with_me` (counts only, plus `contact_rate`); the portfolio KPIs carry both numbers.
  `WATCHMAKER_OPS` key `work-with-me-contacts` proves the step ran. Offline suite: `work-with-me.test.mjs` (deploy-gate).

## Daily portfolio guard and owner page (PORTFOLIO-DAILY-1, OWNER-PAGE-1, v1.10.0)
- `portfolioDailyRun` (cron, once per UTC day after 05:00Z, throttled on `cloud_ops_events` id `portfolio-daily-<day>`): OWNER-VOICE-GUARD-1 over Bluesky (last 24h: mojibake, q08.org links; 7-day cadence vs `SOCIAL_WEEKLY_CAP`, default 2) and `outreach_log` (last 24h: `Re:` follow-ups, more than 8 sends). A violation sets `pipeline_flags.social_paused='1'` (qnfo-audit) and/or `pipeline_state.external_sends_enabled='0'` (qnfo-outreach) and files one deduped `OWNER-VOICE-GUARD-1` agent_issue. It never re-enables a stream. Then one `portfolio_runs` row (`daily-cron`, `weekly-cron` on Mondays, `monthly-cron` on the 1st with KPI deltas vs the rows 7 and 28 days earlier); `needs_owner` comes from `owner_actions`. A source that fails is `null` and listed in `skipped`.
- `/owner` and `/owner/doc/<key>`: private owner page (owner_actions, last 7 portfolio_runs, `owner_docs.identity` rendered as escaped markdown). Gated by `LOOP_TOKEN` (`Authorization: Bearer`, `x-loop-token`, or the page's POST form; never a query string). 401 without it; no-store, noindex, no scripts.
- `/owner/edit/<key>` (OWNER-EDIT-1): the owner edits an owner document; optimistic saves, each replaced version kept as `<key>--v<ts>`, archives read-only. Private (it holds unfiled legal and personal material): opens with `LOOP_TOKEN` typed into the form, or the optional owner cookie, plus a same-origin check.
- Owner documents live in the private D1 `qnfo-identity` (binding `IDENTITY`, bound only to this worker; IDENTITY-STORE-1). On first use the worker copies every `qnfo-audit.owner_docs` row across, byte-checked, and records it in `store_meta` (an interrupted or failed copy records nothing and is redone); without the binding it falls back to `qnfo-audit`. The move copies and never deletes; on the owner's instruction the pre-move copy was removed on 2026-10-01 after every row was verified present in `qnfo-identity`, so `qnfo-audit.owner_docs` is empty and must stay so. Any later write to it is synced across by the */15 cron and on each /owner visit (newer `updated_at` becomes current, the other version is kept as a `--v<stamp>` history row; `store_meta` `audit_seen`, `last_sync`). Owner documents never render links to claude.ai or anthropic.com.
- IDENTITY-WEEKLY-1: the weekly identity review runs from the `*/15` cron on Mondays after 06:00Z (once, throttled on `cloud_ops_events` `identity-weekly-<day>`), writes a `portfolio_runs` row and, when something is urgent, one owner queue card.

## Watchmaker index (WATCHMAKER-INDEX-1)
The fleet's own daily count of recurring operations that still need a person or a Claude session (roadmap
RM-WATCHMAKER-INDEX-1, agent_issues 1726; target 0). `WATCHMAKER_OPS` in worker.js lists every recurring operation with its
runner and how its last run is read from D1. An operation counts when a person or a session runs it, when its Cloudflare
runner has been silent for more than twice its cadence, or when its freshness cannot be read (unproven is not unattended).
Approvals the owner keeps by policy (each LinkedIn draft, objective ratification) are listed and not counted; the retired
claude.ai Routines are listed with what replaced them. Once per UTC day after 07:00Z on the */15 cron: one `watchmaker_runs`
row, `metric_registry.watchmaker_index` (daily, target 0; the charter's live block reads it), and `GET /api/watchmaker`
(number only on a locked page). A new recurring operation is added to `WATCHMAKER_OPS` in the same PR that creates it.
Offline suite: `watchmaker.test.mjs` (deploy-gate).
