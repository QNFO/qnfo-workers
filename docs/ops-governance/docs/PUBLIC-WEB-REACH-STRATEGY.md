# QNFO/QWAV Public Web Reach Strategy — Browser Automation & the API-less Long Tail

> Version 1.0 (2026-09-08) - Owner: QNFO - Status: ACTIVE (spec + worker v0.1.0; date-gated activation)
>
> Claim: the outreach/comms stack (email + social + public API, programs P-A..P-F) leaves a residual
> reach surface untouched — the long tail of public web forms, directories, webmention endpoints, and
> profile/registration flows that expose NO API and NO email path, and are therefore reachable only
> via automated browsing. This document defines that surface, tiers it honestly (TOS/COI/no-spam),
> and specifies the execution layer: a Cloudflare Browser Rendering (Puppeteer) worker plus a
> standards-based webmention broadcaster, both date-gated and kill-switched like the email pipeline.
>
> Evidence: account entitlements read 2026-09-08 — Workers Paid plan active with
> browser_rendering_total_browser_hours + browser_rendering_avg_concurrent_browsers usage components
> (browser binding available). Gap scan: grep across qnfo-ops/docs + qnfo-workers for
> "puppeteer|browser.rendering|webmention|forum" returned ZERO hits — no browser-automation surface
> exists. Prior forum survey (RELATED-SITES-SURVEY.md, LESSWRONG-INTEGRATION.md) establishes that
> written-content forums (LessWrong/Alignment Forum/EA Forum/HN) gate WRITES behind human accounts,
> while API-native prediction surfaces (Metaculus/Manifold) permit token-authenticated writes.
> Confidence: high on mechanism + availability; medium on per-platform TOS (flagged per row).
>
> Companion of: docs/OUTREACH-AUTOMATION-STRATEGY.md (email/API execution), OUTREACH-EXHAUSTIVE-
> INVENTORY.md (superset), OUTREACH-AMPLIFICATION-CATALOG.md (audience/mode expansion), RELATED-SITES-
> SURVEY.md + LESSWRONG-INTEGRATION.md (forum/prediction surfaces), ENGAGEMENT-STRATEGY.md (measurement).
> This doc AMENDS the parent strategy with programs P-G (webmention) and P-H (browser form/submission).
> No new skills (NO-MORE-SKILLS-1); no local crons (CLOUD-FRONTEND-ONLY-1).

---

## 1. Why browser automation, and what it is NOT

The existing stack reaches humans through three channels only:

1. **Email** (qnfo-outreach, qnfo-email): every kind of outbound/inbound message (inventory A01-A24, B01-...).
2. **Public APIs** (Zenodo, OSF, GitHub, Software Heritage, prediction platforms): structured submissions.
3. **Social** (qnfo-social + Buffer): Bluesky/Mastodon/LinkedIn/X amplification.

The residual surface — the "wide net" this document casts — is everything that has NEITHER an API
NOR a working email address but DOES expose a web form, a webmention endpoint, a directory listing,
or an account-registration flow. Those are reachable only by loading a page in a real browser and
interacting with it. That is what Cloudflare Browser Rendering (Puppeteer on Workers) provides.

**What it is NOT:**

- It is NOT forum spam. Prior survey (RELATED-SITES-SURVEY.md) shows written-content forums gate
  writes behind human accounts and community norms; automated posting there is RED (excluded) —
  the exact anti-pattern NO-SPAM / honest-only doctrine forbids. The browser surface targets
  open-submission venues that WANT inbound contributions, not communities that don't.
- It is NOT a CAPTCHA-defeating or ToS-circumvention tool. Any target whose ToS prohibits
  automation is AMBER (TOS check) or RED (excluded). Evidence of a TOS check is required before
  enabling any AMBER target.
- It is NOT fabricated engagement. Every browser action records verifiable evidence (final URL,
  page title, submit confirmation, response snippet) — never a fake "success".

The honest framing: browser automation converts the API-less long tail into the same tiered,
gated, date-gated, kill-switched pipeline as email, with the same measurement (funnel_daily +
submissions → P7 scorecard).

## 2. Channel inventory (the wide net, browser-automatable)

Tier legend (same as the parent docs): GREEN = automatable now, no TOS barrier. AMBER = account/TOS
check first (record evidence before enable). RED = excluded (COI / self-promotion rules / paywall /
anti-automation ToS).

### 2.1 GREEN — standards-based & open-submission (enable now, fire post-activation)

| id | Surface | Mechanism | Notes |
|---|---|---|---|
| W01 | Webmention broadcast | HTTP POST (rel=webmention discovery + form-encoded send) | IndieWeb standard; notify every page a new paper LINKS TO. Honest, reciprocal, zero ToS risk. No browser needed. |
| W02 | Open-science directory listings | form fill | Directories that explicitly accept open-work submissions (e.g., benchmark lists, research-resource wikis with an "add your project" form). |
| W03 | Community newsletter web-signup | form fill | Opt-in newsletters with a public web form and no API; one submission per issue/venue. |
| W04 | Guest-post / contribution forms | form fill | Open-submission blogs/magazines with a public "contribute/submit" form. |
| W05 | Conference CFP web forms | form fill | Indico/pretalx/EasyChair web forms where the API is absent/broken (email EOI is the fallback per parent P-D). |
| W06 | Contact forms (replacing email) | form fill | Sites that expose ONLY a web contact form (no address); one message per contact, no follow-up. |
| W07 | Webmention-receiving aggregators | HTTP POST | Aggregators/newsletters that accept webmention/ping notifications of new records. |

### 2.2 AMBER — account/TOS check first (record evidence in web_targets.tos_evidence)

| id | Surface | Barrier | Enable rule |
|---|---|---|---|
| W10 | Forum/profile registration (Discourse, phpBB, etc.) | ToS often prohibit automated account creation; email-verification loop | Enable only after (a) ToS permits automation, (b) email-verify handled by qnfo-email inbound, (c) documented evidence. |
| W11 | Prediction-market question posts (Metaculus/Manifold) | Already API-native (token auth) — see RELATED-SITES-SURVEY; browser only as API fallback | Prefer API; browser only if API missing. |
| W12 | Directory/listing that requires login | account + login cookie management | Credentials stored as secret refs (web_profiles), never plaintext. |
| W13 | Form with light anti-bot (honeypot, rate-limit) | honeypot fields, per-IP caps | Fill honeypot correctly; respect caps; never CAPTCHA-solving. |

### 2.3 RED — excluded (documented rationale)

| id | Surface | Rationale |
|---|---|---|
| W20 | Wikipedia / Wikimedia | COI policy forbids self-editing (unchanged from parent). |
| W21 | Reddit / Stack Exchange automated posting | self-promotion rules (unchanged). |
| W22 | LessWrong / Alignment Forum / EA Forum / HN writes | human-account + community-norm gated (RELATED-SITES-SURVEY). Read-radar only (qnfo-venue-radar). |
| W23 | Any platform whose ToS prohibits automation | never circumvent; the honest path is email EOI or abstain. |
| W24 | CAPTCHA-gated flows | defeating CAPTCHA is out of scope (and often ToS-violating). |
| W25 | Paid / gatekeeping venues | NO-JOURNALS-1 / no-APCs unchanged. |

## 3. Programs (amend the parent P-A..P-F)

### P-G. Webmention broadcast (GREEN; HTTP; no browser)

- Trigger: on publish/new-version (wired to qnfo-research-exec v0.2) and a daily scan of living-paper
  for records published in the last 7 days.
- Action: extract outbound URLs from body_md (and any citation targets with resolvable web pages),
  discover each target's webmention endpoint (HTTP Link header + HTML `<link rel="webmention">`),
  POST `{source, target}` form-encoded. Record per-target status in web_runs.
- One webmention per source→target pair ever (no-repeat, dedup by h32(source|target)).
- This is the highest-value, lowest-risk surface: it notifies pages QNFO cites that the work exists,
  which is exactly what webmention is for, and it is universally accepted.

### P-H. Browser form / submission program (GREEN targets; Puppeteer)

- Trigger: weekly cron (0 12 * * 1 UTC) + on-demand /run (auth-gated).
- Action: for each enabled web_target with status='due', load the Puppeteer task spec (url, fields,
  submit, verify), launch a browser session, fill + submit, wait for the verify selector/text,
  record evidence (final URL, title, confirmation snippet, duration), close the session.
- Caps: max 5 browser sessions/day (cost guard — browser rendering is usage-billed), max 1 run per
  target per 7 days (no-repeat), global slow-lane (weekly), per-target tier gate.
- Evidence is text-first (saved to web_runs.evidence); full screenshot archiving to R2 is a v0.2
  enhancement (avoids new bucket sprawl now).

## 4. Automation architecture

### 4.1 Worker: qnfo-web-reach (v0.1.0)

Canonical repo dir: QNFO/qnfo-workers/qnfo-web-reach (worker.js + wrangler.toml + schema.sql +
package.json + README + metadata.json). Self-doc header + VERSION via /health (FLEET-SELF-DOC-1).

- bindings: BROWSER (browser binding, Browser Rendering), OUTREACH_D1 (d1 qnfo-outreach — REUSES the
  parent pipeline's submissions + funnel_daily + pipeline_state kill switch, additive web_* tables),
  LIVING_PAPER (d1 living-paper — paper URLs/DOIs for webmention + form content). WEB_REACH_TOKEN
  (secret) gates /run?commit=1 and /api/*.
- cron: 0 12 * * 1 UTC (weekly slow-lane; webmentions also fire on-demand + daily scan v0.2).
- endpoints: /health, /api/targets, /api/runs, /run (preview, no execution), /run?commit=1 (gated),
  POST /api/webmention (gated), POST /api/targets (gated).
- ACTIVATION_AT 2026-09-15T00:00:00Z — same date gate as the email pipeline. Before it, /run
  previews only; the only external action permitted is a webmention to own domains (self-test).

### 4.2 Data plane (additive to qnfo-outreach D1; never dropped)

- web_targets (id, slug UNIQUE, kind, url, tier, tos_evidence, spec_json, status, enabled,
  last_run_at, last_status, created_at)
- web_runs (id, target_id, kind, url, action, status, evidence, duration_ms, created_at)
- web_profiles (id, target_id, platform, username_ref, secret_ref, status, created_at) — credential
  REFS only; secrets live in the worker secret store (OSF-CREDENTIAL-REDUNDANCY-1 pattern).

### 4.3 Reuse map (no duplication)

| Existing | Role here |
|---|---|
| pipeline_state.external_sends_enabled (qnfo-outreach D1) | SINGLE kill switch for ALL external reach incl. browser |
| submissions + funnel_daily (qnfo-outreach D1) | measurement: browser actions land as kind=web_form|webmention|web_registration |
| qnfo-cloud-ops jobVisibility (P7 scorecard) | already reads submissions; browser kinds surface automatically |
| qnfo-email | inbound email-verification for AMBER registrations (W10) |
| qnfo-venue-radar / qnfo-outreach miner | target discovery: surfaces with forms but no API |
| LIVING_PAPER D1 | source URLs + DOIs for webmention + form content |

### 4.4 Secrets & cost guard

- WEB_REACH_TOKEN: worker secret + ~/.env mirror (OSF-CREDENTIAL-REDUNDANCY-1 pattern).
- Browser Rendering cost: usage-billed (browser-hours + concurrent sessions). Guards: max 5
  sessions/day, 60s hard timeout per task, weekly cron, one browser launch per /run (batched targets
  in a single session where same-origin). Spend falls under the standing $90/30d budget
  (COST-AUDIT-MISS-AI-1); the neuron/cost audit already covers workers-ai, not browser — browser-hours
  are monitored via the account usage API in the weekly scorecard (v0.2 instrumentation).

## 5. Messaging & content discipline (browser form fills)

Every form text obeys the standing gates: PERSONA-STRIP-1, ANTI-TELEGRAPH-1, PUBLICATION-BRAND-
LANGUAGE-1, SO-WHAT-GATE-1, NO-JOURNALS-1. Form fields carry the SAME prose as the email templates
(section 6 of the parent strategy) — one ask, no internal gate names, no credential talk, plain
signature "Rowan Brad Quni-Gudzinas, QNFO". Webmention is content-free (it carries source/target
URLs only) so it has no prose risk.

## 6. Rollout (date-gated, zero user action)

| Phase | Date (UTC) | What fires |
|---|---|---|
| 0 | 2026-09-08 | schema applied (web_targets/web_runs/web_profiles added to qnfo-outreach D1); worker v0.1.0 deployed (/health verified); WEB_REACH_TOKEN set; 0 seeded targets (targets are discovered + TOS-checked, never fabricated) |
| 1 | 2026-09-08..15 | /run previews only; webmention self-test to own domains only |
| 2 | 2026-09-15 | ACTIVATION_AT: GREEN targets fire under caps + kill switch; webmention broadcast goes live |
| 3 | 2026-09-22 | first AMBER targets enabled after recorded TOS checks |
| 4 | 2026-10-01 | daily webmention scan cron + R2 screenshot archiving (v0.2) |

Rollback: set pipeline_state.external_sends_enabled=0 (any D1 write) — the worker checks it every
run, identical to the email pipeline. No user action required for any phase.

## 7. Measurement

- web_runs rows aggregate per day → funnel_daily.submissions + submissions.status.
- P7 scorecard outreach section extends to report webmention sends + accepted form submissions +
  browser runs, honest metrics only (no fabricated "reach", no opens/clicks).
- 90-day targets (directional): >=1 accepted web-form submission per week average post-activation;
  webmention accept rate >=30% (endpoints that return 200/202); zero RED-target writes; zero ToS
  violations; browser cost under the $90/30d budget.

## 8. Excluded & conditional (rationale)

- Written-content forum POSTS (LessWrong/AF/EA/HN/Reddit/StackExchange/Wikipedia): RED — see 2.3.
- CAPTCHA-gated or anti-automation-ToS flows: RED (W24/W25).
- AMBER target enablement: blocked until tos_evidence is recorded in web_targets.
- Browser automation is NEVER used to fabricate engagement, solicit citations, or post self-
  promotion where it is unwelcome.

## 9. Claim sheet (FRAMEWORK-DOGFOOD-1)

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| Browser Rendering available on account | Workers Paid subscription with browser_rendering_total_browser_hours + avg_concurrent_browsers usage components (2026-09-08) | high | verified |
| No prior browser/webmention/forum automation surface | grep qnfo-ops/docs + qnfo-workers = 0 hits (2026-09-08) | high | verified |
| Forums gate writes behind human accounts | RELATED-SITES-SURVEY.md + LESSWRONG-INTEGRATION.md (2026-09-03 live probes) | high | verified |
| qnfo-web-reach worker v0.1.0 deployed with browser + D1 bindings | /health version + bindings (this cycle) | high | verified (post-deploy) |
| External browser/webmention actions date-gated + kill-switched | ACTIVATION_AT + pipeline_state.external_sends_enabled check in worker.js | high | verified-by-code-read |
| Per-platform ToS assumptions | documented flags; TOS checks before AMBER enable | medium | open |
