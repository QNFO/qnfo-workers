# QNFO/QWAV Success Maximization — Master Playbook (ALL POSSIBILITIES, HONEST)

> Version 1.0 (2026-09-03) - Owner: QNFO - Status: ACTIVE (canonical strategy-space record)
>
> Claim: beyond the 163 channels already recorded, this document enumerates the remaining dimensions
> of "greatest chance of success" — an honest definition of success, the complete metric space, every
> tactical lever (content / timing / messaging / network / discovery / distribution / measurement /
> automation), the complete risk space, and the compounding mechanics — and states the single most
> important strategic conclusion: concentration beats a shotgun.
>
> Evidence: 163-channel inventory (OUTREACH-EXHAUSTIVE-INVENTORY.md), 18-audience + 24-mode catalog
> (OUTREACH-AMPLIFICATION-CATALOG.md), execution strategy (OUTREACH-AUTOMATION-STRATEGY.md), fleet
> baseline read 2026-09-03. Confidence: high on mechanism; medium on per-lever effect size (honest —
> effect sizes are unmeasured until the scorecard has data). Status: recorded; nothing enabled.
>
> Companion of: the three docs above. This is the capstone: the strategy-space dimension the others
> do not cover.

---

## 0. Honest definition of success ("whatever that means")

Success is NOT open-ended. For QNFO/QWAV it has a concrete, honest, measurable definition:

1. Real humans — not bots — discover and engage the corpus (honest /papers/* traffic up, downloads
   up, unique paths up).
2. Real citations and collaborations accrue (citation-watch verified; co-authors, reviewers, citing
   papers).
3. Reputation compounds: QNFO/QWAV becomes the citable source for reproducible, cross-domain,
   open energy-of-computation results (benchmark home, metric name recognition, media mentions).

Anti-success (explicitly off-limits, HARD): fabricated traffic or engagement, bought or solicited
citations, spam, paid venues, vanity versions, credential signaling. "Greatest chance of success"
therefore means: maximize honest discovery + engagement + citation probability per unit of effort,
under the no-fabrication / no-spam / no-gatekeeping constraints.

## 1. The complete metric space (every possible success signal, honest vs vanity)

| Metric | Honest? | Source |
|---|---|---|
| Honest /papers/* requests + unique paths | YES | CF GraphQL httpRequests1dGroups (zone-filtered) |
| Zenodo views + downloads per record + deltas | YES | zenodo_stats |
| Citation count + citation Deltas | YES | citation-watch (Crossref/OpenAlex) |
| Reply rate on RFC/interview sends | YES | funnel_daily + sends/replies |
| Submissions accepted (open venues, benchmark lists, directories) | YES | submissions.status |
| Media mentions (genuine) | YES | manual/radar |
| Collaborations / co-authorships initiated | YES | human-routed replies |
| Social engagement (likes/reposts/replies) | YES | qnfo-social + Buffer (real accounts) |
| Referrer + search query mix | YES | Google Search Console API |
| New-version count with real delta (A-D) | YES | version_queue + living-paper |
| Worker invocations | NO (self-health only) | - |
| Raw zone requests incl. scanner/bot | NO (~90% noise) | - |
| Opens/clicks via tracking pixels | NO (we do not track) | - |
| Follower counts bought/paid | NO | - |

Rule: every reported number is honest (IMPRESSIONS-ZONE-NOT-WORKER-1); the scorecard (P7) is the
single weekly source of truth.

## 2. The complete tactical lever space (every lever, by dimension)

### 2.1 Content levers — make the work consumable and quotable

| Lever | Effect |
|---|---|
| Plain-language abstract | reach students + adjacent-domain readers |
| Visual abstract / figure-1 | shareability, press pickup |
| Worked example / tutorial | practitioner adoption |
| "What to use" box (delta type B) | decision-tool value |
| One-line delta summary per version | the recurring news hook |
| FAQ | lowers barrier, captures real questions |
| Glossary / term crosswalk (CROSSWALK-TRANSLATION-1) | cross-domain reach |
| Infographic | social + press shareability |
| Video script (automatable; human reads) | podcast/YouTube reach |
| Interactive demo (qwav-demo-kit) | hands-on credibility |
| Benchmark leaderboard / table | the citable artifact |
| Code notebook (binder/colab) | reproducibility trust |
| Docker image / PyPI package | one-command adoption |
| Dataset card | data-reuse citations |
| CITATION.cff + .bib + README badges | citation ease |
| Machine translation (quality-gated, AMBER) | non-English reach |

### 2.2 Timing / cadence levers

| Lever | Effect |
|---|---|
| arXiv submission Tue-Thu (if endorsed) | search-freshness timing |
| Submit before CFP/conference deadlines | event reach |
| Align with funding cycles | grant EOI relevance |
| Post time-of-day A/B (EXP-2026-003) | social reach |
| Version cadence 30/90/errata | churn-driven re-surfacing |
| Re-surface on citation / anniversary / news hook | revive old records |
| One follow-up max, then silence | no-repeat-contact respect |
| News-jacking (honest, only when genuinely relevant) | media pickup (energy/AI-compute stories) |

### 2.3 Messaging / psychology levers (honest — no manipulation)

| Lever | Effect |
|---|---|
| SO-WHAT first (SO-WHAT-GATE-1) | reader cares |
| Numbers over adjectives | credibility |
| Question-based hook (curiosity, not clickbait) | reply rate |
| Concrete promise ("3 questions, no obligation") | lowers reply barrier |
| Reproducibility as authority | trust without credentials |
| Story (the energy cost of computation) | memory + press |
| Memorable naming (PaQit, joules-per-compute) | recognition |
| Reciprocity (cite others, thank citers) | network goodwill |
| Specificity (named numbers, named papers) | anti-telegraph, credible |
| Short, one ask | reply + no fatigue |

### 2.4 Network / compounding levers

| Lever | Effect |
|---|---|
| Citation cascade (cite relevant work -> authors notice) | inbound discovery |
| Co-authorship with ECRs | new author networks |
| Cross-domain bridges (CROSSWALK-TRANSLATION-1) | double the audience |
| Open-review reciprocity (review others -> they see you) | community standing |
| Dependency graph (integrate -> maintainers cite) | embedded reach |
| Community role (maintainer/reviewer/committee) | authority |
| Mailing-list membership + participation | field visibility |
| Mentorship / student supervision | long-horizon network |
| Backlink graph (directories, citations, blogs) | SEO + discovery |

### 2.5 Discovery / SEO levers

| Lever | Effect |
|---|---|
| JSON-LD ScholarlyArticle structured data | rich snippets |
| Keyword-relevant titles + abstracts | findability |
| DOI on every surface | resolvability |
| Backlinks (from all the above) | search rank |
| RSS + sitemap + IndexNow | freshness indexing |
| ORCID -> aggregator propagation | write-once, reach-all |
| Google Scholar meta tags | scholar indexing |
| OG/Twitter cards | link previews |
| Wikidata/Scholia items | semantic graph |

### 2.6 Distribution levers — write once, propagate N ways

The 163 channels (OUTREACH-EXHAUSTIVE-INVENTORY.md) are the N. The principle: one canonical asset
(paper + version-diff + press kit) fans out to every GREEN channel automatically on each v-next.
Effect size per channel is small; the aggregate is the win.

### 2.7 Measurement / feedback levers

| Lever | Effect |
|---|---|
| Weekly scorecard (P7, LIVE) | single source of honest truth |
| Funnel (funnel_daily) | where attention leaks |
| A/B experiments (EXP-2026-001..004, aggregate-over-N) | what messaging works |
| Citation-watch feedback | which papers resonate |
| Reply-rate tracking per campaign | message fit |
| Referrer + query tracking (GSC) | where people come from |
| Double-down rule: measure -> reinforce what works | compounding |

### 2.8 Automation levers

| Lever | Effect |
|---|---|
| Cloudflare scheduled layer for every recurring function | zero user action |
| Date-gated activation + kill switches | safety + autonomy |
| Idempotent writes + dedupe (INTENT-EXACT-DEDUPE-1) | no duplicate sends |
| No-repeat bridge (3 layers) | reputation protection |
| One cron per recurring function (CLOUD-FRONTEND-ONLY-1) | governance |


## 3. The complete risk space + mitigations (what could kill "success")

| Risk | Class | Mitigation (live / planned) |
|---|---|---|
| Deliverability collapse (spam folder) | deliverability | caps (8/day global, 3/domain), warm-up ladder, SPAM-token blacklist, no bursts, SPF/DKIM/DMARC posture |
| Double-contact / spam perception | reputation | 3-layer no-repeat bridge, one-follow-up-max, suppression list, opt-out honored |
| Fabricated engagement | integrity | honest-metrics gates, no pixels, no bought anything (anti-success §0) |
| Platform TOS violation (automated posting) | legal/TOS | AMBER tier = check-before-enable; monitor-only for Reddit/StackExchange posting |
| GDPR / CAN-SPAM non-compliance (email) | legal | opt-out in every send, own-mailbox test-sends, no scraping of non-public PII (contacts from public profiles only) |
| Rate-limit / API-key drift | technical | polite rates, token rotation (OSF/ERRATA precedent), secrets in multiple redundant stores |
| Concurrent-session collision | operational | probe /health + git log + D1 before editing; read-only on shared artifacts after detection (CONCURRENT-OUTREACH-COLLISION-1) |
| Version-constant / doc drift | operational | FLEET-SELF-DOC-1, DEPLOY-VERIFY-VERSION-1, deployed-current.worker.js mirror |
| Unverified DOI/claim in outreach | accuracy | only cite verified DOIs; COMPUTATIONAL-VERIFICATION-1 before any number ships |
| Empty contact source (miner yields few emails) | supply | multiple miners (GitHub + ORCID + events-radar + press RSS); honest: volume is low, reply rate matters more than volume |
| Reputation damage from misaddressed send | reputation | Repair-Send Protocol (threading-by-subject), misaddress correction precedent |

## 4. The compounding mechanics (why concentration wins)

The flywheel (already in VISIBILITY-VERSIONING-PROGRAM v1.0, restated as the success engine):

new version (real delta) -> Zenodo churn + search freshness + social event + IndexNow -> new
discovery -> new citation / reply / collaboration -> citation-watch trigger -> next real delta -> ...

Each turn compounds because every citation is a node in someone else's paper (their readers discover
QNFO), every collaboration adds a new author-network, and every benchmark-home placement (Green500 /
MLPerf) is a permanent inbound channel. The levers with the HIGHEST compounding rate are the pull
levers (ORCID propagation, RSS, directory/benchmark registrations), not the push levers (email).

## 5. Master index (the strategy documents + the D1 record)

| Doc | Scope | Lines |
|---|---|---|
| OUTREACH-AUTOMATION-STRATEGY.md | execution layer: programs P-A..P-F, D1 schema, worker spec, rollout | 430 |
| OUTREACH-AMPLIFICATION-CATALOG.md | WHO ELSE (18 audiences) + WHAT OTHER KINDS (24 modes), prioritized | 157 |
| OUTREACH-EXHAUSTIVE-INVENTORY.md | LIST/SAVE/RECORD EVERYTHING (163 channels, 12 categories A-L) | 273 |
| OUTREACH-SUCCESS-MAXIMIZATION.md | this doc: success definition, metric space, lever space, risk, compounding | - |
| SILO-BREAKING-STRATEGY.md | the network-structure layer: six doors, programs P-G..P-K, one-time human actions | - |
| qnfo-outreach D1 submissions | 163 inv-* rows (planned/live/monitor/excluded) + 25 cat-* curated rows (v1.1 +6) | D1 |

Reading order: Strategy (why) -> Catalog (who + what, prioritized) -> Inventory (everything) ->
Success-Maximization (how to win) -> Silo-Breaking (how to cross bubbles). The D1 is the operational registry.

## 6. The strategic conclusion (honest answer to "greatest chance of success")

A 163-channel shotgun has lower expected success than concentrated, honest, compounding execution.
The top-5 concentration set (all date-gated behind 2026-09-15, zero user action):

1. ORCID auto-update — one token, propagates to every aggregator, zero spam. Highest ROI.
2. Flagship v-next churn (JPC.003 / UMP.012 / UMP.014, delta A-D) — the proven re-surfacing engine.
3. Benchmark home placement (Green500 list + MLPerf power + PapersWithCode) — permanent inbound.
4. Public-consultation responses (EU/NIST/DOE) — regulator + downstream-press reach, policy-grade.
5. RSS/Atom feed + directory registrations (ASCL, RSD) — pull levers that keep working without us.

Everything else is Phase 6+ or monitor-only. The honest effect-size caveat: none of these are
measured until the scorecard has ~2 weeks of data; the A/B loop (EXP-2026-001..004) is how we learn
what actually moves the honest numbers, and the double-down rule turns that learning into compounding.

## 7. Claim sheet (FRAMEWORK-DOGFOOD-1)

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| Success is honestly definable + measurable (14 metrics, 10 honest / 4 vanity) | metric space §1 | high | documented |
| ~60 tactical levers across 8 dimensions | lever space §2 (tables) | high on existence, medium on effect size | documented |
| 11 risk classes with mitigations | risk space §3 | high | documented |
| Concentration beats shotgun (top-5 set) | compounding analysis §4 + §6 | medium (effect sizes unmeasured) | documented |
| 4 docs + D1 registry = complete record | master index §5 + git log | high | verified |
| Nothing new enabled beyond already-live | parent activation gate; no send invoked | high | verified |

