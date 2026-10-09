# q08-signal-engine

> Aligned to docs/STRATEGY.md (STRATEGY-1, 2026-10-01). Where they differ, STRATEGY.md wins.

Autonomous signal engine serving https://q08.org — systems-level critiques of technical-industry friction, generated from HN/GitHub/arXiv signals and published as timeless long-form essays.

## Distribution (Q08-PERSONAL-CHANNEL-HOLD-1, 2026-10-01)
- q08 is a separate publication (docs/STRATEGY.md section 2.1). It is **not** distributed through the owner's personal
  accounts; it reaches readers through its own RSS feed and subscriber digest only.
- The social queue (`social_threads`, drained by qnfo-social onto the owner's personal Bluesky account) is held by the
  plain var `Q08_SOCIAL_QUEUE`: off unless set to `"1"`. It is the q08 kill switch in the owner-voice gates (STRATEGY
  section 5) and stays off until q08 has its own channel.
- Review 2026-10-31 on bot-filtered human reads; q08 is retired if it is under 50 human reads/week (STRATEGY section 7).
  The measurement and the reversible half of that decision are automated (Q08-REVIEW-2026-10-31, agent_issues 1716):
  qnfo-fleet-dashboard measures bot-filtered Cloudflare Web Analytics page views on q08.org and www.q08.org for
  2026-10-24..30, records the decision in qnfo-audit `ops_config.q08_review_2026_10_31` (`GET
  https://fleet.qnfo.org/api/q08-review`) and, under 50 a week, sets the cadence cap below to 2. Retiring the worker
  stays the owner's decision.

## Forecasts (Q08-FORECAST-1, v0.9.0)
q08 looks forward as well as back. Every `FORECAST_EVERY` (3) pieces, `generate()` writes a forecast instead of scraping a new
signal: it takes a published essay of the last 21 days (best reader score first, never one that already has a forecast) and
projects its mechanism forward.
- **What a forecast is.** One most-likely scenario told as a dated causal sequence, anchored on a real base case, with rival
  scenarios and their probabilities, leading indicators, and a resolution condition anyone can check. The main scenario must be
  at least as probable as every rival (maximum likelihood) and all stated probabilities sum to at most 1. Probabilities are
  the writer's judgments; the FACTS rule stands, so the only numbers it may add are future dates and those probabilities.
- **Machine record.** The writer ends the draft with one `FORECAST-JSON:` line (claim, probability, horizon, resolution,
  alternatives, indicators, watch_query, watch_urls). `parseForecastBlock` strips it, `validateForecast` checks it (horizon 14..730
  days ahead, the stated percent appears in the prose), and `persistPiece` stores it in D1 `q08_forecasts` and sets
  `published_pieces.kind = 'forecast'`. Both are created lazily by `ensureForecastSchema` (no migration for the q08-signal D1).
- **Same quality stack as essays.** Deterministic gate, one corrective retry, the two-family reader panel (with a forecast
  reader prompt) and the cross-family editor round. A rejected forecast is logged as a `gate_failed` run (`forecast: ...`) and the
  analysis path still runs that tick; an essay is not retried after 2 rejected forecast drafts, and 3 rejections in a UTC day
  hand the rest of the day to essays.
- **Settling.** After every generation cron, `resolveForecasts` checks up to 2 open forecasts whose horizon has passed: it
  gathers evidence (Hacker News stories since the forecast, plus up to 2 public https `watch_urls`) and asks two judges from
  different families for `yes | no | unclear` from that evidence only. Two agreeing yes/no settle it and record the Brier score
  `(p - outcome)^2`. Anything else is rechecked weekly; after `FORECAST_MAX_CHECKS` (4) it is marked `void` with its disposition,
  shown publicly and counted. Nothing is dropped silently, and nothing is resolved by hand.
- **Evidence (Q08-FORECAST-SOURCES-1).** Settling reads several independent public sources, each failing on its own: Hacker
  News, worldwide news (GDELT), Wikipedia and arXiv, plus the writer's `watch_urls`. The writer is told to follow the mechanism
  into the non-tech systems it touches (regulation, labour, energy, finance, science). Not yet widened: the scrape that
  produces the essays (HN, GitHub, arXiv) still feeds every forecast's source essay.
- **Promotion (Q08-FORECAST-PROMOTE-1, owner directive 2026-10-09).** Each published forecast, and only forecasts, is queued once
  in `social_threads` for qnfo-social's cross-post (the owner's Bluesky plus Buffer: Mastodon, LinkedIn, X) as `Forecast, 55%:
  <claim> / Settles by <date>, scored in public: <permalink>`, with IndexNow, RSS, sitemap and the digest as before. qnfo-social's
  own cadence caps and gates still apply. `Q08_SOCIAL_FORECASTS = "0"` in wrangler.toml stops it; essays remain held by
  `Q08_SOCIAL_QUEUE`.
- **Reach (Q08-REACH-1).** Every piece page has one-tap share links (Bluesky, X, LinkedIn, Mastodon, Hacker News, Reddit,
  email), a copyable citation, Scholar-style `citation_*` meta tags and fuller Article JSON-LD; a forecast page invites readers to
  post their own probability. `GET /p/<slug>.bib` and `.ris` serve citation files; forecasts are marked as the
  "q08 Forecast Ledger" series in JSON-LD. Queued posts lead with a hook: forecasts as `Forecast, N%: <claim>` ending "What is your number?",
  essays as title plus the piece's opening sentence, always ending in the untruncated permalink.
- **Funnel (Q08-FUNNEL-1).** q08 is the attention surface and QNFO the authority behind it: each piece links to papers.qnfo.org,
  iPatent and qnfo.org with `utm_source=q08&utm_campaign=<slug>` (counted by the gateway's UTM ledger), and its JSON-LD names QNFO
  as parent organization. QWAV (parked label) and the personal reading site are not linked. The return path (qnfo.org and the
  papers linking to the Forecast Ledger) belongs to the QNFO web surfaces, not this worker.
- **Public record.** `GET /forecasts` (open, settled, void, calibration), `GET /api/forecasts` (rows plus stats), a
  "Forecast record" box on each forecast page, a Forecast badge on the index, a line in the daily digest. Under 20 resolved
  forecasts the page says a score is mostly noise. Voided forecasts are unscored, so `q08_forecast_void_share` guards against
  hiding misses.
- **Knobs.** qnfo-audit `ops_config q08_forecast_max_per_day` (0..10, default 3; 0 turns forecasts off, essays unaffected).
  Forecasts count toward `q08_max_per_day`.
- **Metrics.** `q08_forecasts_overdue_open` (target 0) and `q08_forecast_void_share` (target <= 0.5), registered by
  migrations/2026-10-09-q08-forecast-metrics.sql with triggers.
- Tests: `forecast.test.mjs` (validator, parser, calibration, judge aggregation, and the real handlers over in-memory SQLite).

## Cadence cap (Q08-CADENCE-CAP-1, v0.7.37)
- Before each generation (cron or `POST /run`) the engine reads qnfo-audit `ops_config` key `q08_max_per_day`: an
  integer 0..10 caps the essays published per UTC day (0 pauses publishing). Absent, unreadable or invalid means 10, the
  behaviour before the knob. A run past the cap returns before any scrape or AI call. `/health` shows `daily_cap`.
- Undo a cut by deleting the row or raising it.

## Runtime
- Worker: `q08-signal-engine` (Cloudflare Workers ES module, entry `worker.js`)
- Route: `q08.org/*` and `www.q08.org/*` → this worker (Workers routes; www.q08.org was previously a qnfo-hub Pages custom domain — removed 2026-09-14)

## Bindings
| binding | type | target |
|---|---|---|
| AI | Workers AI | catalog (`@cf/openai/gpt-oss-120b` et al.) |
| DB | D1 | q08-signal (10fd74b7-c4b3-43c7-9ca5-855213f44a69) |
| AUDIT | D1 | qnfo-audit (35e2e573-92f3-46ac-83c6-22f6429fc5e5) |
| EMAIL | Service | qnfo-email (production) |

## Cron triggers
- `0 */2 * * *` — generate (scrape → score → compose → gate → publish)
- `0 17 * * *` — daily subscriber digest

## Math rendering (MATH-RENDER-FLEET-1)
Every HTML page (piece + index) loads MathJax 3 `tex-svg` with a jsDelivr→unpkg fallback and an explicit load-time typeset. Delimiters: inline `\(...\)`, display `\[...\]` / `$$...$$`.

**Single-dollar `$...$` is deliberately DISABLED.** q08 prose is LLM-generated and can contain currency (`$5 million`), which MathJax would typeset as garbage under `$...$`. The canonical head snippet lives here as `q08-signal-engine/math_head.html` and is shared across fleet surfaces.

`mdEmph()` protects math spans so the `_…_ → <em>` pass cannot corrupt subscripts.

## Sources & further reading
Each piece renders a footer from `published_pieces.sources_json` (`[{label,url}]`). `persistPiece()` writes it from the originating signal: GitHub repo / arXiv / article host + Hacker News discussion link.

## Version history
- **v0.6.2** (2026-09-14) — RSS `renderFeed` strips raw LaTeX delimiters from descriptions.
- **v0.6.1** (2026-09-14) — safe math delimiters (dropped single-`$`); Q08_DIRECTIVE locks `\(...\)`/`\[...\]`; currency-corruption adversarial test passes.
- **v0.6.0** (2026-09-14) — MathJax rendering + Sources footer + math-aware `mdEmph()` + `sources_json` persistence.
- v0.5.0 and earlier — pre-math-render baseline.

## Deploy note
ES-module workers reject `curl -F` multipart uploads (error 10021 "No such module"). Use a spec-correct multipart PUT (metadata part without filename; module part named exactly = `metadata.main_module`).
