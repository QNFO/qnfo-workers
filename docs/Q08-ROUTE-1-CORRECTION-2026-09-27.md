# Q08-ROUTE-1 — correction to this PR's evidence (2026-09-27)

Status: **supersedes the "Live proof" paragraph in PR #14's description**, which cannot be edited
with the tooling used to open it.

## 1. What the PR description got wrong

It claims: *"Live proof (external egress, 2026-09-26): https://q08.org/ 200,
`<title>QNFO — Research Foundation</title>` … byte-identical 20,563-byte body."*

That observation was a **same-zone fetch artifact**: the fetcher ran inside the QNFO
account/zone, so it bypassed the edge redirect and reached the Pages origin directly.
Re-probed 2026-09-27 from true external egress (Cloudflare Container, no Worker context):

| URL | Status | Location |
|---|---|---|
| `https://q08.org/` | 301 | `https://qnfo.org/` |
| `https://q08.org/p/xyz-1234` | 301 | `https://qnfo.org/` |
| `https://www.q08.org/` | 200 | — (1,128 bytes) |
| `https://archive.qnfo.org/` | 200 | — (13,124 bytes) |

Random and real paths 301 identically ⇒ one **wildcard, host-scoped** rule on the apex.

## 2. Root cause, corrected

- The apex 301 is **not emitted by any repo code**: `qnfo-web-unified/hub-worker.js` is
  1,161 bytes with **0** occurrences of `301`, `302`, `Location` or `redirect`. It only renders
  a host-keyed title map, which still contains
  `'q08.org': { title: 'QNFO', tag: 'Research foundation' }` (line 13).
- It is therefore **zone-level redirect configuration** on the `q08.org` zone
  (redirect rule / bulk redirect / page rule — type not readable: no worker in the fleet calls
  any zone-level Cloudflare endpoint).
- `q08.org` and `www.q08.org` are still **active custom domains on the `qnfo-hub` Pages project**
  (`qnfo-audit.audit_pages` id=11, `status=active`, `last_deployed=2026-07-16`), contrary to
  `q08-signal-engine/README.md`'s claim that www's Pages custom domain was "removed 2026-09-14".

## 3. Two blockers for the route fix as written

1. **Zone redirect vs Worker route precedence — unverified.** If the zone-level redirect runs
   before Worker routes in the request pipeline, adding
   `routes = [{ pattern = "q08.org/*", zone_name = "q08.org" }]` will **not** change external
   behaviour. The Cloudflare docs pages fetched 2026-09-27 (`/rules/reference/`,
   `/workers/configuration/routing/routes/`) returned navigation only, so this remains open.
2. **Worker route vs Pages custom domain on the same hostname** — precedence not established by
   the evidence gathered.

## 4. Why merging this PR changes nothing in production

- `archive.qnfo.org` is served by the **qnfo-publications** Pages project (audit_pages id=12);
  `q08.org` by **qnfo-hub** Pages (id=11).
- No workflow deploys Pages (the repo has 5: `deploy-drift`, `deploy-gate`, `indexnow-submit`,
  `mirror-guard`, `version-compare`).
- `qnfo-fleet-control` (112,062 bytes) issues only: `workers/scripts/{name}/content` PUT,
  `workers/scripts/{name}/schedules` PUT, `workers/scripts` GET, `workers/scripts/{name}` DELETE.
  Grep hits: `pages` 0, `zones` 0, `/routes` 0, `workers/domains` 0.

⇒ Merging installs no routes and deploys no Pages artifact. The route change needs a
zone-scoped `wrangler deploy` of `q08-signal-engine` under the `deploy_guard` lock; the archive
page needs a `qnfo-publications` Pages deploy.

## 5. Independently re-verified in this PR (2026-09-27)

Fixed file `qnfo-web-unified/archive-qnfo.html` at commit
`b804e5145f6b90309b075978e7bbfb1712874a9e` (12,560 bytes, fetched directly):
stale `2,500+` / `658+` / `1,400+` = 0 occurrences; `8,353` and `8,502` present;
`<style>` closed; `.archive-grid{grid-template-columns:1fr}` restored; unified override block
moved after both media queries; `--muted` alias present; style-block braces balanced 51/51.

Live defect confirmed with a real CSS parser (tinycss2) on `archive.qnfo.org`: 1 style block,
34 rules, 160 declarations, **2 declaration-level parse errors**, with the corrupt lines present
verbatim — `<style` followed immediately by `@import` (no closing `>`), and
`.archive-grid{grid-template-column` … `s:1fr}` split by the injected override block.

Numbers: `graph-api.qnfo.org/stats` totalNodes **8353** / totalEdges **8502** = `qnfo-graph` D1
nodes **8353** / edges **8502**; `papers.qnfo.org/papers?format=json` total **444**.
Note the living-paper D1 `papers` table holds **904** rows (438 published, 187 kg-backfill,
156 duplicate, 117 quarantined, …) — the page's "444" is the **public-API** count, not the D1
row count, so the page wording should stay tied to the public listing.

## 6. Required owner actions (outside the fleet's API surface)

1. Zone-scoped credential: read/disable the `q08.org` apex redirect construct, and remove
   `q08.org` + `www.q08.org` from the `qnfo-hub` Pages custom domains.
2. `wrangler deploy` of `q08-signal-engine` (routes in this PR) under `deploy_guard`.
3. Pages deploy of `qnfo-publications` with the corrected `archive-qnfo.html`.

## 7. Unresolved inconsistency (flagged, not load-bearing)

A 2026-09-26 DNS probe showed `www.q08.org` CNAME'd to `q08-archive.pages.dev`, while
`audit_pages` id=11 lists `www.q08.org` under the `qnfo-hub` Pages project. The mirror may be
stale (its `last_deployed` is 2026-07-16). Both cannot be current; DNS was not re-probed on
2026-09-27.
