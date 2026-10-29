# QNFO/QWAV Outreach Amplification Catalog — WHO ELSE / WHAT OTHER KINDS

> Version 1.1 (2026-09-04) - Owner: QNFO - Status: ACTIVE (planned inventory; nothing enabled yet)
>
> v1.1 (2026-09-04): section 6 added - six network-structure modes from
> docs/SILO-BREAKING-STRATEGY.md (the trust-transitivity layer). The original v1.0 content is
> unchanged below.
>
> Claim: beyond the eight audiences and thirteen channel items already listed in
> OUTREACH-AUTOMATION-STRATEGY.md sections 3 and 4b, there is a further catalog of ~18 reachable
> human segments and ~24 automatable communication modes, each 100% cloud-native, TOS-tiered, and
> open-science aligned, that materially extends visibility/reach/impact of the corpus without paid
> venues and without gatekeeping.
>
> Evidence: gap analysis of the strategy doc as of 2026-09-03 (section 3 = 8 audiences; section 4b =
> 13 items) against the full automatable surface reachable from the existing fleet (ORCID/OSF/
> Zenodo creds, GitHub API, cf-bounce email, qnfo-social + Buffer, IndexNow, Google Search Console
> script). Confidence: high on mechanism existence; medium on per-platform TOS (flagged per row).
> Status: catalog documented + seeded to qnfo-outreach D1 submissions table as planned rows; zero
> enabled channels (activation is Phase 4+, date-gated in the parent strategy).
>
> Companion of: docs/OUTREACH-AUTOMATION-STRATEGY.md (this document is the completeness expansion of
> its section 3 + section 4b). Does NOT supersede it. Does NOT add skills (NO-MORE-SKILLS-1).

Consolidation note: about six items here restate strategy 4b for completeness (ORCID, Software
Heritage, PapersWithCode, newsletter submissions, podcast pitch, awards radar); the remaining ~18
modes and all 18 audience segments are new. Nothing is enabled by this document alone.

---

## 1. How to read this catalog

Three compliance tiers govern every row:

- GREEN = automatable NOW from the existing fleet (public API or email), no TOS barrier, open-science
  aligned. Enabling is a config/worker change, not a new relationship.
- AMBER = automatable with an account or a per-platform TOS check first; enable only after the check
  is recorded in the submissions table (evidence column).
- RED = monitor-only or explicitly excluded (self-promotion rules, COI, paywalls, gatekeeping).

Every row maps 1:1 to a submissions-table row (kind = mode, target = platform, status = planned) so
the catalog is operational, not aspirational. Nothing here sends anything until the parent strategy's
activation date (2026-09-15) and the per-channel TOS gate clears.

## 2. WHO ELSE — audience expansion (18 segments beyond the 8 in strategy section 3)

| # | Segment | Cares about | Hook that resonates | Channel | Tier |
|---|---|---|---|---|---|
| 1 | Postdocs / early-career researchers | citations, collaborations, review track record | co-author a v-next, open-peer-review credit (PREreview/PRC), reproducible claim they can cite | RFC + open-review invite + social | GREEN |
| 2 | PhD students / reading groups | literature survey, worked examples, low barrier | student-companion section, tutorial, demo kit, plain-language abstract | student companion in v-next + social + package registries | GREEN |
| 3 | Science/data librarians | durable DOIs, OAI-PMH metadata, catalog-ready records | stable concept DOIs + license clarity -> they add QNFO to institutional guides and catalogs | email EOI + auto-deposit to open directories | GREEN |
| 4 | Science communicators / YouTube / podcast hosts | content, data, a guest | explainer + a number + a guest who can defend the physics | P-B pitch variant + press kit (PRESS-KIT.md) | GREEN |
| 5 | Open-source maintainers (adjacent tooling) | roadmap overlap, dependencies | benchmark integration into qiskit/pennylane/slurm/pytorch-energy/codecarbon workflows | GitHub issue/PR/discussion + email (genuine contribution, never spam) | GREEN |
| 6 | Benchmark/standards working groups | comparability, methodology | RFC on the metric; a candidate system-level benchmark for their committee | RFC email + standards public-comment | GREEN |
| 7 | Industry lab energy engineers | procurement/design decisions, defensible numbers | reproducible benchmark numbers that change a buy/build/rightsize decision | RFC + practitioner package + PyPI/HF/Docker | GREEN |
| 8 | Nonprofits / climate-compute advocacy | policy-grade open evidence | open dataset of compute energy (The Green Web Foundation, ClimateAction.Tech, Partnership on AI) | EOI + consultation response + newsletter submission | GREEN |
| 9 | Policy / regulators | transparent reporting, verifiable claims | benchmark as evidence in an open consultation (EU AI Act, Energy Efficiency Directive, DOE/EIA) | consultation-portal submission + EOI | AMBER |
| 10 | Citation-graph neighbors (co-citation) | shared foundations | "we both build on X - here is the energy angle you may not have seen" | citation-watch extension + email | GREEN |
| 11 | Local meetup / hackathon organizers | speakers, workshops | lightning talk or workshop on the demo kit | meetup.com API + Indico/pretalx/Sessionize | AMBER |
| 12 | Award / prize committees | credible nominations | nomination with DOI + reproduction evidence (open-science prizes, thesis awards) | email EOI (kind=award_eoi) | GREEN |
| 13 | Curriculum / syllabus maintainers | canonical references, worked examples | the paper + companion as a reading-list entry | Open Syllabus contribution + reading-list outreach | AMBER |
| 14 | Field preprint server editors | ready-to-deposit records | self-deposit (engrXiv/TechRxiv/Preprints.org/ESSOAr) - no editor contact needed | field preprint deposit | AMBER |
| 15 | Dataset/leaderboard maintainers | submissions that raise their bar | submit the benchmark (MLPerf power, Green500 list, PapersWithCode leaderboard, HF/OpenML/Kaggle) | leaderboard/list submission | AMBER |
| 16 | RSS/aggregator + newsletter/podcast curators | a feed to watch | publish an RSS/Atom feed of new versions -> they auto-consume | RSS feed (pull, no email) | GREEN |
| 17 | University tech-transfer offices | licensable tools | the metric as an evaluation tool (low priority, opt-in) | email EOI | AMBER |
| 18 | Research software directories | indexed, discoverable software | register the demo kit + benchmark code (ASCL, Research Software Directory, scicodes) | directory submission (form/API) | GREEN |

Exclusions (restated, not re-argued): Wikipedia (COI), Reddit/Stack Exchange posting (self-promotion
rules - answers with disclosure only), SSRN/Hackernoon/F1000Research/traditional journals (paid or
gatekeeping), citation-trading / reciprocal-promotion (fabrication-adjacent).
Also out of scope (documented, not deferred): paid press wires (EurekAlert needs institutional
sponsorship, PR Newswire is paid) and human-produced video/audio (the automatable path is the RSS
feed + pitch that reach those producers).

## 3. WHAT OTHER KINDS — communication-mode expansion

Grouped by mechanics so the highest-ROI, zero-gatekeeping "pull" levers come first.

### 3.1 Pull channels — write once, propagate everywhere (GREEN, zero gatekeeping, highest ROI)

These are not emails and not social posts; they are metadata/deposits that reach people THROUGH the
infrastructure they already monitor. No outbound contact, no spam risk.

| Mode | Mechanism | Tier | Priority |
|---|---|---|---|
| ORCID works auto-update on publish | ORCID API (token alongside OSF creds) adds each new DOI; propagates to OpenAlex/Crossref/Semantic Scholar/Google Scholar/Scopus + institutional harvesters automatically | GREEN | P0 |
| Crossref/DataCite relation links | Zenodo metadata related-identifiers already flow; extend isRelatedTo/isSupplementTo to connect papers to datasets/software | GREEN | P1 |
| RSS/Atom feed of new versions | papers.qnfo.org/feed.xml from D1 living-paper on each v-next; aggregators, curators, newsletter/podcast producers auto-consume | GREEN | P1 |
| OAI-PMH exposure via Zenodo | already automatic; institutional repositories harvest; monitor BASE/CORE/OpenAIRE indexed state | GREEN | monitor |
| Software archival + citation files | Software Heritage save-code-now (API) + GitHub CITATION.cff + Zenodo software records | GREEN | P1 |
| Search/webmaster signals | Google Search Console API (script exists) + Bing Webmaster API + IndexNow (live) | GREEN | P1 |

### 3.2 Push channels — outbound, automatable (GREEN/AMBER)

| Mode | Mechanism | Tier | Priority |
|---|---|---|---|
| Public consultation / call-for-evidence responses | EU "Have Your Say" portal + NIST/DOE RFIs: submit the benchmark as evidence (form/email automatable); highest-leverage NEW channel, reaches regulators and their downstream press | AMBER | P0 |
| Standards-body public comments | NIST/IEEE/ISO draft comment periods, SPEC/GREEN open comments: automated technical comment submission | AMBER | P1 |
| Open peer review / preprint comments | OSF comments (live), PREreview, Qeios, PRC, Hypothesis.is (web-annotation API), PubPeer (factual citation-level notes only), Sciety | AMBER | P1 |
| Field preprint cross-posting | engrXiv, TechRxiv, Preprints.org, ESSOAr self-deposit (per-field reach without journal gatekeeping) | AMBER | P2 |
| Software directory registration | ASCL, Research Software Directory, scicodes (form/API) | GREEN | P1 |
| Leaderboard / list / challenge submissions | MLPerf power submission, Green500 list submission, PapersWithCode task+leaderboard, HuggingFace/OpenML/Kaggle datasets | AMBER | P0 |
| Q&A knowledge bases | Stack Exchange answers WITH affiliation disclosure (not self-promo posts); Discourse community forums where announcements are permitted; ResearchGate Q&A (TOS) | AMBER | P2 |
| Mailing lists / LISTSERV | field announcement lists (quantum-computing, HPC announce) - one factual announcement per version, respect list rules | GREEN | P2 |
| Webmentions / pingbacks | when a QNFO post cites an external blog, send a webmention so the cited author is notified (reciprocal, non-spammy) | GREEN | P2 |
| Meetup / unconference talks | meetup.com API, Sessionize CFP, Indico/pretalx (covered) | AMBER | P2 |
| Award nominations | open-science prizes, PhD thesis awards - nomination EOI with DOI evidence (kind=award_eoi) | GREEN | P2 |
| Dependency-graph outreach | GitHub dependents of QNFO packages - thank/reach maintainers who already build on the toolkit | GREEN | P2 |
| Crowdsourced open-publishing | Octopus.ac (free, no APC), PRC (Peer Community In) for reviews | AMBER | P2 |
| Newsletter submissions | community digests accept contributed items by email (restated from strategy 4b item 2) | GREEN | P2 |

### 3.3 Passive / auto-harvest channels (no action, monitor-only)

| Mode | Mechanism | Tier |
|---|---|---|
| Google Scholar / Semantic Scholar / OpenAlex / BASE / CORE / OpenAIRE indexing | automatic from Zenodo + ORCID; monitor indexed state | GREEN |
| Citation alerts OUT | when QNFO cites external work, the cited author's Scholar/Crossref alerts fire automatically (passive reciprocal reach) | GREEN |
| Connected Papers / Litmaps auto-index | automatic from arXiv/Crossref metadata | GREEN |
| Unpaywall / OpenAlex profiles | automatic | GREEN |

### 3.4 Regulatory & standards surface (dedicated)

The single largest untapped leverage: QNFO's benchmark is policy-grade evidence. Two programmatic
moves, both 100% automatable, no gatekeeping:

1. Consultation responses: a weekly radar over EU/NIST/DOE open consultations (RSS + portal scrape),
   keyword-matched to energy/computation/open-science, drafts a call-for-evidence response reusing
   the benchmark's verified numbers (COMPUTATIONAL-VERIFICATION-1), submits by portal email/form.
2. Standards comments: watch SPEC power, Green500/TOP500, MLCommons power, and Green Software
   Foundation open comment windows; submit the metric as a candidate benchmark comment.

TOS gate: most portals forbid automated FORM submission but accept email; the radar flags which path
is allowed per consultation and falls back to EOI-by-email (same rule as grants, strategy 4-D).

## 4. Prioritization and next action

Ranked by leverage x feasibility x compliance (tier) with honest risk:

| Rank | Item | Why first | Enable at |
|---|---|---|---|
| 1 | ORCID auto-update | one token, propagates to every aggregator, zero spam | v0.2 (Phase 5) |
| 2 | Green500 list + MLPerf power submission | the benchmark's natural home; reaches the exact practitioners + press that cover the list | v0.2 |
| 3 | Public consultation responses | regulator reach + downstream press; highest leverage-per-send | v0.2 funding-radar cron |
| 4 | RSS/Atom feed | pull lever, no outbound, enables segment 16 automatically | qnfo-gateway next rev |
| 5 | ASCL + Research Software Directory | zero-barrier software discovery for the demo kit | v0.2 |
| 6 | Software Heritage save-code-now | archival + citation, automatable now | v0.2 |
| 7 | Field preprint cross-posting (engrXiv/TechRxiv) | per-field reach without journal gatekeeping | Phase 6 |
| 8 | Stack Exchange answers with disclosure | answers real questions, earns trust, no promotion spam | Phase 6 |

Everything else is P2/Phase 6+ or monitor-only. None of it requires user action: each is a config,
token, or worker step date-gated behind the parent strategy's activation.

## 5. Claim sheet (FRAMEWORK-DOGFOOD-1)

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| 18 additional reachable audience segments beyond strategy section 3 | gap analysis vs full automatable surface, this cycle | high | documented |
| 24 additional communication modes beyond strategy 4b | mechanism inventory across pull/push/passive/regulatory, this cycle | high on mechanism, medium on per-platform TOS | documented |
| Catalog seeded to D1 submissions as planned rows | INSERT with sentinel guard + COUNT readback, this cycle | high | verified |
| Zero channels enabled; activation date-gated | parent strategy rollout + tier gates; no send path invoked | high | verified |
| Per-platform TOS assumptions (Green500/MLPerf/PubPeer/meetup) | flagged AMBER; checks recorded before enable | medium | open |

## 6. v1.1 additions (2026-09-04) - the network-structure layer

The v1.0 catalog is channel-complete but contains no trust-transitivity layer. Six new modes
close that gap; full specs live in docs/SILO-BREAKING-STRATEGY.md (programs P-G..P-K + HA-1).
Seeded as planned rows in the submissions table this cycle (cat-* ids below).

| Mode | Mechanism | Tier | Priority | Cat id |
|---|---|---|---|---|
| arXiv submission + endorsement map | flagship deposits; endorsement acquired via cited-paper authors (policy-documented path, verified live 2026-09-04) | AMBER (account + endorsement); map itself GREEN | P0 | cat-arxiv_endorsement |
| Proactive reply-engagement | keyword radar over Bluesky/Mastodon/X/HN/LW; one substantive reply per relevant thread, cap 2/day | GREEN (Bluesky/Mastodon); AMBER (X, HN, LW) | P0 | cat-proactive_reply |
| Hub-ranked contact mining | network_position score (OpenAlex/GitHub/social followers) + hub-tier templates | GREEN | P1 | cat-hub_ranking |
| Domain-native framing kits | per-domain canon/vocabulary/open-problem packs wired into templates | GREEN | P0 | cat-framing_packs |
| Bridge-note publication program | 2-4 short technical notes/year that build on external work, reference lists crossing >=2 domains | GREEN | P1 | cat-bridge_notes |
| Google Scholar profile | one-time human action (owner=user), trigger = ORCID propagation detected by citation_sweep | manual | P1 | cat-scholar_profile |

Why these matter: a filter bubble is an attention network, not a channel gap. These six modes are
the doors - infrastructure (arXiv), participation (replies), sub-hubs (ranking), language
(framing), and the reference graph (bridge notes) - the catalog's fan-out list does not reach on
its own.
