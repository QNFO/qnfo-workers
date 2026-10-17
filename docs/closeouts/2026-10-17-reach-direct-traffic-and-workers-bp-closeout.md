# Closeout — fleet dashboard direct-traffic visibility + Workers best practices (2026-10-17)

Owner directives this thread, in order:

1. "I NEED TO SEE ON FLEET DASHBOARD WHAT PAPERS AND LINKS ARE ACCESSED DIRECTLY FROM CLOUDFLARE ANALYTICS/LOGS NOT JUST SOCIAL MEDIA CLICKS. CONTINUE FLEET DASHBOARD REFACTORING"
2. "CONTINUE TO REFACTOR AND UPGRADE FLEET DASHBOARD. IMPLEMENT BEST PRACTICES"

All measurements below are against `qnfo-audit` (D1 `35e2e573-92f3-46ac-83c6-22f6429fc5e5`) and the live worker `https://fleet.qnfo.org`, unless marked unverified.

---

## 1. What was shipped, deployed, verified

| version | change | verified by |
| --- | --- | --- |
| `1.40.0-reach-direct-traffic` | `/kpi` Reach section gains **"Top papers, opened directly (7 days)"** and **"Top links, opened directly (7 days)"**, read from `reach_signals` source `cf-rum-human` (Cloudflare Web Analytics RUM page loads, bots excluded), grouped per paper slug and per page. The links list excludes the fleet's own surfaces (`fleet.qnfo.org`, `ideas.qnfo.org`, `*.workers.dev`) so the owner's own browsing is not reader traffic. This is the direct-traffic complement to the social-post click counts under "Most popular posts". | `/health` = `1.40.0-reach-direct-traffic`; `/api/kpi` returns `reach.direct_traffic` with 12 papers + 12 links; `/kpi` HTML renders both cards; new SQL smoke-tested against live D1 (exclusion confirmed) |
| `1.40.1-workers-bp-logging` | Workers best-practices pass. The request-handler catch and the cron (`scheduled`) catch now `console.error(JSON.stringify({…}))` the failure (they previously returned the error without logging, so unhandled failures were invisible). The 7 remaining string-concatenated `console.log`/`console.error` calls converted to structured `JSON.stringify`. No control-flow changes. | `/health` = `1.40.1-workers-bp-logging`; `node --check` exit 0; worker.js ↔ deployed-current.worker.js byte-identical |

Both merged to `main` as PRs #1403 and #1407; `mirror-guard` and the `gate` (wrangler `deploy --dry-run` + test suite) green on both.

**Top-of-list result at closeout:** papers — `non-computable-reals…` (11), `hindsight-hierarchies…` (10); links — `q08.org/` (301), `qnfo.org/` (211), `papers.qnfo.org/papers` (183).

## 2. Deploy-path correction (do not relearn the old one)

The prior handoff claimed code ships via `scripts/direct_content_deploy.py`. **That script no longer exists.** Verified deploy path (2026-10-17):

- `canonical-deploy.yml` still fails on every merge (`OPS_ROUTER_AUTH_KEY` empty) — it is **not** the working path.
- The working path is the qnfo-ops **`cf_worker_deploy`** route (`deployment_history.deployed_by = 'qnfo-ops:cf_worker_deploy'`, preserves 20 bindings, applies observability), triggered by **`fleet-autodeploy.yml`** on push to main + `workflow_run` chained off mirror-sync.
- A merge to `main` auto-deploys in ~60 s (measured: 1.40.0 live ~60 s after merge `28fbe4f6`; 1.40.1 live ~75 s after merge).

## 3. Workers best-practices audit — already compliant (no change needed)

`compatibility_date` 2026-10-10 (recent); `nodejs_compat` default-on; `observability` logs+traces enabled; 0 `Math.random()`; 0 `passThroughOnException`; owner-code compare already timing-safe (`constEq(sha256hex(...))`); service bindings not REST; secrets via `wrangler secret`; 0 statement-level floating promises; no request-scoped module state (module vars are constants + a public-data TTL cache); bounded buffering only; 29 `ctx.waitUntil` usages.

Deliberately not changed: `wrangler.toml` → `wrangler.jsonc` (existing project, TOML convention, deploy reads TOML), observability `head_sampling_rate` placement (deploy reports `observability=applied`), monolith split (not mandated, high drift/test risk).

## 4. Open — with the evidence needed to finish

1. **`kpi.test.mjs` offline suite is pre-existing-broken** and crashes before the reach assertions. Running `node --no-warnings qnfo-fleet-dashboard/kpi.test.mjs` on `origin/main` (baseline) and on both 1.40.x trees fails identically at line 131: `I.code_tasks` is `null`, plus 5 FAILs in the issue-lifecycle section (`opened per day`, `closed per day`, `24 h`, `7 d`). This is a `node:sqlite` vs D1 artefact (the `code_tasks` query / `strftime('…','unixepoch')` handling), **not** caused by the reach changes — the reach/direct-traffic assertions are never reached because the suite crashes first. Fixing it unblocks coverage of the reach shaping the new panels depend on.

2. **Direct-traffic data is a daily snapshot.** `cf-rum-human` is ingested once per UTC day for the day before, so the "7 days" panels lag up to ~24 h. RUM samples page loads, so counts are a lower bound, and page-level granularity is pageviews only (no per-page visits/unique visitors). Documented in the panel's source note; not a bug.

3. **Known limitation of the direct-traffic links list:** it cannot attribute *who* opened a page (only counts), and it groups by host+path so the same page with a query string is a distinct row (not observed in practice — the gateway classifies path-only).
