# Fleet best-practice catalogue 2026 (BP26)

Owner directives 2026-10-26: "Implement general best practices systemwide across the fleet" and "Implement and deploy all. All documented findings shall be programmed into portfolio/program/project roadmap/issues/tasks". Source: research report wf-232b4527-680f-8492-8dc9-5ab6ae365e14 (2026-10-26). Programmed by `migrations/2026-10-26-best-practice-catalogue.sql`: five projects, goal `BP26-CATALOGUE`, one `agent_issues` row per practice (predicate `BP26-<KEY>`), every metric with its trigger, closing probes on the metrics, headline metrics `bp26_issues_open` and `bp26_metrics_unmeasured`, and three identity-bound owner cards.

## Dates that bind (status 2026-10-26)

- EU AI Act Article 50 transparency duties have applied since 2026-08-02; Regulation (EU) 2026/1744 (Digital Omnibus, in force 2026-07-27) did not delay them.
- Article 50(2) machine-readable marking for generative systems on the market before 2026-08-02: due 2026-12-02 (item 1.4).
- Article 50(4) exempts AI-generated public-interest text only under human review or editorial control. The fleet has no manual approval step (owner directive), so every piece is labelled instead (decision_log, 2026-10-26).
- Annex III high-risk duties: deferred to 2027-12-02 and not relevant to current uses. Cloudflare Observability pricing changes on 2026-12-01 (item 2.7).

## Shipped on 2026-10-26

- PR 4394 q08-signal-engine 0.37.0: AI-generated badge on every piece, JSON-LD creditText, nosniff/HSTS/X-Frame-Options.
- PR 4396 personal-companion 1.43.0: AI-generated label on every reading.q08.org piece.
- PR 4397 qnfo-ipatent 3.19.0: Article 50(1) disclosure on the first screen.
- q08 method note: https://q08.org/p/2026-10-26-how-q08-researches-writes-and-scores-its-forecasts-m3th0d

## BP26.EDITORIAL: BP26 editorial and research quality (QNFO.RSCH)

Claim-level provenance, corrections, machine-readable provenance, structured data, forecast scoring, reproducible papers and accessibility across q08.org, reading.q08.org, papers.qnfo.org and qnfo.org (best-practice catalogue section 1).

### 1.1 BP26-CLAIM-LEDGER-1: Claim-level provenance ledger with a dual-verifier gate for every published factual claim

Priority **high**, top-20 rank 6; pillar research; effort M; applies to q08.org, reading.q08.org, papers.qnfo.org, qnfo-social, email agent outbound statements.

Split every published q08, reading.q08.org and papers.qnfo.org artifact and every social post into atomic claims stored in D1 (claim_id, artifact_id, text, source_url, source_quote, source_retrieved_at, archived_copy_r2_key, verifier_model, verdict, verified_at). Nothing is published while a claim lacks a supported verdict from a verifier independent of the author model; two verifiers from different families must agree; an unresolved claim is cut or hedged, never published. Archive each cited source to R2.

State 2026-10-26: q08 research desk (scheduled task 'q08 daily research desk', 2026-10-26) runs a claim-by-claim independent fact-check per piece; the claims are not yet stored per claim in D1. Coordinate with file:migrations/2026-10-26-research-provenance-ledger.sql (another session's live claim) and extend it rather than build a second ledger.

| Metric | Definition | Target |
|---|---|---|
| `claim_coverage` | verified atomic claims / all atomic claims in artifacts published in the last 7 days (claims ledger) | 100% (1.0) |
| `source_liveness` | cited source URLs that resolve or have an archived R2 copy / all cited URLs (rolling 7 days) | >= 0.99 |

Sources: ICD 203 https://www.dni.gov/files/documents/ICD/ICD-203.pdf; IFCN Code of Principles https://ifcncodeofprinciples.poynter.org/; SPJ Code of Ethics https://www.spj.org/ethicscode.asp; Google Search Central generative-AI guidance https://developers.google.com/search/docs/fundamentals/using-gen-ai-content

### 1.2 BP26-CORRECTIONS-FEED-1: Public corrections and retractions feed per property following COPE Retraction Guidelines v3

Priority **high**, top-20 rank 10; pillar research; effort S; applies to q08.org (/retractions exists), reading.q08.org (/retractions exists), papers.qnfo.org, qnfo-social.

One machine-readable /corrections feed (JSON and HTML) per property: original stays visible with a banner; type (correction, update, retraction, retraction-with-replacement), reason, date and two-way links; corrected or retracted forecasts keep their original timestamps for scoring; social corrections are threaded replies to the original post.

State 2026-10-26: q08.org and reading.q08.org already publish /retractions; missing: a JSON feed, the COPE type field, corrections (not only retractions) and papers.qnfo.org.

| Metric | Definition | Target |
|---|---|---|
| `correction_latency_p95_h` | p95 hours from error detection (audit fail, erratum, reader report confirmed) to a published correction or retraction notice, last 30 days | <= 24 |

Sources: COPE Retraction Guidelines v3 (2025-09-04) https://publicationethics.org/guidance/guideline/retraction-guidelines; COPE issuing retractions https://publicationethics.org/guidance/cope-position/issuing-retractions; IFCN corrections principle https://ifcncodeofprinciples.poynter.org/

### 1.4 BP26-PROVENANCE-MARKING-1: Machine-readable AI-provenance marking (C2PA manifests for PDFs and images, signed JSON sidecars for HTML) before 2026-12-02

Priority **critical**, top-20 rank 2; pillar research; effort M; applies to papers.qnfo.org PDFs, social images, q08.org, reading.q08.org, ipatent drafts.

EU AI Act Art. 50(2): output of generative systems already on the market before 2026-08-02 must be marked in a machine-readable, detectable way by 2026-12-02 (Regulation (EU) 2026/1744 transitional rule). Attach C2PA manifests (c2pa.created, digitalSourceType trainedAlgorithmicMedia) to paper PDFs and social images; for HTML publish a signed, time-stamped JSON sidecar linked by <link rel="c2pa-manifest"> plus JSON-LD flags. Keep the X.509 signing key as a Worker secret under the secret lock with automated renewal checks.

State 2026-10-26: q08.org piece JSON-LD carries creditText (PR 4394); no signed manifest or sidecar yet. Deadline 2026-12-02.

| Metric | Definition | Target |
|---|---|---|
| `provenance_marking_coverage` | generated assets published since 2026-08-02 with a valid C2PA manifest or signed sidecar that verifies / all such assets | 1.0 by 2026-12-02 |

Sources: C2PA 2.2 specification https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html; C2PA implementation guidance https://spec.c2pa.org/specifications/specifications/2.2/guidance/Guidance.html; Commission Code of Practice on marking and labelling (2026-06-10) https://digital-strategy.ec.europa.eu/en/news/commission-publishes-code-practice-marking-and-labelling-ai-generated-content; Bird & Bird analysis https://www.twobirds.com/en/insights/2026/taking-the-eu-ai-act-to-practice-the-final-transparency-code-of-practice

### 1.5 BP26-STRUCTURED-DATA-1: Structured data and authorship signals without fakery (schema.org Article/ScholarlyArticle/Dataset, citation_* tags)

Priority **medium**; pillar reach; effort S; applies to q08.org, reading.q08.org, papers.qnfo.org, qnfo.org.

schema.org Article or ScholarlyArticle with author (a real person or the organisation, never an invented persona or an AI), datePublished/dateModified, citation and isBasedOn; Dataset for forecast data; highwire citation_* tags on papers. ClaimReview only for interoperability: Google phased out its SERP feature (documentation update 2025-06-12). Validate structured data in CI.

State 2026-10-26: q08 Article JSON-LD exists (author Organization) and now has creditText; papers.qnfo.org already serves citation_* tags.

| Metric | Definition | Target |
|---|---|---|
| `structured_data_valid` | public page templates whose JSON-LD validates against schema.org types in CI / all public templates | 1.0 |

Sources: Google helpful content https://developers.google.com/search/docs/fundamentals/creating-helpful-content; Google AI-content FAQ https://developers.google.com/search/blog/2023/02/google-search-and-ai-content

### 1.6 BP26-FORECAST-HYGIENE-1: Forecast hygiene: complete resolution criteria, immutable timestamps, updates as new rows, Brier plus log score and a calibration page

Priority **high**, top-20 rank 11; pillar research; effort S; applies to q08.org/forecasts.

Every forecast has Metaculus-style resolution criteria (named source, date, edge cases), a probability and an immutable publication timestamp; updates are new rows (q08_forecast_updates), never overwrites; score with Brier and log score; publish calibration by probability bucket against the always-50% baseline; Gartner-style planning assumptions carry a probability and a date.

State 2026-10-26: 2026-10-26: three researched forecasts with resolution criteria and planning assumptions published; method note q08.org/p/2026-10-26-how-q08-researches-writes-and-scores-its-forecasts-m3th0d; engine scores Brier and keeps the original probability. Missing: log score, a q08_forecast_updates table, calibration plot, a metric for resolution-criteria completeness.

| Metric | Definition | Target |
|---|---|---|
| `forecast_resolution_criteria_complete` | open q08 forecasts whose resolution text names a source, a date and an edge-case rule / all open forecasts (q08-signal D1) | 1.0 |
| `brier_rolling_90d` | mean Brier score of q08 forecasts resolved in the last 90 days (published on /forecasts) | < 0.25 (beats always-50%) |

Sources: Metaculus question-writing guidelines https://www.metaculus.com/question-writing; ICD 203 likelihood terms https://www.dni.gov/files/documents/ICD/ICD-203.pdf; Good Judgment Project evidence (AI Impacts) https://aiimpacts.org/evidence-on-good-forecasting-practices-from-the-good-judgment-project/

### 1.7 BP26-PAPER-PIDS-1: Reproducible living papers: immutable version URLs, content hashes, CITATION.cff/BibTeX/CSL exports, OAI-PMH validation, PID route

Priority **high**, top-20 rank 20; pillar research; effort M; applies to papers.qnfo.org.

Every paper version gets an immutable URL (/papers/{id}/v{n}) and a content hash; CITATION.cff, BibTeX and CSL-JSON exports; ORCID; licence; OAI-PMH 2.0 with oai_dc validated daily; a visible change log. DOI route: Crossref membership (lowest tier USD 200/year, per-record fees) or DataCite via a consortium; the money decision is an identity-bound owner card (human_actions bp26-crossref-membership); until then versioned URLs are the identifier.

State 2026-10-26: papers.qnfo.org already serves OAI-PMH, a JSON feed, citation tags and paper_change_ledger (PAPER-LEDGER-1).

| Metric | Definition | Target |
|---|---|---|
| `oai_pmh_validates` | 1 when an OAI-PMH 2.0 validator run (Identify, ListRecords oai_dc) against papers.qnfo.org passed in the last 24 h, else 0 | 1 |
| `paper_version_immutability` | published paper versions whose stored content hash still matches the served body / all published versions | 1.0 |

Sources: FAIR principles https://www.nature.com/articles/sdata201618; OAI-PMH 2.0 https://www.openarchives.org/OAI/openarchivesprotocol.html; Crossref fees https://www.crossref.org/fees/

### 1.8 BP26-WCAG22-1: Accessibility: WCAG 2.2 AA on every public template, checked by axe-core in CI

Priority **medium**; pillar reach; effort S; applies to all public sites, fleet.qnfo.org, ipatent.

Target WCAG 2.2 Level AA: axe-core or pa11y on every public template in CI, text alternatives for charts and provenance indicators, focus-not-obscured and target-size criteria, a plain-language summary target on reading.q08.org.

| Metric | Definition | Target |
|---|---|---|
| `a11y_violations_serious` | serious or critical axe-core violations summed over all public page templates (CI run) | 0 |

Sources: WCAG 2.2 https://www.w3.org/TR/WCAG22/; C2PA UX guidance https://spec.c2pa.org/specifications/specifications/2.2/ux/UX_Recommendations.html

## BP26.COMPLIANCE: BP26 EU AI Act and privacy compliance (QNFO.OPS)

EU AI Act Article 50 disclosure and labelling, GDPR records, DPIAs, retention and cookie-free analytics for an EU (Dutch) operator (catalogue items 1.3 and 4.1-4.5).

### 1.3 BP26-AI-ACT-ART50-1: EU AI Act Article 50: visible AI labels on all AI-generated public content and AI disclosure at first interaction

Priority **critical**, top-20 rank 1; pillar core; effort S; applies to q08.org, reading.q08.org, papers.qnfo.org, qnfo.org, qnfo-social, ipatent, personal-api twin, email agent.

Article 50 has applied since 2026-08-02 (Regulation (EU) 2026/1744 did not delay it). q08, reading.q08.org, papers and social posts are published without human editorial control, so the 50(4) exemption does not apply: label every AI-generated or AI-assisted artifact visibly (Code of Practice icons 'AI-generated' / 'AI-modified') and in JSON-LD; disclose the AI nature at the start of every interactive AI exchange (ipatent, the twin API, the email agent) per 50(1); publish a methodology page per property.

State 2026-10-26: 2026-10-26 PRs: 4394 q08-signal-engine 0.37.0 (badge + creditText), 4396 personal-companion 1.43.0 (reading.q08.org label), 4397 qnfo-ipatent 3.19.0 (Art. 50(1) first-screen disclosure). q08 method note published. Remaining: papers.qnfo.org, qnfo.org, social posts, the twin API, and the email agent (identity-bound owner card bp26-email-agent-ai-disclosure: it writes in the owner's name).

| Metric | Definition | Target |
|---|---|---|
| `ai_label_coverage` | AI-touched public artifact templates carrying the visible label and the JSON-LD flag / all AI-touched templates (q08 piece, reading piece, paper page, qnfo.org pages, social post text) | 1.0 |
| `ai_interaction_disclosure` | interactive AI surfaces (ipatent, twin API, email agent) whose first reply or first screen carries the AI disclosure / all interactive AI surfaces | 1.0 |

Sources: Code of Practice (2026-06-10) https://digital-strategy.ec.europa.eu/en/news/commission-publishes-code-practice-marking-and-labelling-ai-generated-content; Bird & Bird https://www.twobirds.com/en/insights/2026/taking-the-eu-ai-act-to-practice-the-final-transparency-code-of-practice; Digital Omnibus timing https://www.cobalt.legal/news-cases/digital-omnibus-on-ai/

### 4.1 BP26-GDPR-RECORDS-1: GDPR lawful basis, privacy notices and a versioned Record of Processing Activities

Priority **high**, top-20 rank 14; pillar security; effort S; applies to newsletters/digests, email agent, twin API, ipatent, fleet auth.

Newsletter on consent with double opt-in and stored proof (timestamp, IP hash) and unsubscribe in every mail; email-agent replies on legitimate interest disclosed in a privacy notice linked from its signature together with the Art. 50(1) notice; a Record of Processing Activities (GDPR Art. 30) as a versioned file in the repo listing Cloudflare (DPA) as processor and model providers and social platforms as recipients.

| Metric | Definition | Target |
|---|---|---|
| `ropa_last_reviewed_days` | days since docs/ROPA.md was last changed on main | <= 180 |
| `subscribers_with_consent_proof` | confirmed subscribers with a stored consent timestamp / all confirmed subscribers (q08, companion, papers lists) | 1.0 |

Sources: GDPR https://eur-lex.europa.eu/eli/reg/2016/679/oj; Autoriteit Persoonsgegevens https://www.autoriteitpersoonsgegevens.nl/en

### 4.2 BP26-DPIA-1: DPIAs (GDPR Art. 35) for the server-side email-reading agent, the personal twin and ipatent

Priority **high**, top-20 rank 14; pillar security; effort S; applies to email agent, personal-api twin, ipatent.

Draft a DPIA for the email agent (third parties' communications processed with new technology), the personal twin (profiling) and ipatent (invention disclosures may hold personal data), using the AP mandatory-DPIA list and the EDPB criteria; store them versioned in the repo and review yearly. The AP DPIA-exemption list for SMEs was only consulted (2026-06-24 to 2026-08-10) and is not final.

| Metric | Definition | Target |
|---|---|---|
| `dpia_current` | high-risk processing operations (email agent, twin, ipatent) with a DPIA file changed in the last 365 days / 3 | 1.0 |

Sources: AP DPIA https://www.autoriteitpersoonsgegevens.nl/en/themes/basic-gdpr/gdpr-in-practice/data-protection-impact-assessment-dpia; AP mandatory list https://wetten.overheid.nl/BWBR0042812/2019-11-27; AP exemption consultation https://www.autoriteitpersoonsgegevens.nl/actueel/ap-vraagt-reacties-op-lijst-dpia-uitzonderingen

### 4.3 BP26-RETENTION-1: Data minimisation and retention: TTL sweeps, payload logging off for mail, no raw emails in logs

Priority **high**, top-20 rank 14; pillar security; effort S; applies to email agent, twin, newsletters, Workers Logs, AI Gateway logs.

Email agent stores message bodies at most 30 days (metadata and summaries longer only if needed), redacts third-party personal data before prompts where feasible, disables AI Gateway payload logging on mail calls (cf-aig-collect-log-payload: false); D1 TTL sweeps on cron and R2 lifecycle rules; the twin holds no special-category data; logs hash email addresses.

| Metric | Definition | Target |
|---|---|---|
| `records_past_retention` | personal-data rows older than their table's retention policy (retention_policy registry, to build) | 0 |
| `pii_in_logs` | raw email addresses found by a regex scan of a daily sample of Workers Logs | 0 |

Sources: GDPR Art. 5(1)(c),(e) https://eur-lex.europa.eu/eli/reg/2016/679/oj; AI Gateway logging https://developers.cloudflare.com/ai-gateway/reference/pricing/

### 4.4 BP26-NO-TRACKING-1: Cookies and tracking: strictly necessary cookies only, cookieless aggregate analytics, no banner needed

Priority **high**, top-20 rank 18; pillar security; effort S; applies to all web properties.

Only strictly necessary cookies (the OTP session on fleet.qnfo.org); analytics server-side, aggregate and cookieless (Cloudflare Web Analytics or Analytics Engine); no third-party trackers, never a cookie wall. Note: qnfo-ipatent sets an A/B cookie ipatent_ab (arm number only, 30 days) that is not strictly necessary and must become cookieless (a hash bucket) or consented.

| Metric | Definition | Target |
|---|---|---|
| `non_essential_cookies_set` | distinct non-essential cookies set by public hosts in a crawler check (fleet.qnfo.org OTP session excluded) | 0 |
| `third_party_trackers` | third-party tracking scripts or pixels found on public pages by the crawler check | 0 |

Sources: AP cookies guidance https://www.autoriteitpersoonsgegevens.nl/en/themes/internet-and-smart-devices/cookies/cookies-and-your-organisation-make-sure-you-have-a-good-cookie-policy-in-place

### 4.5 BP26-AI-ACT-ARTICLE4-1: EU AI Act Article 4 AI literacy evidence and provider/deployer classification record

Priority **medium**; pillar core; effort S; applies to fleet-wide.

Article 4 (as amended 2026-07-27: 'take measures to support' AI literacy) applies; keep a documented AI-use policy and agent handbook in the repo as evidence. Record QNFO as a provider for self-built generative tools offered to third parties (ipatent, the twin) for Art. 50(2) purposes, and a deployer elsewhere; Annex III high-risk duties are not relevant to current uses (deferred to 2027-12-02); GPAI duties fall on model providers.

Sources: Digital Omnibus https://www.cobalt.legal/news-cases/digital-omnibus-on-ai/; Article 4 change https://lawandtechnology.eu/en/ai-literacy-digital-omnibus-article-4-ai-act/

## BP26.REACH: BP26 social and email sending standards (QNFO.REACH)

Platform automation rules and bot disclosure for automated social posting; SPF/DKIM/DMARC alignment, RFC 8058 one-click unsubscribe and bulk-sender rules (catalogue items 1.9 and 2.10).

### 1.9 BP26-SOCIAL-AUTOMATION-1: Automated social posting within platform rules: bot labels, official APIs only, no unsolicited mentions, rate caps

Priority **high**, top-20 rank 9; pillar reach; effort S; applies to qnfo-social (Bluesky, Mastodon, X, LinkedIn via Buffer).

X: Automated label on and a managing human account linked, official API only, no unsolicited @mentions or auto-replies, no automated follows or likes. Bluesky: bot self-label. Mastodon: 'This is an automated account'. LinkedIn: official API and Buffer only. Everywhere: rate caps, no bulk identical cross-posts, link the source page. Until the owner sets the account labels (identity-bound card bp26-social-bot-labels), every automated post carries a short automation marker in its text.

State 2026-10-26: qnfo-social/worker.js is under another session's live claim (2026-10-26); the in-text marker is that file's next change after the claim is released.

| Metric | Definition | Target |
|---|---|---|
| `social_bot_label_enabled` | automated social accounts with the platform bot or automated label on / all automated accounts | 1.0 |
| `social_unsolicited_mentions` | automated @mentions or replies in the last 7 days that no user interaction initiated | 0 |

Sources: X Developer Guidelines https://docs.x.com/developer-guidelines; X automated-account labels https://help.x.com/en/using-x/automated-account-labels; X authenticity policy https://help.x.com/en/rules-and-policies/authenticity; Bluesky moderation (bot self-label) https://docs.bsky.app/docs/advanced-guides/moderation; Bluesky developer guidelines https://docs.bsky.app/docs/support/developer-guidelines

### 2.10 BP26-EMAIL-AUTH-1: Email sending: SPF, DKIM and aligned DMARC on every sending domain, RFC 8058 one-click unsubscribe, Postmaster monitoring

Priority **high**, top-20 rank 12; pillar reach; effort S; applies to email agent, q08/companion/papers digests, fleet OTP mail, qnfo.org.

Publish SPF, DKIM (Cloudflare Email Service signs DKIM/ARC) and DMARC with alignment on every sending domain; start p=none with rua reports parsed by a worker, move to quarantine/reject once aligned pass >= 99%; RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers plus a footer link on every digest; honour opt-outs within 48 h; spam rate under 0.1% (0.3% ceiling); register Google Postmaster Tools.

State 2026-10-26: DNS writes go through the repository token (cf-ops-actions); DMARC tightening must wait for measured alignment.

| Metric | Definition | Target |
|---|---|---|
| `dmarc_aligned_pass_rate` | DMARC-aligned pass share across sending domains from rua aggregate reports, last 7 days | >= 0.99 |
| `rfc8058_headers_present` | list mail sent in the last 7 days with List-Unsubscribe and List-Unsubscribe-Post / all list mail | 1.0 |
| `unsubscribe_honoured_48h` | opt-outs in the last 30 days processed within 48 hours / all opt-outs | 1.0 |

Sources: RFC 8058 https://www.rfc-editor.org/rfc/rfc8058; Google sender guidelines https://support.google.com/a/answer/81126; Yahoo sender best practices https://senders.yahooinc.com/best-practices/; Cloudflare Email Service changelog https://developers.cloudflare.com/email-service/platform/changelog/

## BP26.ENGINEERING: BP26 Cloudflare Workers engineering baseline (QNFO.INFRA)

Cloudflare Workers best practices as a CI baseline, D1 discipline, R2/KV usage, AI Gateway cost control, gradual deploys with automatic rollback, Workflows/Queues/Durable Objects, observability, secrets and the edge security baseline (catalogue section 2).

### 2.1 BP26-WORKERS-BP-LINT-1: Cloudflare Workers Best Practices as the fleet CI lint baseline

Priority **high**, top-20 rank 15; pillar core; effort S-M; applies to all Workers.

Current compatibility_date (<= 90 days old), nodejs_compat, upload_source_maps, Env types from wrangler types, secrets only via wrangler secret, streamed bodies, ctx.waitUntil without destructuring, bindings over REST, Queues/Workflows for background work, no request-scoped global state, no floating promises, Web Crypto for tokens, @cloudflare/vitest-plugin tests. Cloudflare ships these rules as an agent skill (npx skills add cloudflare/skills). Extend the existing scripts/fleet_best_practices_audit.py and workers_standards_guard.py rather than a new tool.

State 2026-10-26: Existing: WORKERS-BP-AUDIT-D1-1 (scripts/fleet_best_practices_audit.py), workers_standards_guard.py, metric workers_compat_date_behind.

| Metric | Definition | Target |
|---|---|---|
| `compat_date_age_days_max` | oldest live compatibility_date across deployed Workers, in days (worker_compat_state) | <= 90 |
| `workers_with_source_maps` | deployed Workers with upload_source_maps = true in wrangler.toml / all deployed Workers | 1.0 |

Sources: Workers Best Practices (updated 2026-10-12) https://developers.cloudflare.com/workers/best-practices/workers-best-practices/; changelog https://developers.cloudflare.com/changelog/post/2026-02-15-workers-best-practices/

### 2.2 BP26-D1-DISCIPLINE-1: D1 discipline: indexed hot queries, batched transactional writes, Sessions API reads, Time Travel bookmark before every migration, quarterly restore drill

Priority **high**, top-20 rank 16; pillar core; effort S-M; applies to qnfo-audit, q08-signal, living-paper and every D1-backed Worker.

Versioned migrations only; EXPLAIN QUERY PLAN on hot queries and queryEfficiency monitoring; db.batch() for multi-statement writes; chunk large UPDATE/DELETE (about 1,000 rows); Sessions API with bookmarks for read-heavy public pages; a Time Travel bookmark recorded before every migration; a restore drill every 90 days. Limits: 10 GB per database, 100 bound parameters, 100 KB per statement, 30 s per query or batch, single-threaded per database (qnfo-audit is about 0.9 GB and has hit SQLITE_NOMEM in fleet_tick).

| Metric | Definition | Target |
|---|---|---|
| `d1_db_size_pct` | largest D1 database size / 10 GB (account D1 list) | <= 0.7 |
| `d1_restore_drill_age_days` | days since the last successful Time Travel restore drill into a scratch database | <= 90 |
| `pre_migration_bookmark_recorded` | applied migrations in the last 30 days with a Time Travel bookmark recorded in migration_runs / all applied | 1.0 |

Sources: D1 limits https://developers.cloudflare.com/d1/platform/limits/; read replication https://developers.cloudflare.com/d1/best-practices/read-replication/; indexes https://developers.cloudflare.com/d1/best-practices/use-indexes/; Time Travel https://developers.cloudflare.com/d1/reference/time-travel/

### 2.3 BP26-R2-KV-USAGE-1: R2 as source of truth for artifacts, KV only for eventually-consistent config and cache, never locks or counters

Priority **medium**; pillar core; effort S; applies to fleet-wide.

R2 holds archived sources, paper versions and provenance sidecars under content-addressed keys with lifecycle rules; KV holds read-heavy config and cache only; locks and counters use Durable Objects (KV's eventual consistency causes duplicate work among concurrent agents).

| Metric | Definition | Target |
|---|---|---|
| `kv_used_for_locking` | static-scan hits of KV get-then-put lock or counter patterns across worker.js files | 0 |

Sources: Workers Best Practices https://developers.cloudflare.com/workers/best-practices/workers-best-practices/; R2 https://developers.cloudflare.com/r2/; KV https://developers.cloudflare.com/kv/

### 2.4 BP26-AI-GATEWAY-BUDGETS-1: Every model call through AI Gateway with caching, rate limits, spend limits and per-loop hard budgets

Priority **high**, top-20 rank 4; pillar cost; effort S; applies to all AI-using Workers, research desk, improvement loops.

Route Workers AI and external model calls through AI Gateway with metadata (worker, loop_id, session_id); cache deterministic prompts (cf-aig-cache-ttl); rate limits; spend limits (beta, up to 20 rules per gateway) as a backstop because they are eventually consistent; plus a per-loop token budget in code. Per BUDGET-SOFT-ROUTE-1 a breached budget steers to a cheaper model, never stops work.

State 2026-10-26: Existing: gateway_cap_30d_usd, billed_ai_gateway_mtd_usd, unmanaged_direct_spend_share (0.40 on 2026-10-26) and fleet_budget soft routing.

| Metric | Definition | Target |
|---|---|---|
| `gateway_coverage` | model calls routed through AI Gateway / all model calls (ai_call_counters by route) | 1.0 |
| `ai_cache_hit_rate` | AI Gateway cache hits / requests on deterministic-prompt routes, last 7 days | >= 0.3 |

Sources: AI Gateway spend limits https://developers.cloudflare.com/ai-gateway/features/spend-limits/; caching https://developers.cloudflare.com/ai-gateway/features/caching; rate limiting https://developers.cloudflare.com/ai-gateway/features/rate-limiting/; Workers AI pricing https://developers.cloudflare.com/workers-ai/platform/pricing/

### 2.5 BP26-GRADUAL-DEPLOYS-1: Versions, health-gated gradual deployments and automatic rollback on error-rate regression

Priority **high**, top-20 rank 7; pillar autonomy; effort M; applies to all Workers, canonical-deploy.yml, qnfo-ops /ops/deploy, qnfo-deploy-guard.

The canonical deploy path runs wrangler versions upload, smoke-tests the version preview URL, then versions deploy at 10%, 50% and 100% with soak windows, compares error rate and p95 latency by version and calls wrangler rollback automatically on regression; migrations stay expand-then-contract; writes are idempotent because a code rollback does not undo data.

State 2026-10-26: Existing: control-plane canary on /health VERSION with canary_revert.py (CONTROL-PLANE-CANARY-2). It proves the version arrived, not that the worker works.

| Metric | Definition | Target |
|---|---|---|
| `deploys_via_gradual` | production deploys in the last 30 days that used versions upload plus a staged percentage rollout / all production deploys | 1.0 |
| `change_failure_rate` | production deploys in the last 30 days followed by a rollback or an incident within 24 h / all production deploys | <= 0.15 |
| `mttr_rollback_min_p95` | p95 minutes from regression detection to completed rollback, last 30 days | <= 10 |

Sources: Gradual deployments https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/; rollbacks https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/; wrangler commands https://developers.cloudflare.com/workers/wrangler/commands/workers/

### 2.6 BP26-DURABLE-JOBS-1: Long jobs as Workflows, fan-out via Queues with idempotent consumers, strict limits and leases in Durable Objects

Priority **medium**, top-20 rank 8; pillar core; effort M; applies to research pipelines, qnfo-social, email agent, improvement loops.

Multi-step runs (fetch, extract claims, verify, publish, post) become Workflows with per-step retries and persisted state; fan-out through Queues with an idempotency key (UNIQUE in D1) per side effect because delivery is at least once; strict global rate limits and work-claim locks in Durable Objects (the Rate Limiting binding is per location and approximate).

| Metric | Definition | Target |
|---|---|---|
| `duplicate_side_effects` | duplicate posts or emails detected by idempotency-key collisions or identical-text sends within 24 h, last 7 days | 0 |
| `dlq_depth` | messages in dead-letter queues across the fleet held more than 120 minutes | 0 |

Sources: Workers Best Practices https://developers.cloudflare.com/workers/best-practices/workers-best-practices/; Rate Limiting binding https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

### 2.7 BP26-OBSERVABILITY-1: Workers Logs and Traces on every Worker with structured logs; re-baseline log volume before the 2026-12-01 pricing change

Priority **medium**; pillar core; effort S; applies to all Workers, fleet.qnfo.org.

Workers Logs and Traces enabled per Worker with a set sampling rate; structured JSON logs with trace_id, agent_session_id and version_id; business metrics to Analytics Engine. Observability pricing moves to GB-based on 2026-12-01 (50 GB ingestion, 10 GB-month storage included on Paid): measure monthly ingest before then.

State 2026-10-26: Existing: observability_drift_unrepaired metric (0).

| Metric | Definition | Target |
|---|---|---|
| `observability_enabled_share` | deployed Workers with observability.enabled = true / all deployed Workers | 1.0 |
| `log_ingest_gb_month` | Workers Logs ingest in the current month, GB | <= 50 (included allowance from 2026-12-01) |

Sources: Workers Logs https://developers.cloudflare.com/workers/observability/logs/workers-logs/; Traces https://developers.cloudflare.com/workers/observability/traces/; Observability pricing https://developers.cloudflare.com/observability/pricing/

### 2.8 BP26-SECRETS-MIN-1: Secrets with no owner burden: binding-based credentials first, expiry checks, secret scanning in CI

Priority **medium**; pillar security; effort S; applies to fleet-wide.

Prefer bindings with no secret (Email Sending binding, service bindings, AI Gateway binding); keep the few external tokens (X, Bluesky app password, Mastodon, Buffer) as wrangler secrets under the secret lock; a nightly job checks validity and expiry and files an agent_issue 14 days before expiry; CI secret scanning.

| Metric | Definition | Target |
|---|---|---|
| `secrets_in_repo` | secrets detected by the CI secret scanner on main | 0 |
| `secret_expiry_warnings_open` | external credentials expiring within 14 days with no open renewal issue | 0 |

Sources: Workers Best Practices https://developers.cloudflare.com/workers/best-practices/workers-best-practices/; Cloudflare Email Service https://blog.cloudflare.com/email-for-agents/

### 2.9 BP26-EDGE-SECURITY-1: Edge security baseline: secure headers on every public host, Turnstile on public forms, Durable Object rate limit on OTP

Priority **high**, top-20 rank 19; pillar security; effort S; applies to all public properties, fleet.qnfo.org, ipatent.

HSTS, a strict CSP (nonce-based on dashboards), X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, frame-ancestors 'none' on dashboards, Permissions-Policy; Turnstile on public forms (ipatent, newsletter signup, contact); cache public pages and purge on publish; a Durable Object rate limit on the fleet.qnfo.org OTP endpoints.

State 2026-10-26: q08.org adds nosniff, HSTS and X-Frame-Options (PR 4394).

| Metric | Definition | Target |
|---|---|---|
| `security_headers_pass` | public hosts whose HTML response carries HSTS, nosniff, a referrer policy and frame protection / all public hosts (runner-https probe) | 1.0 |
| `turnstile_on_public_forms` | public forms protected by Turnstile / all public forms | 1.0 |

Sources: OWASP Secure Headers https://owasp.org/www-project-secure-headers/; Turnstile https://developers.cloudflare.com/turnstile/

## BP26.AGENTOPS: BP26 autonomous agent operations (QNFO.OPS)

SLOs and error budgets, change management for agent-authored code, prompt-injection defences, evaluations, concurrency control and append-only audit logging (catalogue section 3).

### 3.1 BP26-SLO-ERROR-BUDGETS-1: SLOs and error budgets per user-facing surface with automatic blameless postmortems

Priority **high**, top-20 rank 17; pillar autonomy; effort S-M; applies to all public surfaces, fleet.qnfo.org.

One to three SLIs per surface (availability, p95 latency, freshness such as 'q08 research desk published by 09:00 CET'), a 28-day SLO and error budget; when a budget is spent the merge lane takes reliability changes only; every SLO breach or incorrect publication gets an automatic postmortem (timeline, root cause, actions as agent_issues) in qnfo-audit.

| Metric | Definition | Target |
|---|---|---|
| `slo_attainment_28d_min` | lowest 28-day availability SLO attainment across public surfaces | >= 0.995 |
| `postmortem_coverage` | incidents in the last 30 days with a completed postmortem within 72 hours / all incidents | 1.0 |

Sources: Google SRE book https://sre.google/sre-book/table-of-contents/; SRE workbook, implementing SLOs https://sre.google/workbook/implementing-slos/

### 3.2 BP26-AGENT-CHANGE-GATES-1: Change management for agent-authored code: required gates, dependency allow-list, diff caps and independent review of high-risk paths

Priority **medium**; pillar autonomy; effort M; applies to QNFO/qnfo-workers merge lane.

Required merge-lane gates: typecheck, unit suites, wrangler types freshness, D1 migration dry-run, secret scan, dependency allow-list (OWASP ASI04 supply chain), a diff-size cap; then the gradual deploy of item 2.5; a second independent agent reviews auth, email sending and publishing paths.

State 2026-10-26: Existing: deploy-gate, mirror-guard, version-bump-guard, workflow-lint, run-suites.

| Metric | Definition | Target |
|---|---|---|
| `ci_gate_bypass_count` | merges to main in the last 30 days with a required check not green | 0 |
| `agent_pr_revert_rate` | agent-authored PRs merged in the last 30 days later reverted / all agent-authored PRs merged | <= 0.1 |

Sources: OWASP Top 10 for Agentic Applications 2026 https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/; Workers Best Practices https://developers.cloudflare.com/workers/best-practices/workers-best-practices/

### 3.3 BP26-PROMPT-INJECTION-1: Prompt-injection and goal-hijack defences for agents that read email, web pages and social replies

Priority **critical**, top-20 rank 5; pillar security; effort M; applies to email agent (qnfo-email, qnfo-email-orchestrator), research pipelines, qnfo-social reply reading, personal-api twin.

All inbound mail, fetched pages and social replies are data, never instructions: a tool-less reader model produces structured extraction and a separate actor receives only those fields (dual-LLM / quarantine pattern); the email agent may reply only to the original sender, never forward to arbitrary addresses or attach fleet data; egress allow-list for agent fetches; block markdown and image exfiltration in outbound content; write to memory only after validation; log goal and tool sequences and alert on anomalies; a red-team suite runs on every prompt or model change.

State 2026-10-26: A real, current threat (anyone can mail the agent instructions), not deferred hardening: it is in scope under the functionality-first directive because the threat is concrete.

| Metric | Definition | Target |
|---|---|---|
| `injection_eval_pass_rate` | pass share of the red-team prompt-injection suite on the email agent and twin, latest run | >= 0.95 |
| `outbound_mail_to_non_sender` | agent-sent emails in the last 7 days addressed to anyone other than the original sender or an allow-listed address | 0 |
| `agent_tool_calls_outside_allowlist` | agent tool or egress calls outside the allow-list, last 7 days | 0 |

Sources: OWASP Top 10 for LLM Applications 2025 https://genai.owasp.org/llm-top-10/; OWASP Agentic Top 10 2026 https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/; OWASP Q3 2026 exploit roundup https://genai.owasp.org/2026/10/08/genai-and-agentic-ai-exploit-roundup-q3-2026/

### 3.4 BP26-EVALS-1: Golden-set evaluations with seeded false claims as canaries; evals gate prompt, model and compatibility changes

Priority **medium**, top-20 rank 6; pillar research; effort M; applies to research desk, verifiers, email agent, ipatent.

Golden sets per task (claim-extraction recall, verifier precision against seeded false claims, forecast-question resolvability, email-reply correctness and tone); run in CI on any prompt, model or compatibility change and weekly for drift; seed known-false claims into every verifier batch and block publishing on any miss.

State 2026-10-26: Existing golden-run evaluation in qnfo-research-exec (OUTPUT-QUALITY-LEDGER-1 found its two rates are complements).

| Metric | Definition | Target |
|---|---|---|
| `seeded_false_claim_catch_rate` | seeded known-false claims blocked by the verifiers / all seeded, last 7 days | 1.0 |
| `eval_suite_age_days` | days since the golden sets were last refreshed | <= 30 |

Sources: NIST AI RMF and Generative AI Profile NIST AI 600-1 https://www.nist.gov/itl/ai-risk-management-framework

### 3.5 BP26-LEASES-KILLSWITCH-1: Concurrency control: Durable Object leases with fencing tokens, per-iteration budgets, circuit breakers and a tested kill switch

Priority **high**, top-20 rank 8; pillar autonomy; effort S-M; applies to improvement loops, merge lane, code loop, research desk, deploy guard.

One Durable Object per work item as lease authority (claim with TTL, heartbeat, fencing token checked on every write); caps per loop iteration on steps, tokens, wall-clock and EUR; a circuit breaker (N consecutive failures pauses the loop and files an agent_issue); a global kill-switch flag every loop reads, tested monthly; idempotency keys on every external side effect.

State 2026-10-26: Existing: qnfo-deploy-guard work-lock and secret-lock (D1 ledger work_claims), loop breaker. Missing: fencing tokens, per-iteration caps, a tested kill switch.

| Metric | Definition | Target |
|---|---|---|
| `orphaned_leases` | work_claims rows past expires_at and not released | 0 |
| `kill_switch_test_age_days` | days since the global kill switch was last exercised and every loop was seen to stop and resume | <= 30 |

Sources: OWASP ASI08 cascading failures and ASI10 rogue agents https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/; Durable Objects https://developers.cloudflare.com/durable-objects/

### 3.6 BP26-AUDIT-LOG-1: Append-only, hash-chained agent action log covering every publish, send, deploy, rollback and secret change

Priority **high**, top-20 rank 13; pillar security; effort S; applies to fleet-wide.

An append-only agent_actions table in qnfo-audit (actor, session, tool, inputs hash, outputs hash, target, version_id, cost, timestamp) with no UPDATE or DELETE in code paths; a daily hash chain with the root written to R2; weekly FinOps digest per worker and loop; shard by month to respect the single-writer D1 limit.

State 2026-10-26: Existing partial ledgers: decision_log, issue_lifecycle, code_tasks, deploy ledger, work_claims.

| Metric | Definition | Target |
|---|---|---|
| `audit_coverage` | side-effecting actions (publishes, sends, deploys, rollbacks, secret writes) in the last 7 days with an agent_actions row / all such actions | 1.0 |
| `audit_chain_verify` | 1 when the latest daily hash-chain verification of agent_actions passed, else 0 | 1 |

Sources: NIST AI 600-1 https://www.nist.gov/itl/ai-risk-management-framework; OWASP Agentic Top 10 https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/

## Owner-only steps (IDENTITY-BOUND cards)

- `bp26-email-agent-ai-disclosure`: whether agent-written replies in the owner's name carry an AI notice (Art. 50(1)). Default: no change until decided.
- `bp26-social-bot-labels`: automated-account labels on the owner's X, Bluesky and Mastodon accounts. Default: an in-text automation marker on each post.
- `bp26-crossref-membership`: Crossref membership (money) for paper DOIs. Default: versioned URLs, hashes, CITATION.cff and OAI-PMH as identifiers.
