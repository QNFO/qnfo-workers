# Closeout — fleet dashboard and API feeds refactored by functional area (2026-10-18)

Owner directives this thread, in order:

1. "REFACTOR FLEET DASHBOARD AND API FEEDS BY FUNCTIONAL AREA."
2. "FEEDS SHALL ALWAYS BE UPDATED AUTOMATICALLY FROM LIVE DATA AND REAL-TIME."
3. "RED-TEAM/MERGE/DEPLOY/CLOSEOUT/HANDOFF"

Everything below is measured against live `fleet.qnfo.org` and `qnfo-audit` (D1 `35e2e573-92f3-46ac-83c6-22f6429fc5e5`) unless marked.

---

## 1. What was wrong, and the shape of the fix

The read surface was organised by **data source**: eighteen reads whose names (`/api/kpi`, `/api/reach`,
`/api/changelog`, `/api/generators`, …) told a caller nothing about which part of the fleet they described, and whose
freshness was prose in a comment. A client that wanted "what is the state of reach" had to know the fleet's history.

Three defects sat under that:

1. **No machine-readable boundary.** Nothing tied a read to a functional area, to whether it was live or snapshot-backed,
   or to how stale it could be. `/health` claimed "the state refreshes on the */15 cron, so a view can be up to 15 minutes
   old" for *every* read, which was false for most of them and unverifiable for the rest.
2. **`GET /api/ga4` answered 500 live** — `{"ok":false,"error":"GA4 property ID not set"}`. An older handler for the same
   path stood in front of the GA4-DATA-API-1 ledger read and called two retired helpers, so the correct code below it was
   unreachable.
3. **`/api/actions` and `/api/integration` never refreshed.** They read `fleet_dashboard_state` directly; only
   `/api/state` scheduled a rebuild past `STALE_MS` (60 s). A poller could keep receiving a fifteen-minute-old answer while
   the fleet looked healthy.

## 2. Shipped, deployed, verified

| change | PR | live version |
| --- | --- | --- |
| grouping as data (`area`, `source`, `lag_s` on every `API_INDEX` row), `/api` -> `fleet-api-index/v2` with `areas` + `by_area`, `GET /api/area/<id>` (`fleet-area-feed/v1`), ga4 shadow + dead helpers removed, `freshState`, `/health` limits rewritten, page links each area row to its feed | #2523 | 1.44.0-area-feeds |
| corrections found by verifying 1.44.0 live: the page claim was wrong (`focusRowsHtml`, not the dead `areaSectionsHtml`); `by_area[].live` renamed `all_members_live` so it stops sharing a name with the feed's own `live` | #2532 | 1.44.1-area-feeds-2 |
| red-team: a malformed percent escape in the id answered 500 `URI malformed` where every other read answers 404; the decode is guarded | #2535 | 1.44.2-area-feeds-3 |

`deployment_history`: 1.44.0 at 20:10:41Z, 1.44.1 at 20:20:12Z, 1.44.2 at 20:30:21Z, all `qnfo-ops:cf_worker_deploy`,
status `success`.

**Measured live on 1.44.2:**

| check | before | after |
| --- | --- | --- |
| `GET /api/ga4` | 500 `GA4 property ID not set` | **200**, ledger rows, revalidates |
| `GET /api/area/%E0%A4%A` | 500 `URI malformed` | **404** (matches `/api/areas/%E0%A4%A`, `/health/%E0%A4%A`) |
| `/api` schema | `fleet-api-index/v1`, 22 rows, no grouping | `fleet-api-index/v2`, 23 rows, 6 areas |
| area -> feed | did not exist | `/api/area/<id>` for cost, research, reach, autonomy, reliability, platform |
| breach counts agree with `/api/areas` | n/a | 5/5, 6/6, 0/0, 32/32, 11/11, 0/0 |
| `ETag` -> `If-None-Match` | n/a | 304 on every area feed; `?since=<rev>` and `?since=rev:<rev>` answer `not_modified` |
| revision while `data.age_min` moved 22 -> 23 over 65 s | n/a | **identical** (`82c6f742`) — the nested clock field is excluded, proven by measurement |
| page | area rows, no feed link | 5 area rows, each ending `feed: /api/area/<id>` |

Tests: `rt-api.test.mjs` **80 -> 153 assertions**, `areas.test.mjs` **63 -> 67**, both 0 failed. Mirror byte-identical,
ASCII-only, `node --check` clean. Deploy gate green on all three PRs.

## 3. Corrections (things I got wrong and fixed)

- **The page claim in #2523 was false.** I edited `areaSectionsHtml` and said the page now rendered clean areas. `humanHtml`
  renders areas through `focusRowsHtml`; `areaSectionsHtml` has no call site. #2532 reverts that edit and puts the feed link
  on the renderer the page actually uses, with the test asserting against `focusRowsHtml`.
- **Two meanings of `live` in one response.** `by_area[].live` meant "every member read is live"; the feed's own `live:true`
  means "computed at request time". Renamed `all_members_live`.
- **A 500 I introduced.** `decodeURIComponent` on the raw id segment; malformed input became an error in the fleet's own
  error accounting. Guarded.

## 4. Verified and deliberately NOT changed

- **`HEAD` on a public read answers 404** — but so does `HEAD /api/areas` and `HEAD /api/live`; only `/health` answers HEAD.
  Pre-existing convention, left alone.
- **`a%00b` in the id answers 400 from the runtime**, before this worker sees it. Platform behaviour.
- **`areaSectionsHtml` is dead code.** Left in place rather than rewired or deleted; the comment in it no longer claims to be
  the page.
- **Ten route literals appear more than once** in `worker.js` (`/api/owner/respond` x3, `/api/changelog` x2, …), so a blanket
  "no duplicate route" test is not safe. The shadowed-ga4 defect class is guarded **behaviourally** (K17/K18: the route
  answers the ledger and revalidates), not structurally.
- **19 of 32 suites fail on this machine** with `column index out of range` under Node 22.16 `node:sqlite`. The identical set
  fails on a pristine `git archive` of `main`; CI's gate passes. No new failures, but the full suite was not green locally.

## 5. What is still not live (the honest remainder)

1. **The metrics themselves lag, and the feed now says so.** On 2026-10-18 20:02Z, 196 of 227 registry entries were under an
   hour old, 14 between one and six, **17 over six hours (oldest 18 h)**. Live `data.age_min`: cost 31, reach 0, reliability 31,
   autonomy 810 (13.5 h), research 971 (16.2 h). The feed is computed at request time; the numbers it reports are not
   real-time. Fixing that is the metric producers' work (`qnfo-fleet-control`, `q08-signal-engine`, the attention loop), not
   this worker's.
2. **Snapshot-backed reads** (`/api/state`, `/api/actions`, `/api/integration`, `/api/decision`, `/api/live`) can still be up
   to 15 minutes old on the first poll after quiet. They declare `lag_s: 900` and report `state_age_min`.
3. **Cost per area call is ~1 s** (`currentState` + `humanView` + `areasModel`). Six areas fanned out every minute is six
   times `/api/areas`. A selector (`?areas=cost,reach`) or slicing client-side from one `/api/areas` call would halve it; not
   done.
4. **`platform` reports no metrics**, so `data.age_min` is `null` there by design, never a fabricated zero.
5. **Open issues that touch adjacent ground but are NOT resolved by this:**
   - #2935 GA4-PROPERTY-MISMATCH-1 (ingest reads 1 pageview vs RUM 1264) — the *feed* was fixed, the *ingest* is not.
   - #2923 INTEG-GA4-READ-1, #2936 SEARCH-CONSOLE-INGEST-1 — untouched.
   - #2864, #2851 CODE-LOOP-EXHAUSTED-1 for this same file — untouched, and the orchestrator still holds the work claim.

## 6. Handoff

- **Read the boundary from the API, not from code:** `GET /api` is the contract (`areas`, `by_area`, and per row `area`,
  `source`, `lag_s`). A new read must name its area on the `API_INDEX` row; `rt-api.test.mjs` K3/K4 fail the build otherwise.
- **Adding a read?** Give it an `area`; if it is computed from D1 at request time say `source: "live"`; if it reads
  `fleet_dashboard_state` say `snapshot` **and use `freshState`**, not `loadState`, or it will repeat the
  never-refreshing defect.
- **Work-claim contention:** `file:qnfo-fleet-dashboard/worker.js` is held by `qnfo-code-orchestrator:ct_im2936`
  (SEARCH-CONSOLE-INGEST-1) — since 19:37Z, renewed, refusing acquisition. This session worked on branches without the claim;
  the next session should acquire it or expect the orchestrator's edits to move under it.
- **Regression guards:** `rt-api.test.mjs` sections A-J (read contract) and K (area feeds, ga4, malformed escapes);
  `areas.test.mjs` (model + `focusRowsHtml`). Run `node rt-api.test.mjs` and `node areas.test.mjs` in
  `qnfo-fleet-dashboard/` — both are fast and need no credentials.
- **If the metrics lag matters more than the API shape**, the next unit of work is a per-metric refresh-age breach trigger,
  which is a D1 trigger plus a producer fix, not a dashboard change.
