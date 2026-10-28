# BP26-PAPER-PIDS-1 and BP26-FORECAST-HYGIENE-1: research, design, state (2026-10-28)

Charter pillar: research. Program QNFO.RSCH, project BP26.EDITORIAL. agent_issues 1000338 (PAPER-PIDS) and 1000337 (FORECAST-HYGIENE); GitHub 4414 and 4413.
Status is at the bottom: what is shipped, what is a proxy, what is still open.

## 1. Standards read (primary sources) and what each requires of us

| Standard | Requirement that binds us | Where it lands |
|:--|:--|:--|
| CITATION.cff 1.2.0 (citation-file-format schema guide) | Required keys `cff-version`, `message`, `title`, `authors`; optional `version`, `date-released`, `identifiers`, `license` (SPDX), `url`, `abstract`, `keywords`; author `family-names`, `given-names`, `orcid` | `GET /papers/<slug>/cite.cff` (qnfo-gateway, ROADMAP-1 #2) |
| BibTeX / CSL-JSON | `@article`/`@misc` with `url`, `year`, `version`; CSL-JSON `type`, `title`, `author[]`, `issued.date-parts`, `URL`, `version` | `/cite.bib`, `/cite.csl.json` (same task) |
| OAI-PMH 2.0 | `responseDate`, `request`, per-record `header` (identifier, datestamp in UTC granularity, setSpec), `oai_dc` mandatory, error codes (`badVerb`, `badArgument`, `idDoesNotExist`, `cannotDisseminateFormat`, `noRecordsMatch`) | already served at `/oai`; validated daily by the producer for `oai_pmh_validates` (PR 5068) |
| FAIR (Wilkinson 2016) | F1 persistent identifier, R1.1 licence, R1.2 provenance | version URL, sha256, `paper_change_ledger` |
| Crossref / DataCite DOIs | Membership fee: an identity-bound money decision, owner card `bp26-crossref-membership`. Until it is made, the versioned URL plus content hash is the identifier. No DOI of the retired deposit prefix is ever emitted (`lpDoi()`, NOZ-DOI-1). | unchanged |
| Metaculus question-writing guidelines | A question names its resolution source, the date, and what happens in the edge case | forecast gate (section 3) |
| ICD 203 / Good Judgment evidence | Updating is frequent and incremental; calibration and Brier are the judge | updates table, calibration page |
| Brier vs log score | Brier is bounded (always 50% scores 0.25); log score punishes confident misses without bound, so p is clamped to [0.001, 0.999]; both reported with always-50% baselines 0.25 and ln 0.5 = -0.693 | `calibration()` |

## 2. PAPER-PIDS design

- **Immutable version URL** `/papers/<slug>/v/<version>`: the current version is served from `papers`, an earlier version from `paper_change_bodies` (the last ledger row whose `version_before` is that version holds its final body). A version with no recoverable body is 404, never the current body.
- **Content hash**: SHA-256 of the served Markdown, as `X-Content-SHA256` and `sha256` in `/api/papers/<slug>`. `paper_version_immutability` then becomes the share of published versions whose stored hash equals the hash of the served body. Today `scripts/bp26_paperver.py` is a write-path proxy (body changed without a version bump in the ledger); it cannot see a body altered outside the ledger. The hash route is ROADMAP-1 #1.
- **Exports**: ROADMAP-1 #2. Session `session-exuvia-mcp-1` holds the qnfo-gateway claim for it on 2026-10-28; this work reviews rather than duplicates.
- **PAPER-LEDGER-1** is respected: nothing here writes `papers`. Any later per-version hash store is a new table keyed (slug, version), never an UPDATE on `papers`, never a mass change.
- **CITE-FULLTEXT-1 / OUTPUT-QUALITY**: exports carry metadata; the hash covers the full text. `paper_version_immutability` and `oai_pmh_validates` are integrity measures, not quality outcomes.
- Failure mode: the hash proves served = stored, not stored = what was cited. A citation made before hashing has no hash, so earlier silent edits stay invisible. The route documentation says so.

## 3. FORECAST-HYGIENE design (shipped in q08-signal-engine 0.38.0)

1. **Resolution criteria gate**: `validateForecast` refuses a resolution that does not name a source, a date and an edge-case rule; both prompts say so, and the existing retry loop repairs it. Text-pattern check only (the same three patterns as `forecast_resolution_criteria_complete`): words present, quality not judged. Forecasts published before 0.38.0 keep their text and may fail it; the metric reports them.
2. **Immutable published fields**: trigger `q08_forecasts_published_fields_immutable` aborts any UPDATE of slug, claim, probability, horizon, resolution or created_at. Status, outcome, brier, checks, disposition and evidence stay writable for the resolution flow.
3. **Updates are new rows**: `q08_forecast_updates` (append-only by trigger), written by `recordForecastUpdate` through `POST /api/forecasts/updates` with `x-loop-token` (it changes a published record; OPEN-ACCESS-1 exception). A row stores prior probability, new probability, a reason of 20-600 characters and an optional https evidence URL. Only an open forecast takes an update. `/api/forecasts` returns `original_probability` and `updates[]`.
4. **Scoring**: the original published probability is scored (Brier, as before) plus log score; updates are displayed, not scored in this slice. Failure mode: a forecaster who updates well gets no credit and one who updates late gets no penalty. Scoring the last update before the horizon beside the original is RM-FORECAST-UPDATE-SCORING-1.
5. **Calibration page** `/forecasts/calibration` and `/api/forecasts/calibration`: reliability diagram (SVG), bucket table, Brier and log score against the always-50% baseline, noise warning under 20 resolved forecasts. With 0 resolved forecasts it says there is nothing to plot.

## 4. Metrics and triggers

Registered already by `migrations/2026-10-26-best-practice-catalogue.sql`, each with a trigger: `oai_pmh_validates`, `paper_version_immutability`, `forecast_resolution_criteria_complete`, `brier_rolling_90d`. Producers: `scripts/bp26_paperver.py`, `scripts/bp26_forecast.py`, PR 5068. This work registers no new metric: the log score is shown on the page and API, and a metric for it is exempt until 20 forecasts have resolved (before then it would be a registered metric with no value, the METRIC-UNMEASURED-1 family). Roadmap rows and one code task: `migrations/2026-10-28-bp26-research-roadmap.sql`.

## 5. Status

| Item | State |
|:--|:--|
| Forecast gate, updates table, trigger, log score, calibration page | PR for q08-signal-engine 0.38.0; live check after the canonical deploy |
| Brier and criteria producers | merged (PR 5062) |
| paper_version_immutability producer | merged (PR 5063), proxy |
| oai_pmh_validates producer | PR 5068 |
| Version URL and sha256 | open, ROADMAP-1 #1, waits for the gateway claim |
| CITATION.cff / BibTeX / CSL-JSON | open, `session-exuvia-mcp-1` |
| DOI | IDENTITY-BOUND owner card `bp26-crossref-membership`, not touched |
| Each issue's definition of done (every metric at target on two consecutive refreshes) | not met; both issues stay open until it is |
