# WebMCP on the QNFO fleet (WEBMCP-FLEET-1)

WebMCP is the browser standard behind `document.modelContext` (Chrome 146+, developer preview; Cloudflare's
announcement: <https://blog.cloudflare.com/webmcp/>). A site registers MCP tools with `registerTool()`, and an agent
visiting the page calls those tools instead of guessing its way through a page built for humans.

Cloudflare's own preview is a Dashboard toggle per zone ("Agent Readiness > WebMCP") that injects a bridge and two
packs (C2PA, and a proxy to the site's own MCP server). That toggle is not reachable from this fleet's tooling: the
Cloudflare API token in use cannot write zone Snippets (`PUT /zones/<id>/snippets/...` -> HTTP 403 "snippets are not
allowed", needs `snippets.write`) and cannot mint a wider token (`GET /user/tokens` -> 403). Probed 2026-10-25.
The fleet therefore carries its own implementation, which has the further advantage of exposing QNFO's real
operations rather than a generic image-metadata reader.

## What ships

| Surface | Path | Served by |
|---|---|---|
| Bridge (browser module) | `/.webmcp/bridge.js` | every HTML worker below |
| Tool manifest | `/api/webmcp/manifest.json` (what the bridge reads) and `/.webmcp/packs.json` (alias) | every HTML worker below |
| Manifest + paths | `/.webmcp/manifest.json` | every HTML worker below |
| Injection | one `<script type="module" src="/.webmcp/bridge.js" data-packs="...">` appended to `<head>` of every 200 HTML response | HTMLRewriter in the same worker |

Workers carrying it: `qnfo-gateway` (qnfo.org, www, papers, archive, legal, qwav.tech), `qnfo-fleet-dashboard`
(fleet.qnfo.org), `idea-hub` (ideas.qnfo.org), `q08-signal-engine` (q08.org), `q08-mind` (mind.q08.org),
`qnfo-ai-search` (ask.qwav.tech), `qnfo-ipatent` (ipatent.qnfo.org), `qnfo-lifecycle` (empoweringchange.today,
ipatent.me, q-wave.tech, qwave.tech, qwav.net, qwav.uk and the retired-name subdomains), `personal-companion`
(reading/travel.q08.org) (qnfo-email is deliberately excluded: `qnfo.org/email/` answers 401 to an anonymous visitor, so there is no public page to inject into).

## Packs

A pack is a named group of tools. The bridge composes the packs named in `data-packs`; the manifest is generated from
the same table, so the two cannot disagree.

| Pack | Hosts | Tools |
|---|---|---|
| `site` | every host | `get_page_context`, `read_page`, `list_site_pages` |
| `papers` | qnfo.org, papers.qnfo.org | `search_papers`, `get_paper`, `get_paper_markdown`, `get_paper_digest` |
| `fleet` | fleet.qnfo.org | `fleet_status`, `fleet_attention`, `fleet_cost`, `fleet_areas` |
| `ideas` | ideas.qnfo.org | `list_ideas`, `list_proposals` |
| `signals` | q08.org | `list_signals`, `list_forecasts`, `signal_metrics` |
| `ask` | ask.qwav.tech / .org | `ask_corpus`, `recent_questions`, `corpus_stats` |
| `ipatent` | ipatent.qnfo.org, ipatent.me | `search_disclosures`, `ipatent_status` |
| `mind` | mind.q08.org | `list_entries` |

Every tool is a **same-origin** HTTP call to an endpoint this fleet already serves. The bridge runs in the visitor's
page with the visitor's session: a tool that reached another origin would hand this origin's tools to a page we do not
own, and a proxy that accepted a caller-supplied absolute URL would be an SSRF surface on every page of every host.
`read_page` therefore refuses any argument carrying a URL scheme.

## Editing

1. Change the pack table or the bridge in `_shared/webmcp.js` — never inside a worker. Bump `WM_VERSION`.
2. `node scripts/webmcp-apply.mjs` — inlines the block into all ten workers (idempotent; a re-run is a no-op).
3. `node --test _shared/webmcp.test.mjs` — manifest well-formedness, route surface, attach idempotency, and the bridge
   end to end under a mock `modelContext` (registration count, relative paths, refusal of a foreign URL).
4. `node scripts/webmcp-smoke.mjs` — imports each patched worker and calls the three paths through its real default
   export.
5. Commit, then deploy through the canonical route (`POST /ops/deploy {worker, path}` — lock, GitHub source, binding-
   preserving PUT, live verify, schedules).
6. `node scripts/webmcp-verify.mjs` — live: injected tag, bridge, manifest, and a real sample call per tool.

## Honest limits

- Chrome 146 is a developer preview; a browser without `document.modelContext` gets no registration. The bridge then
  reports `window.__webmcp.mode = "standalone"` with the tool list still discoverable, and the page is otherwise
  untouched. Nothing is claimed that the browser did not do: `registered` is only set after `registerTool()` returned.
- The tools are public reads. A write tool (idea intake, newsletter signup) is deliberately absent until it carries the
  same owner gate it carries on the page; a WebMCP tool that skipped it would be an authentication bypass with a nicer
  name.
- The injected tag depends on the worker answering the page. A host served by something else (a Pages project, a third
  party) is not covered, and `scripts/webmcp-verify.mjs` is what says so.

## Rollback

Revert the worker's version (the block is inert for any client without `modelContext`) or re-deploy the previous
commit. No data, binding, route or schedule changes were made by this feature.

## Correction, v1.2.0 (2026-10-25, from the red-team FAIL)

Four measured defects, each fixed and each now locked by a test or a live probe:

1. **The deployed artifact was not the source.** The first deploy shipped v1.0.0 while the module had moved to v1.1.0: `webmcp-apply.mjs --check` reported 10/10 stale. `--check` is now the gate, and it exits 0.
2. **The manifest sat under a prefix Cloudflare owns.** On a zone with the WebMCP preview on, the edge answers `/.webmcp/bridge.js` (75,756 bytes of the platform bundle) and `/.webmcp/packs.json` 404s without reaching the worker. The bridge now reads `/api/webmcp/manifest.json`; `/.webmcp/packs.json` stays as an alias for hosts where the prefix is free.
3. **A tool was advertised that answers 503.** `ideas /api/proposals` was removed from the manifest; probes on 2026-10-25 gave `ideas /api/sessions` 200, `q08 /api/metrics` 200, `POST ask.qwav.tech/api/ask` 200.
4. **A duplicate bridge on the flagship zone.** Read out of the platform bundle, `selectActivePacks()` keeps only the pack names it bundles and does **not** fall back to its defaults, so a second tag carrying `site,papers` downloads the same bundle, registers zero tools and logs two warnings. `wmPlatformOn()` now suppresses our tag on `qnfo.org` and `*.qnfo.org`; the worker supplies `/mcp` and the platform bridge registers it.
5. **`/mcp` did not exist, so the platform registered nothing.** The MCP server (Streamable HTTP, `initialize` / `notifications/initialized` / `tools/list` / `tools/call`) is the integration point; without it the platform site pack proxies a 404.
