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
signal: it takes an audited published essay of the last 30 days (best reader score first, never one that already has a forecast) and
projects its mechanism forward. A forecast is also due when none has been published that UTC day, independently of essay cadence;
the existing daily caps and rejection backpressure still apply.
- **Research (Q08-FORECAST-RESEARCH-1, #4291, pillar reach).** Before writing, the engine queries Hacker News, GDELT,
  Wikipedia and arXiv using up to six entities from the essay, then reads linked pages (arXiv HTML, not abstract pages)
  and external primary-source links. It requires 6–15 usable sources, with at most 15 page fetches, 40,000 characters
  per page, and 60 verbatim numbered sentences carrying URL and date (retrieval date when publication date is unknown).
  Insufficient research is logged as deferred and retried next tick, not composed against the essay alone.
  Dated precedents and base rates may come from this ledger; unsupported facts still fail the accuracy checks.
  The essay, signal and ledger snapshot is stored in `q08_forecasts.ground_json` atomically with the publication,
  and every ledger URL enters `sources_json`. Re-audits read that snapshot rather than refetching changed material.
  Research defaults on; `ops_config q08_forecast_ledger = off` restores the legacy single-essay path.
- **What a forecast is.** One most-likely scenario told as a dated causal sequence, anchored on a real base case, with rival
  scenarios and their probabilities, leading indicators, and a resolution condition anyone can check. The main scenario must be
  at least as probable as every rival (maximum likelihood) and all stated probabilities sum to at most 1. Probabilities are
  the writer's judgments; the FACTS rule stands, so the only numbers it may add are future dates and those probabilities.
- **Machine record.** The writer ends the draft with one `FORECAST-JSON:` line (claim, probability, horizon, resolution,
  alternatives, indicators, watch_query, watch_urls). `parseForecastBlock` strips it, `validateForecast` checks it (horizon 14..730
  days ahead, the stated percent appears in the prose), and `persistPiece` stores it in D1 `q08_forecasts` and sets
  `published_pieces.kind = 'forecast'`. Both are created lazily by `ensureForecastSchema` (no migration for the q08-signal D1).
- **Secondary predictions.** Optional `secondary_claims` (up to five) use the same claim, probability, horizon,
  resolution and watch-source validation. They are stored as immutable dated rows in `q08_forecast_claims`,
  shown on the piece page and `/api/forecasts`, and independently settled by the existing two-judge process,
  with the same recheck interval, four-check void rule and Brier formula. Retraction voids open child claims;
  resolved scores are retained. Main-claim calibration remains unchanged.
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
- Tests: `forecast.test.mjs`, `forecast-ledger.test.mjs`, `forecast-research.test.mjs` (including archive cadence,
  research minimum, atomic rollback, snapshot re-audit and secondary settlement).
- Closing probe for agent issue 1000268: at least three engine-created open forecasts in seven days, with
  nonempty stored research snapshots and no retracted engine forecasts in that window. Merge alone does not prove this outcome.

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

## Accuracy (Q08-VERIFY-1, 0.10.0)
Owner directive 2026-10-10: every claim in a q08 piece is independently verified; nothing unverifiable is published. A 2026-10-10 essay stated invented history (goldsmith "trial stamps", a patent-medicine brand, a car model, a statute). Cause: the writer prompt asked for named historical precedents "from real, verifiable history", i.e. from the model's memory, and nothing checked them.
- **Source material only.** The writer is given the signal and the fetched text of the linked article (`fetchArticleText`) and told its memory is not a source. Outside cases are allowed only as labelled hypotheticals that name no real person, company, product, date or number.
- **Deterministic check** (`groundingProblems`): every capitalised name, year and figure in the draft must occur in the source material (small counts, months and days excepted; in forecasts also future years, probabilities and horizons).
- **Two-family review** (`factCheck`): two reviewers from model families other than the writer's list every real-world claim the source does not state; one unsupported claim fails the piece. One corrective revision (`verifyAndRevise`) is allowed, then `gate_failed` ("accuracy: ..."). Fewer than two valid verdicts is a failure, not a pass.
- **Repair progress** (Q08-RETRY-PROGRESS-1, 0.35.1): a repair that returns exactly a draft already rejected in that `verifyAndRevise` call ends as an accuracy failure before another verification. This includes a no-op revision and a revision that restores an earlier failed draft after pruning. The repair trail names the stop; changed drafts still get full deterministic and independent review, and no verdict is cached across calls. It does not stop on a repeated claim class or an unchanged error count alone. `retry-progress.test.mjs` compares calls with the prior loop and checks improving repairs, outages, grounding, and final publication gates. Live run 955 spent 7 compose and 16 fact-check calls on a failed repair path, but its log contains no draft texts: exact-cycle savings on that run are unproven.
- **Reviewer output is read as what it is** (Q08-REVIEWER-HYGIENE-1, 0.36.0): an object a reviewer printed as a string (`{"fact":"FACT: ... -- reason"}`, kimi) is unwrapped to its claim; an item with no claim text (the word `reason`, or only a reason) is set aside, and a fail that names nothing else still fails closed; an item whose own closing clause says the claim is supported (`..., so supported`) is acquitted, neither deleted nor failed. A reviewer reply that names a real unsupported fact (`date not in source`, `not supported`, `partly supported`) is untouched. `reviewer-hygiene.test.mjs`.
- **Ledger tags in every form** (Q08-LEDGER-TAG-FORMS-2, 0.36.0): `[S3]` copied into a draft goes in square, round, curly, fullwidth and lenticular brackets, in lists, after a dagger line reference and as `[ledger S3]`; a lone `(S3)` below S10 stays (Amazon S3). Before this, 38 accuracy failures in 14 days listed the ledger numbers as figures and the tags as names. The pre-check stage row now carries 24 characters of context around each flagged item (Q08-PRECHECK-CONTEXT-1), because the drafts of failed runs are not stored.
- **Writer order by end-to-end yield** (Q08-WRITER-ORDER-2, 0.36.0): nemotron, gpt-oss, kimi (10.2%, 1.7% and 0.9% of runs published in the 14 days to 2026-10-26), not by the writer-gate pass rate, which only says a draft had a title, a lede and no banned phrase. `ops_config q08_compose_order` (comma-separated model ids) overrides without a deploy; unlisted writers stay available as fallbacks.
- **Retraction rate** (Q08-RETRACTION-METRIC-1, 0.36.0): `q08_retraction_rate_30d` is the share of the pieces published in 30 days that carry a `q08_retractions` row (0.793 on 2026-10-26); unknown under 10 pieces. It is an outcome measure of the output-quality ledger (`docs/OUTPUT-QUALITY-LEDGER.md`).
- **Reviewer order** (Q08-REVIEWER-SWAP-1 and Q08-REVIEWER-HEALTH-1, 0.31.0): the reader panel (`PANEL_POOL`) and the fact-check (`FACTCHECK_POOL`) ask the reviewers that measurably answer first (panel: kimi-k2.6, deepseek-v4-flash-0731; fact-check: deepseek-v4-flash-0731, then the cheaper gpt-oss-20b, then kimi-k2.6, because a verdict pair costs 462 neurons against 972 for flash plus kimi and about 696 for the order before 0.31.0 while Workers AI spend is in breach) and keep the previous ones (glm-5.3-flash, qwen3.8-27b) as the per-request fallback. `reviewerHealth` reads this worker's two-day error share from `ai_call_counters` and moves a reviewer with 30% errors on 12 or more calls behind the others, so the previous order returns by itself if the new head fails; no AUDIT binding or a failed read means the declared order. Models that `scripts/model-floor-guard.mjs` bans (llama, qwen3-30b, gemma-4) are not candidates. Tests: `reviewer-pool.test.mjs`, `migrations/q08-gate-yield-metrics.test.mjs`.
- **Audit and retraction** (`auditPublished`, 4 pieces per generation cron): a published piece with no `q08_audits` row is checked the same way; a failure is retracted (`retractPiece`): `/p/<slug>` answers 410 with a public notice, the piece leaves the index, feed, sitemap, `/api/pieces`, the citation files and the Forecast Ledger, queued social rows are suppressed, and forecasts built on it are retracted and voided. `/retractions` and `/api/retractions` list them. To reverse a retraction, delete its `q08_retractions` row and set its `q08_audits` row to `pass` only after a clean check.
- Forecasts are built only from essays whose audit is `pass`.
- Tables `q08_retractions`, `q08_audits` (created by the worker on first use; the migration runner only reaches qnfo-audit). Tests: `verify.test.mjs`.
Known limits: reviewers are LLMs and can miss a claim; the deterministic check catches names, years and figures, not a wrongly stated relation between supported facts. The source article can be wrong or unreachable (then only the signal grounds the piece, which is stricter).

## Version history
- **v0.10.0** (2026-10-10) — Q08-VERIFY-1 accuracy layer (above).
- **v0.6.2** (2026-09-14) — RSS `renderFeed` strips raw LaTeX delimiters from descriptions.
- **v0.6.1** (2026-09-14) — safe math delimiters (dropped single-`$`); Q08_DIRECTIVE locks `\(...\)`/`\[...\]`; currency-corruption adversarial test passes.
- **v0.6.0** (2026-09-14) — MathJax rendering + Sources footer + math-aware `mdEmph()` + `sources_json` persistence.
- v0.5.0 and earlier — pre-math-render baseline.

## Deploy note
ES-module workers reject `curl -F` multipart uploads (error 10021 "No such module"). Use a spec-correct multipart PUT (metadata part without filename; module part named exactly = `metadata.main_module`).
