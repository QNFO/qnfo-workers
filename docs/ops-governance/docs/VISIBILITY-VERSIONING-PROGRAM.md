# QNFO Visibility & Continuous-Versioning Program

> Version 1.0 (2026-09-02) · Owner: QNFO · Status: ACTIVE (program plan)
> Claim: a program of continuous meaningful new versions of EXISTING QNFO papers, audience-segmented
> amplification, and honest measurement raises real (non-bot) eyeballs, downloads, and citations
> without credential signaling and without vanity bumps.
> Evidence: baseline measured 2026-09-02 (reach-audit: honest /papers/* traffic ~400 req/day across
> ~106 paths; raw 235k req/105k pageviews 30d but ~90% scanner/bot) · Confidence: medium-high ·
> Status: planned, not yet executed
> Supersedes: none · Amends: AUTONOMOUS-RESEARCH-PIPELINE.md L3/L4 (dissemination + impact layers)

---

## 1. Problem and objective

**Problem.** QNFO holds a large corpus (1,026 papers in the records system; 8,341 KG nodes / 8,493
edges) but honest web traffic to the research surface is small: ~400 req/day across ~106 paper paths
after filtering scanner/bot noise (which is ~90% of the raw 235k requests / 105k pageviews). Most
papers are one-shot deposits; their Zenodo records go quiet after publication. Credentials are not
the constraint - relevance and freshness are.

**Objective.** Turn the existing corpus into a living, compounding visibility asset:

1. Continuously release meaningful NEW VERSIONS of existing papers (each with real delta, never a
   vanity bump) - version churn raises Zenodo record views, search freshness, social events, and
   citation-watch triggers.
2. Segment amplification by audience: academics (rigor, methods, citations), practitioners
   (applied takeaways, code, demos), students (plain-language, worked examples, tutorials).
3. Measure honestly and compound what works.

The program reuses the existing cloud-native fleet (research-daily-brief, errata watch/respond/
publish, qnfo-social + Buffer, events-radar, citation-watch, qnfo-cloud-ops, IndexNow). It does NOT
ask the user to initiate outreach (OUTREACH-REVIEW-1: fully autonomous) and does NOT add skills.

---

## 2. Audiences: what "relevant" means to each

| Audience | Cares about | QNFO advantage | Surface / channel |
|---|---|---|---|
| Academics | method rigor, falsifiable claims, cross-domain bridges, honest corrections | framework-level discipline (D0-D8), universal ignorance audit, computational verification, Zenodo DOIs with version history | Zenodo record + version diff, semantic scholar/citation-watch, domain email (topic-affinity), conference/events-radar, CROSSWALK-TRANSLATION-1 (adjacent-domain readable abstracts) |
| Practitioners | applied takeaways, working code, demo kits, decision tools | qwav-demo-kit DEM-E0 gate, verified artifacts, computational reproduction scripts | GitHub repos + README, LinkedIn (Buffer), IndexNow, /papers pages, short "what to use" boxes in new versions |
| Students | plain-language explanation, worked examples, tutorials, low barrier to entry | accessible explainers attached to real papers, infographic/visual artifacts | social threads (qnfo-social Bluesky + Buffer X/Mastodon), web explainers, student-companion sections in new versions |

Relevance gate (standing): every publication and social post must carry "why a reader should care"
(SO-WHAT-GATE-1) and premise-depth disclosure, phrased for the target audience - never credential
talk, never internal gate names as marketing, never AI-telegraph styling (ANTI-TELEGRAPH-1).

---

## 3. Strategy: continuous versioning as the visibility engine

Version churn is the highest-leverage existing lever (user observation: updated records bump views
and re-surface research). Rules that keep it honest and compounding:

### 3.1 What counts as a meaningful v-next (delta types)

A new version MUST contain at least one real delta of type A-D, plus a version-delta note:

- A. **Evidence delta**: new computation, dataset, verification artifact, reproduction, corrected
  result (COMPUTATIONAL-VERIFICATION-1), errata fix.
- B. **Reach delta**: practitioner takeaway box, student companion / tutorial, plain-language
  abstract, worked example, infographic, cross-domain translation section (CROSSWALK-TRANSLATION-1).
- C. **State-of-field delta**: fresh citations, connection to a new external result, response to a
  citing or related paper, updated open-questions list.
- D. **Structural delta**: title-visible bridge, taxonomy/bridge registration (TERMINOLOGY-SILO-
  LESSONS-1), consolidated duplicate records, corrected metadata (DOI/title/author fidelity).

FORBIDDEN (anti-pattern, HARD): version bumps with no delta; version bumps that only narrate the
act of publishing (PUBLICATION-META-PROSE-1); internal register/ledger language in public prose
(PUBLICATION-BRAND-LANGUAGE-1); credential or affiliation signaling.

### 3.2 Version cadence

- Tier 1 (flagship, highest traffic/citations/domain leverage): review every 30 days for a delta;
  target 1 v-next per flagship per quarter minimum, errata-driven anytime.
- Tier 2 (active corpus): review every 90 days; target annual refresh with A/B/C delta.
- Tier 3 (long tail): errata-driven only (correct when wrong, connect when cited); no scheduled churn.
- Sweep: a weekly version-radar function (cloud) identifies candidates per delta-type triggers.

### 3.3 Why this compounds (mechanism inventory)

1. Zenodo: new version = new record churn, updated DOI history, front-page visibility on the concept
   record, OpenAIRE/aggregator refresh.
2. Search freshness: updated papers.qnfo.org URL + IndexNow ping re-indexes within hours.
3. Social events: each v-next is a natural, factual social post (delta summary, not announcement
   theater).
4. Citation-watch: when a paper is newly cited or a related external result appears, that is the
   trigger for a state-of-field delta (type C).
5. Email/outreach: topic-affinity contacts who engaged with v1 get a one-line "v2 adds X" note
   (receipt = notification, not a request - OUTREACH-REVIEW-1).

---

## 4. Pipeline changes (concrete, cloud-native)

All recurring functions live in the Cloudflare scheduled layer (CLOUD-FRONTEND-ONLY-1); the DeepChat
local scheduler is a front-end only. Canonical repo: qnfo-workers (worker bundles) + qnfo-ops
(docs/scripts). No new skills (NO-MORE-SKILLS-1).

| # | Change | Where | Cadence | Trigger |
|---|---|---|---|---|
| P1 | **version-radar function**: weekly scan living-paper + program_registry for version candidates (published >30d, has citation-watch/events/traffic signal, no pending v-next) -> version_queue rows | qnfo-cloud-ops subprocess or qnfo-idea-triage stage machine extension | weekly Mon 04:00 UTC | cron |
| P2 | **updated-papers digest** in research-daily-brief: when a v-next publishes, include "Updated this week: slug (delta type, DOI)" section | research-daily-brief worker | daily 06:00 UTC | event read |
| P3 | **v-next social amplification**: qnfo-social /compose accepts a version-delta payload (title + one-line delta + DOI). Keep >=1 queued thread; 14:30 UTC cron posts | qnfo-social + Buffer (buffer-post.py) | on publish + 14:30 | event + cron |
| P4 | **IndexNow ping on updated paper URLs** (extend existing per-publication ping to per-new-version) | qnfo-idea-triage / cloud-ops | on publish | event |
| P5 | **citation-watch -> version trigger**: on new citation or related external result for an existing paper, write a type-C suggestion to version_queue (never auto-publishes) | qnfo-citation-watch | per change | event |
| P6 | **events-radar -> version tie-in**: when a domain event/CFP matches a Tier-1 paper, suggest a reach delta (type B) for that paper targeting that event | events-radar | weekly | event |
| P7 | **honest visibility scorecard**: weekly CF GraphQL (httpRequests1dGroups on qnfo.org zone, filtered), Zenodo stats per record (views/downloads via zenodo-stats job), social engagement, version count. Emit to qnfo-audit + digest | qnfo-cloud-ops v1.9.0 jobVisibility (LIVE 2026-09-02, commit 0a7c070) | weekly Mon 07:30 AMS (30 5 * * 1) | cron |
| P8 | **errata-publish already live**: inbound correction emails -> errata_queue -> errata_actions -> automated new-version publish (canonical 2026-09-02 v0.5 locale-framework). KEEP; count as delta type A. | qnfo-errata-watch/respond/publish | hourly | event |

Note: P1/P5/P6 produce version_queue rows only; a human-veto-free but gate-checked publish path is
out of scope until one full cycle proves queue quality. Version publish itself reuses the existing
newversion gates: NEWVERSION-DRAFT-FILE-KEY-1, ZENODO-BUCKET-PUT-CANONICAL-1, ZENODO-NEWVERSION-
STRAY-PURGE-1, ZENODO-CONCEPTRECID-COERCE-1, PDF-FRONT-MATTER-1, POST-PUBLISH-FRONTMATTER-ASSERT-1,
REGISTRY-LAG-PARITY-1.

---

## 5. Metrics and honest measurement

Baseline (2026-09-02 reach audit, IMPRESSIONS-ZONE-NOT-WORKER-1): worker_invocations table is
self-health only and is NEVER cited as external traffic. Real signals:

- CF GraphQL httpRequests1dGroups (zone 84e9dc1d7fb72629ccdbe3174ed24420): 30d raw 235k req /
  105k pageviews, ~90% scanner/bot; honest research traffic = /papers/* ~400 req/day across ~106 paths.
- Zenodo per-record views/downloads via zenodo-stats.
- Citation change deltas via citation-watch (Crossref/OpenAlex).
- Social engagement per post (Bluesky + Buffer channels); 96 QNFO-aligned accounts in registry.

Scorecard (weekly, P7): honest_paper_requests, unique_paper_paths, top_10_papers, new_versions,
versions_with_delta_A/B/C/D, zenodo_views_delta, downloads_delta, citation_deltas, social_engagements.

90-day targets (directional, re-baselined after 2 weeks of scorecard data):
- Honest /papers/* traffic: +50% (from ~400/day).
- v-next releases: 3 flagship v-nexts + errata-driven versions.
- Zenodo views on updated records: measurable bump on the concept record within 14 days of v-next.
- Citations: >=1 new citation per flagship updated paper (citation-watch verified).

Success criterion per v-next: the updated record shows a view/download bump AND the delta is
independently verifiable (diff between versions visible on Zenodo) - not just a social spike.

---

## 6. Governance and integrity gates

- WEBSITE-SYNC-COLUMNS-1 (HARD, canonical 2026-09-02 JPC.003 v1.7): the qnfo website (papers.qnfo.org, qnfo-gateway) renders
LIVING from D1 living-paper columns doi + body_md (+ version, title, abstract) at request time - it is dynamic-via-D1, NOT static.
A new-version publish is therefore NOT in sync with the website until those exact columns are written. Anti-pattern (observed): the
publish sync step wrote only zenodo_doi + version, leaving doi = old record and body_md = old body; the live page kept serving v1.6
(DOI 22117282, no addendum) while the Zenodo record was already v1.7 (22261547). Gate: after EVERY new-version publish, write the
new record DOI into BOTH doi and zenodo_doi AND replace body_md with the full v1.7 markdown (frontmatter + body + addendum), then
verify live https://papers.qnfo.org/papers/<slug> shows the new record DOI and new-version markers and ZERO occurrences of the old
record DOI. Registry (portfolio-state) + living-paper + website must agree (REGISTRY-LAG-PARITY-1 extended to the website).

- NO vanity versions: delta-type check is part of the publish gate; a v-next with no A-D delta is
  rejected (mirrors INTERNAL-COUNTS-SWEEP-1 / deposit-integrity gates).
- NO credential/affiliation signaling anywhere in public prose (user mandate).
- Brand-language ban: no register/ledger/kill-condition/honesty tokens in public prose.
- Anti-telegraph (ANTI-TELEGRAPH-1) and no meta-commentary narrating publishing (PUBLICATION-META-
  PROSE-1).
- Publications remain Zenodo-canonical (NO-JOURNALS-1); GitHub provenance and R2 mirror per
  R2-MIRROR-AFTER-PUBLISH-1.
- All quantitative claims stay computationally verified (COMPUTATIONAL-VERIFICATION-1) with
  artifacts deposited.
- Claim-sheet convention (FRAMEWORK-DOGFOOD-1): this document's claims carry evidence pointers;
  update rows as the program executes.
- Fleet/self-doc discipline: any worker change keeps VERSION + /health + repo bundle parity
  (FLEET-SELF-DOC-1, DEPLOY-VERIFY-VERSION-1).

---

## 7. Program structure and ownership

| Role | Function |
|---|---|
| Version-radar (cloud) | weekly candidate sweep -> version_queue |
| Publish path | existing newversion gate chain (errata + session-driven) |
| Amplification | qnfo-social + Buffer (autonomous) |
| Measurement | P7 scorecard weekly; quarterly program review with user |
| Guardrails | existing anti-pattern registry + fleet auditor |

Program review cadence: weekly scorecard digest; quarterly plan revision with the user (evidence-
based: what delta type drove the most honest eyeballs).

---

## 8. Claims and evidence

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| Version churn raises record visibility | user observation + Zenodo mechanics; to measure per-v-next from first release | medium | to-verify-cycle-1 |
| Honest baseline ~400 req/day /papers/* | reach-audit 2026-09-02 (CF GraphQL filtered) | high | verified-baseline |
| Err errata auto-publish live | canonical 2026-09-02 locale-framework v0.5 06:38Z | high | verified |
| Social engine live (Bluesky + Buffer 3 channels) | BUFFER-CROSS-PLATFORM-LIVE-1 / QNFO-SOCIAL-ENGINE-LIVE-1 2026-09-02 | high | verified |
| Version queue triggers (P1/P5/P6) not yet built | this plan | n/a | planned |
| P7 scorecard live in qnfo-cloud-ops v1.9.0 | /health 2026-09-02 (17 jobs, visibility); commit 0a7c070; schedule 30 5 * * 1 | high | verified-live |
| Website serves published version (doi+body_md) | WEBSITE-SYNC-COLUMNS-1 fix 2026-09-02: live page shows 22261547/addendum, 0x 22117282 | high | verified-live |

---

## 9. Backlog / known gaps (explicit, owned)

- P1/P5/P6 version-radar and trigger wiring: owner = next cloud-ops cycle; entry gate = this plan
  approved (planning -> execute after user confirms priorities or cycle 1 queue).
- Tier-1 flagship shortlist (first 3 candidates for cycle 1): to be produced from traffic +
  citation + domain-leverage ranking in cycle 1 (this session or next).
- Scorecard schema in qnfo-audit D1: to be added with P7 (weekly Monday run).
- Conference-radar -> events-radar consolidation is DONE (2026-09-02); P6 references events-radar.

---

*Canonical repo: QNFO/qnfo-ops (docs/VISIBILITY-VERSIONING-PROGRAM.md). Companion: CLOUD-NATIVE-
AUTONOMY-PLAN.md, AUTONOMOUS-RESEARCH-PIPELINE.md, ARP-OPERATIONS-POLICY.md.*
