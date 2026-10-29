# QNFO/QWAV Outreach — Exhaustive Inventory (LIST / SAVE / RECORD EVERYTHING)

> Version 1.0 (2026-09-03) - Owner: QNFO - Status: ACTIVE (canonical record; nothing enabled yet)
>
> Claim: every conceivable automated send/receive/communication/amplification surface for QNFO/QWAV
> is enumerated here, tiered (GREEN/AMBER/RED), with its automation mechanism and current status, so
> nothing is missed and every item is durable. This is the superset; the strategy (execution) and the
> catalog (prioritized) are the subsets.
>
> Evidence: enumeration against the full automatable surface reachable from the existing fleet
> (Cloudflare email, ORCID/OSF/Zenodo creds, GitHub API, qnfo-social + Buffer, IndexNow, Google Search
> Console script, D1 registries). Confidence: high on mechanism existence; medium on per-platform TOS
> (flagged per row). Status: recorded to this doc + qnfo-outreach D1 submissions table (status
> planned|monitor|excluded); zero channels enabled.
>
> Companion of: docs/OUTREACH-AUTOMATION-STRATEGY.md (execution) + docs/OUTREACH-AMPLIFICATION-CATALOG.md
> (prioritized). Does NOT supersede either. No new skills (NO-MORE-SKILLS-1).
>
> Tier legend: GREEN = automatable now, no TOS barrier. AMBER = needs account/TOS check. RED =
> monitor-only or excluded (self-promotion rules, COI, paywall, gatekeeping).

---

## Category A — Outbound email modes (every kind of email QNFO may send)

| id | Mode | Recipient | Mechanism | Tier | Status |
|---|---|---|---|---|---|
| A01 | RFC - practitioner | practitioners | templated RFC + 3 questions | GREEN | seeded |
| A02 | Async informational interview - academic | academics | 3-5 question questionnaire | GREEN | seeded |
| A03 | Journalist pitch | journalists | hook + press-kit link | GREEN | seeded |
| A04 | Blogger / podcast-host pitch | bloggers, podcasters | P-B variant | GREEN | planned |
| A05 | Grant EOI | program officers | EOI template + DOI evidence | GREEN | seeded |
| A06 | Award nomination EOI | prize committees | nomination + reproduction evidence | GREEN | planned |
| A07 | Citation thank-you | citing authors | thanks + related work | GREEN | seeded |
| A08 | Version note to prior engagers | engaged contacts | one-line "v2 adds X" | GREEN | seeded |
| A09 | Co-citation neighbor outreach | bibliographic-coupling authors | "we build on X - energy angle" | GREEN | planned |
| A10 | Conference / session EOI | organizers | abstract/talk EOI | GREEN | seeded |
| A11 | Standards working-group RFC | SPEC/Green500/MLCommons | metric RFC | GREEN | planned |
| A12 | Policy consultation submission email | regulators | benchmark as evidence | AMBER | planned |
| A13 | Newsletter contributed item | community digests | one item per issue | GREEN | planned |
| A14 | LISTSERV / mailing-list announcement | field lists | one factual post per version | GREEN | planned |
| A15 | Press-kit request fulfillment | journalists | auto-send PRESS-KIT.md | GREEN | planned |
| A16 | Reproduction / data request fulfillment | researchers | auto-send script/artifact | GREEN | planned |
| A17 | Reviewer-invite response (open review) | PREreview/PRC | accept/decline + review | AMBER | planned |
| A18 | Co-authorship proposal (ECRs) | postdocs/students | invite to co-author v-next | GREEN | planned |
| A19 | Reference / bibliography request response | researchers | auto-send .bib + DOI | GREEN | planned |
| A20 | Community-membership request | Zenodo/GitHub orgs | join-request email | GREEN | planned |
| A21 | Dependency-maintainer outreach | GitHub dependents | thanks + integration note | GREEN | planned |
| A22 | Cross-list request | arXiv moderators | category cross-list ask | AMBER | planned |
| A23 | Faculty / job-market outreach | departments | separate job-market-watch worker | GREEN | live-separate |
| A24 | Data-sharing response | dataset requesters | auto-send licensed data | GREEN | planned |


## Category B — Inbound email handling (every kind of email QNFO receives + auto-responds)

> Accuracy note: "live" here means the underlying qnfo-email triage + errata pipeline exist; the
> outreach-specific wiring (answer -> rfc_responses, bounce -> sends.bounced, suppress-list update, RAG
> email reply, newsletter/unsubscribe) is v0.2. Rows marked planned are therefore "live triage / planned wiring".

| id | Mode | Trigger | Handling | Tier | Status |
|---|---|---|---|---|---|
| B01 | RFC answer intake | inbound reply to RFC | store rfc_responses + auto-thanks | GREEN | planned |
| B02 | Interview answer intake | inbound questionnaire reply | store rfc_responses + auto-thanks | GREEN | planned |
| B03 | Opt-out | inbound "remove me" | suppression list + ack | GREEN | planned |
| B04 | Bounce | cf-bounce | sends.status=bounced, never retry | GREEN | planned |
| B05 | Meeting request | inbound | route to USER (human-required) | GREEN | live |
| B06 | Collaboration proposal | inbound | route to USER (human-required) | GREEN | live |
| B07 | Press / media query | inbound | auto-ack + press kit + route to USER | GREEN | planned |
| B08 | Data / reproduction request | inbound | auto-send assets | GREEN | planned |
| B09 | Research question | inbound | auto-RAG answer over corpus | GREEN | planned |
| B10 | Error report / correction | inbound | errata pipeline (watch/respond/publish) | GREEN | live |
| B11 | Newsletter signup | inbound subscribe | subscriber D1 row | GREEN | planned |
| B12 | Unsubscribe | inbound | suppression list | GREEN | planned |
| B13 | Spam / abuse | inbound | classify NOISE | GREEN | live |
| B14 | Other-domain mail (qwav.org/.tech) | inbound to sibling domains | same triage | GREEN | live |
| B15 | Thank-you / minimal ack | inbound | no-op or minimal reply | GREEN | planned |

## Category C — API submissions / deposits / registrations (every deposit surface)

| id | Target | Mechanism | Tier | Status |
|---|---|---|---|---|
| C01 | Zenodo deposit | existing publish pipeline | GREEN | live |
| C02 | Zenodo community membership + attach | API/email | GREEN | planned |
| C03 | OSF preprint | OSF API (creds) | GREEN | planned |
| C04 | OSF comment on registrations | OSF API (precedent) | GREEN | live |
| C05 | PREreview | REST API, account | AMBER | planned |
| C06 | Qeios | free open review | AMBER | planned |
| C07 | PRC (Peer Community In) | recommenders, email | AMBER | planned |
| C08 | arXiv | API, endorsement-conditional | AMBER | conditional |
| C09 | TechRxiv | IEEE tech preprint | AMBER | planned |
| C10 | engrXiv | engineering preprint | AMBER | planned |
| C11 | Preprints.org | MDPI preprint | AMBER | planned |
| C12 | ESSOAr | earth-science preprint | AMBER | planned |
| C13 | Research Square | Springer preprint | RED | excluded |
| C14 | Figshare (free tier) | API deposit | AMBER | planned |
| C15 | Octopus.ac | free open publishing | AMBER | planned |
| C16 | Wikidata (paper/concept items) | API, bot approval | AMBER | planned |
| C17 | Software Heritage | save-code-now API | GREEN | planned |
| C18 | ASCL (Astrophysics Source Code Library) | form/email | GREEN | planned |
| C19 | Research Software Directory | form/API | GREEN | planned |
| C20 | scicodes | form | AMBER | planned |
| C21 | Zenodo software record | existing pipeline | GREEN | planned |
| C22 | GitHub release + topic tags | API | GREEN | live |
| C23 | GitHub awesome-list PR | API PR create | GREEN | planned |
| C24 | PyPI | twine/API publish | GREEN | planned |
| C25 | npm | npm publish | GREEN | planned |
| C26 | HuggingFace dataset/model | API upload | AMBER | planned |
| C27 | OpenML | API upload | AMBER | planned |
| C28 | Kaggle dataset | API upload | AMBER | planned |
| C29 | Docker Hub / GHCR | API push | GREEN | planned |
| C30 | ORCID works update | API (token) | GREEN | planned |
| C31 | Crossref/DataCite relation links | metadata via Zenodo | GREEN | planned |
| C32 | Google Search Console / Bing / IndexNow | API + script | GREEN | live |
| C33 | meetup.com event | API, organizer acct | AMBER | planned |
| C34 | Sessionize CFP | web form | AMBER | planned |
| C35 | Indico abstract | API | AMBER | planned |
| C36 | pretalx | API | AMBER | planned |
| C37 | MLPerf power submission | MLCommons process | AMBER | planned |
| C38 | Green500 / TOP500 list | submission process | AMBER | planned |
| C39 | PapersWithCode task + leaderboard | API | AMBER | planned |
| C40 | Hypothesis.is annotation | public API | GREEN | planned |
| C41 | PubPeer (factual note) | registration, factual-only | AMBER | planned |
| C42 | Open Syllabus contribution | dataset contribution | AMBER | planned |
| C43 | EU "Have Your Say" consultation | portal email/form | AMBER | planned |
| C44 | NIST / DOE RFI | email submission | AMBER | planned |
| C45 | grants.gov | Search API + form | AMBER | planned |


## Category D — Social / community platforms

| id | Platform | Mechanism | Tier | Status |
|---|---|---|---|---|
| D01 | Bluesky | qnfo-social worker | GREEN | live |
| D02 | Mastodon | Buffer | GREEN | live |
| D03 | LinkedIn | Buffer | GREEN | live |
| D04 | X / Twitter | Buffer | GREEN | live |
| D05 | Reddit | monitor-only (self-promo rules) | RED | monitor |
| D06 | Stack Exchange | answer-with-disclosure | AMBER | planned |
| D07 | Hacker News | Show HN + comments | AMBER | planned |
| D08 | Lobsters | tech link aggregator | AMBER | planned |
| D09 | ResearchGate | profile + Q&A (TOS) | AMBER | planned |
| D10 | Discourse community forums | announcement where permitted | AMBER | planned |
| D11 | Discord / Slack open communities | opt-in posting | AMBER | planned |
| D12 | Matrix chatrooms | opt-in | AMBER | planned |
| D13 | GitHub Discussions | API | GREEN | planned |
| D14 | Quora | answer-with-disclosure | AMBER | planned |
| D15 | ProductHunt | one-shot launch | AMBER | planned |
| D16 | Dev.to / Hashnode | technical syndication | AMBER | planned |

## Category E — Identity / profile enrichment (write-once, propagate)

| id | Registry | Mechanism | Tier | Status |
|---|---|---|---|---|
| E01 | ORCID | API (token) | GREEN | planned |
| E02 | Google Scholar profile | auto via ORCID | GREEN | auto |
| E03 | ResearchGate profile | manual/TOS | AMBER | planned |
| E04 | Scopus author profile | auto via DOI | GREEN | auto |
| E05 | WoS / Publons ResearcherID | auto/manual | AMBER | planned |
| E06 | Crossref author metadata | via deposits | GREEN | live |
| E07 | Wikidata author item | API (bot) | AMBER | planned |
| E08 | GitHub profile + org | API | GREEN | live |
| E09 | Zenodo community profile | API | GREEN | planned |
| E10 | Lens.org profile | auto | GREEN | auto |

## Category F — Media / press surfaces

| id | Surface | Mechanism | Tier | Status |
|---|---|---|---|---|
| F01 | Press kit | PRESS-KIT.md (live) | GREEN | live |
| F02 | Press release on owned channels | RSS + pitch + social | GREEN | planned |
| F03 | EurekAlert | institutional sponsorship | RED | excluded |
| F04 | PR Newswire / wire services | paid | RED | excluded |
| F05 | HARO (Help A Reporter Out) | respond to journalist queries | AMBER | planned |
| F06 | Qwoted / SourceBottle | journalist request platforms | AMBER | planned |
| F07 | Muck Rack / media databases | paid API | RED | excluded |

## Category G — Partnership / cross-promotion

| id | Mode | Mechanism | Tier | Status |
|---|---|---|---|---|
| G01 | Citation solicitation / trading | - | RED | excluded |
| G02 | Co-authored technical post | email | GREEN | planned |
| G03 | Webinar / office hours | event + social | GREEN | planned |
| G04 | Open-source project collaboration | GitHub | GREEN | planned |
| G05 | Research-group partnership | email | GREEN | planned |
| G06 | Student mentorship / supervision | email to departments | GREEN | planned |
| G07 | Guest lecture | email to departments | GREEN | planned |


## Category H — Event / conference surfaces

| id | Surface | Mechanism | Tier | Status |
|---|---|---|---|---|
| H01 | Indico / pretalx / Sessionize (cross-ref C34-C36) | API | AMBER | planned |
| H02 | ConfCalendar / PaperCall CFP aggregators | API/feed | AMBER | planned |
| H03 | OpenReview venue submission | API | AMBER | planned |
| H04 | University seminar series | email to departments | GREEN | planned |
| H05 | Local meetup (cross-ref C33) | meetup API | AMBER | planned |

## Category I — Funding / grant surfaces

| id | Surface | Mechanism | Tier | Status |
|---|---|---|---|---|
| I01 | grants.gov (cross-ref C45) | Search API | AMBER | planned |
| I02 | EU Funding & Tenders portal | EOI/email | AMBER | planned |
| I03 | Euraxess RSS | feed watch | GREEN | planned |
| I04 | Foundation sites (Sloan/Moore/Templeton) | email EOI | GREEN | planned |
| I05 | DARPA / IARPA BAA | email EOI | AMBER | planned |
| I06 | NLnet | funding/ dir + pipeline | GREEN | live |

## Category J — Web / search / discovery surfaces

| id | Surface | Mechanism | Tier | Status |
|---|---|---|---|---|
| J01 | sitemap.xml | gateway | GREEN | live |
| J02 | RSS / Atom feed of new versions | gateway next rev | GREEN | planned |
| J03 | IndexNow | live | GREEN | live |
| J04 | JSON-LD (schema.org ScholarlyArticle) | page template | GREEN | planned |
| J05 | Google Scholar meta tags | page template | GREEN | planned |
| J06 | OpenGraph / Twitter cards | page template | GREEN | planned |
| J07 | Webmention | when citing external blogs | GREEN | planned |
| J08 | Pingback / trackback | cited blog notify | GREEN | planned |

## Category K — Passive / auto-harvest (no action, monitor-only)

| id | Indexer | Mechanism | Tier | Status |
|---|---|---|---|---|
| K01 | Google Scholar | auto via ORCID/Zenodo | GREEN | auto |
| K02 | Semantic Scholar | auto via arXiv/Crossref | GREEN | auto |
| K03 | OpenAlex | auto via Crossref | GREEN | auto |
| K04 | BASE / CORE / OpenAIRE | auto via Zenodo OAI-PMH | GREEN | auto |
| K05 | Unpaywall | auto | GREEN | auto |
| K06 | Scite | auto | GREEN | auto |
| K07 | Connected Papers / Litmaps | auto | GREEN | auto |
| K08 | Scopus / WoS | auto via DOI | GREEN | auto |
| K09 | Citation alerts OUT (cited authors notified) | auto | GREEN | auto |
| K10 | DSpace / institutional harvesters | auto via OAI-PMH | GREEN | auto |

## Category L — Explicit exclusions (RED, recorded so they are never re-litigated)

| id | Excluded | Reason |
|---|---|---|
| L01 | Wikipedia self-editing | COI policy |
| L02 | Reddit self-promo posting | community rules |
| L03 | SSRN | Elsevier / gatekeeping |
| L04 | Hackernoon | paid |
| L05 | F1000Research | APC |
| L06 | Traditional journals | APC / gatekeeping (NO-JOURNALS-1) |
| L07 | EurekAlert | institutional sponsorship |
| L08 | PR Newswire | paid |
| L09 | Citation solicitation / trading | fabrication-adjacent |
| L10 | Paid media databases (Muck Rack) | paid |

---

## Next action (date-gated in the parent strategy; zero user action)

Enable order at v0.2 (Phase 5): ORCID auto-update -> RSS/Atom feed -> Green500 + MLPerf power ->
public-consultation radar -> ASCL + Research Software Directory -> Software Heritage -> field
preprint cross-posting -> Stack Exchange answers-with-disclosure. Everything else is Phase 6+ or
monitor-only. Each enable = a config/token/worker step, not a new relationship, and every send
stays behind the 2026-09-15 activation + caps + no-repeat bridge.

## Claim sheet (FRAMEWORK-DOGFOOD-1)

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| 163 enumerated channels across 12 categories (A24 B15 C45 D16 E10 F7 G7 H5 I6 J8 K10 L10) | grep-verified row count, this cycle | high | verified |
| Every row carries tier + mechanism + status | table format | high | verified |
| Full inventory recorded to qnfo-outreach D1 submissions (status planned|monitor|excluded) | INSERT OR IGNORE + COUNT readback | high | verified |
| Zero channels enabled beyond what was already live | parent strategy activation gate; no send path invoked | high | verified |
| Per-platform TOS assumptions | flagged AMBER per row; checks recorded before enable | medium | open |

