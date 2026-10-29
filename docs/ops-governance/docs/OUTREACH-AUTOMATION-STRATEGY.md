# QNFO/QWAV Automated Outreach & Dissemination Strategy

> Version 1.1 (2026-09-03) - Owner: QNFO - Status: ACTIVE (execution layer; verified + extended by engagement-strategy session)
>
> Claim: a fully cloud-native, zero-user-action outreach and open-submission pipeline (topic-affinity
> email programs, async informational interviews, journalist/blogger pitches, open-venue and
> software-dataset submissions, grant EOIs, inbound reply automation, honest funnel measurement)
> converts the corpus visibility program into reachable, reply-capable human channels without paid
> venues and without gatekeeping.
>
> Evidence: fleet baseline read 2026-09-03 - qnfo-cloud-ops outreach job (11:00 UTC Mon-Fri,
> cloud/scheduler/worker.js L163), outreach_queue + outreach_log tables in qnfo-audit D1, qnfo-email
> /send path (email-composer v2.32 discipline), empty qnfo-outreach worker + qnfo-outreach D1 scaffolds
> (2026-09-01), funding/ grant artifacts in qnfo-workers repo. Confidence: high on design; medium on
> per-venue API assumptions (flagged per channel). Status: schema applied and worker v0.1.0 deployed (full campaign pipeline, verified live 2026-09-03),
> canonical repo dir created, cron corrected, scorecard loop closed; Phase 3 activation date-gated in code.
>
> Companion of: docs/VISIBILITY-VERSIONING-PROGRAM.md (the analytics marketing plan; this document is
> its outreach/submission execution layer). Amends its P1-P8 pipeline with programs P-A..P-F.
> Gaps closed: FLEET-MANIFEST "qnfo-outreach GAP (no repo dir)".

---

## 1. Purpose and alignment

VISIBILITY-VERSIONING-PROGRAM v1.0 defines the supply side: continuous meaningful new versions,
audience-segmented amplification, honest measurement. This document defines the REACH side: how each
delta and each program reaches real people, gets commented on, and produces replies and submissions,
100% automatically. Alignment rules:

- No new skills (NO-MORE-SKILLS-1); no local crons (CLOUD-FRONTEND-ONLY-1); everything recurring runs
  in the Cloudflare scheduled layer.
- Outreach is fully autonomous (OUTREACH-REVIEW-1 + user mandate 2026-08-07: never wait to be told to
  initiate). Notification after a send is a receipt, not a request.
- Open research/open science only: no APCs, no traditional journal submission (NO-JOURNALS-1), no
  gatekeeping venues, CC BY assets, Zenodo canonical with versioned DOIs.
- Honest measurement only (IMPRESSIONS-ZONE-NOT-WORKER-1, EXPERIMENT-PROGRAM-1): no fabricated
  traffic, aggregate-over-N for A/B, same-window comparisons.
- No personal-inbox clutter: all digests go to alerts@qnfo.org (DIGEST-TO-PERSONAL-1).

## 2. Standing discipline (inherited, binding)

- TEST-SEND-EXTERNAL-1: test sends only to own mailboxes (alerts@qnfo.org, rwnquni@outlook.com,
  rowan.quni@outlook.com, qnfo.org addresses). One canonical self-test, then stop.
- CAP-CLOCK-AUTHORITY-1: daily caps account on the worker UTC calendar day (D1 timestamps).
- EMAIL-SUBJECT-SPAM-TOKENS-1: no TEST / SEND TEST / WRANGLER / MATRIX / VERIFY / verification-code subjects.
- EMAIL-SIGNATURE-PLAIN-1: signature = full name + one org word: "Rowan Brad Quni-Gudzinas, QNFO".
- DEFAULT-SENDER-DRIFT-1: academic outreach sends from rowan.quni@qnfo.org; default qnfo@qnfo.org.
- No-repeat-contact: one genuine email per contact per program; no follow-up unless they reply
  (threading-by-subject for repairs; Repair-Send Protocol in email-composer skill).
- EMAIL-WORKER-SEND-BODY-FIELD-1: worker /send uses body; direct CF REST uses text/html.
- PERSONA-STRIP-1 / ANTI-TELEGRAPH-1 / PUBLICATION-BRAND-LANGUAGE-1: no persona garbage, no AI tells,
  no internal gate names in external prose.

## 3. Audience map and resonant hooks

| Audience | Cares about | Hook that resonates | Channel | Program |
|---|---|---|---|---|
| Academics | rigor, falsifiability, bridges | verified reproductions, versioned DOIs, cross-domain translations (CROSSWALK-TRANSLATION-1) | RFC email, async interview, citation replies | P-A, P-E |
| Practitioners | applied takeaways, working code, decision tools | demo kit (qwav-demo-kit DEM-E0), benchmark numbers, PyPI/HuggingFace/Docker artifacts | GitHub, LinkedIn (Buffer), RFC email, package registries | P-A, P-C2 |
| Students | plain language, worked examples | explainers attached to real papers, tutorials | social threads, web explainers, student companions in v-nexts | existing (VISIBILITY program) |
| Industry / standards bodies | procurement arguments, comparability | system-level metric proposal, benchmark revision RFC (SPEC/MLCommons/Green500 adjacency) | RFC email, EOI email | P-A, P-D |
| Journalists / bloggers | story, data, quotable results | "the real energy cost of computation" + press kit with numbers, demo, dispute | pitch email + press-kit Zenodo record | P-B |
| Funders / program officers | open, reproducible, measurable outcomes | grants radar match + EOI email with DOI evidence | grant EOI email, portal where API allowed | P-D |
| Conference organizers | program fit, practitioner draw | abstract/talk EOI via Indico/pretalx APIs where CFP is open | EOI email / API submission | P-D |
| Open-science infrastructure | content, metadata, reviews | Zenodo/OSF deposits, PREreview/PRC reviews, awesome-list PRs | API submissions | P-C |

Each hook must survive the relevance gate: "why a reader should care" (SO-WHAT-GATE-1) plus
premise-depth disclosure, phrased for the target audience, never credential talk.

## 4. Program inventory (the execution layer)

### P-A. Topic-affinity RFC + async informational interview program

Mechanism: one email per contact. RFC framing (the work, one open question, no obligation), reply
handling fully automated. Replies are DATA: they feed version B/C deltas and the benchmark revision,
and are stored in rfc_responses.

- Sources: GitHub public profiles (owner email on topic-matched repos: energy-efficiency, hpc,
  quantum-control, green-software), qnfo-cloud-ops outreach_queue (research-scan GTD extraction,
  existing), events-radar speakers, citation-watch citers (P-E).
- Cadence: daily draft + send pass at 11:00 UTC Mon-Fri (cron), caps below.
- Interview question bank (practitioner/industry):
  1. How does your organization measure energy efficiency of computation in practice today?
  2. What prevents you from sharing energy-consumption data for one real workload?
  3. If a system-level joules-per-compute benchmark existed with verifiable reproduction, which
     decision would it change (procurement, design, SLAs)?
  4. Which existing metric or tool would it replace, and what does that tool miss?
  5. What is the smallest change that would make energy accounting routine in your CI or release flow?
- Interview question bank (academic):
  1. Where is the largest unaccounted energy term in your latest results?
  2. Which energy-scaling claims in the literature do you consider unreproduced, and what would it
     take to reproduce them?
  3. Does your method's energy behavior change at the wall-clock-latency boundary (time vs energy)?
  4. Which cross-domain result would surprise you if verified?
  5. What open problem in this area deserves a benchmark before another theory paper?
- RFC topics seeded in D1 (rfc_topics): PaQit system-level metric; JPCUB 2026 benchmark revision;
  QEC energy floor (Landauer-machine view); locale framework applied to quantum computing.
- RFC intake: POST /rfc/:slug/comment on qnfo-outreach (also emailable: replies to rowan.quni@qnfo.org
  are triaged by the existing inbound pipeline).

### P-B. Journalist / blogger pitch program

- Story: the real energy cost of computation - an open dataset, a reproducible benchmark, and
  verified cross-domain results (QEC as a Landauer machine; locale framework). No adjectives, data.
- Press kit: PRESS-KIT.md committed in qnfo-ops + deposited to Zenodo (versioned DOI) via the existing
  publish gates; pitches link the DOI. Numbers-only fact sheet + quotable one-liners + demo pointer.
- Contact sourcing (v0.2 miner): Bluesky search API (app.bsky) and Mastodon public search for
  energy/climate/HPC/quantum beat accounts; RSS feeds of sci-tech blogs (Substack et al); GNews /
  NewsAPI free tiers for byline discovery; event press lists from events-radar.
- Pitch email: hook + 1 question ("what would make this quotable for your readers: a number, a demo,
  a dispute?"). Cap 2/day. Replies route: any reply is human-required (interview/media) -> routed to
  user via the existing human-routing rule.

### P-C. Open submissions program (no gatekeeping, no APCs)

| Venue | Kind | Automation | Status / gate |
|---|---|---|---|
| Zenodo | deposits + versioned records | existing publish pipeline | LIVE (canonical venue) |
| Zenodo communities | membership + record attach | API: GET /api/communities search; join request email where API lacks endpoint | v0.2; candidate list curated |
| OSF | preprints of new versions + comments on frozen registrations | OSF API; credentials stored per OSF-CREDENTIAL-REDUNDANCY-1; comments precedent 2026-08-28 | automatable now |
| PREreview | open preprint review | REST API v2; requires account | TOS check before enable |
| PRC (Peer Community In) | open peer review via recommenders | email-based submission | TOS check; email automatable |
| Qeios | open post-publication review | free for reviews | TOS check |
| GitHub awesome-lists | PR adding QNFO entries | GitHub API pull-request create | automatable; needs GH token secret |
| Wikidata | items for papers + concepts | API (wbeditentity); bot policy approval required | register bot; then automate |
| Software Heritage | archival of repos | save-code-now API (POST /api/1/origin/save) | automatable now |
| OpenAIRE / BASE / CORE | harvest indexes of Zenodo | automatic (Zenodo upstream); verify indexed via search APIs | monitor-only |
| arXiv | preprint submission | API; category endorsement required | conditional: verify endorsement status; honest note |
| IndexNow | search freshness ping | existing (qnfo-indexnow-key) | LIVE |
| ResearchHub / Sciety | community surfaces | monitor-only initially | TOS check |
| Reddit / Stack Exchange | Q&A communities | monitor-only (self-promotion rules) | excluded from posting |
| Wikipedia | encyclopedic coverage | EXCLUDED: COI policy forbids self-editing | documented exclusion |

### P-C2. Software and dataset distribution (API-automatable, reaches practitioners)

- PyPI: qwav-demo-kit + benchmark toolkit as a package; publish via twine in a Worker step (API).
- HuggingFace datasets: energy-benchmark dataset card + data via HF API upload.
- OpenML: dataset upload via OpenML API (fits ML-energy audience).
- Docker: GHCR image of the demo kit; publish via GHCR API on release.
- GitHub: topic tags + releases (existing); awesome-list PRs (above).
Each distribution event = one factual social post (existing qnfo-social/Buffer) + IndexNow ping.

### P-D. Grant / EOI program (open calls only)

- Existing artifacts: qnfo-workers/funding/ (NLNET_PROPOSAL.md, APPLICATIONS.md, DOSSIER.md).
- Funding radar: weekly cron mines grants.gov Search Opportunities API (free key, stored as secret),
  Euraxess RSS, and funding emails already in the inbound pipeline; keyword match (energy efficiency,
  quantum computing, HPC, open science).
- Output: submissions rows (kind=grant_eoi) with drafted EOI emails to program officers; auto-send on
  the same capped cadence. Portal form submission only where the portal TOS permits automation
  (most do not - EOI by email is the honest path; flagged per opportunity).

### P-E. Citation & engagement program

- citation-watch fires -> new citation: automated thank-you + related-work note to the citing author
  (one send, no follow-up). Existing citations of a paper trigger type-C version deltas
  (VISIBILITY program P5).
- v-next release -> topic-affinity contacts who previously engaged get a one-line "v2 adds X" note
  (VISIBILITY program section 3.3 point 5). Implemented as campaign kind=version_note.
- errata replies: existing errata pipeline (watch/respond/publish) unchanged.

### P-F. Inbound reply automation (send/receive closed loop)

- Inbound email to qnfo.org: existing triage (email-composer skill) classifies.
- Answers to RFC/interview questions: parsed, stored in rfc_responses, auto-thank-you sent, contact
  marked replied; outreach_log status flipped (existing cloud-ops code).
- Questions about the research: auto-answered with RAG over the corpus (qnfo-ai + living-paper).
- Meetings, events, collaboration proposals, decisions: routed to the user (the ONLY human-required
  class, per standing mandate). Everything else is replied to and sent on the user's behalf.
- Opt-outs: suppression list updated; never contacted again.

## 4b. "What else" - additional 100% automated send/receive surfaces

1. RFC portal: public RFC topics on papers.qnfo.org with a comment endpoint (POST /rfc/:slug/comment
   -> D1), linked from social threads; comments become version deltas.
2. Newsletter submissions: open-science digests (e.g., community newsletters) accept contributed
   items by email - one email per item per issue, automated from new-version events.
3. Podcast/radio pitch emails: same P-B pipeline, template variant.
4. Conference EOIs: Indico API (abstract submission where CFP open) and pretalx API; events-radar
   already finds the events; submission automated where the API allows, EOI email otherwise.
5. Dataset/benchmark challenges: submit the benchmark as a task on open platforms (e.g., PapersWithCode
   dataset registration via API) - medium confidence, TOS check per platform.
6. ORCID profile: update via ORCID API with new DOIs on publish (token stored with OSF creds pattern).
7. Monthly opt-in newsletter: subscribe endpoint on the website -> D1 -> monthly digest cron (only to
   subscribers; unsubscribe honored; digests never to personal inboxes).
8. Software/SWH archival + citation file updates (CITATION.cff) on each release.
9. Google Scholar: monitor-only (profile discovery happens via ORCID + Zenodo indexing; no API for
   self-deposit - the ORCID auto-update in item 6 is the lever).
10. Conference talk/paper submissions: EasyChair has no public submission API - prepare the package
   and submit by email EOI where the CFP allows; Indico/pretalx API paths stay the automatable
   route (item 4).
11. Owned-media blog/news channel on papers.qnfo.org (rendered from D1 like the paper pages):
   weekly technical posts reusing paper deltas; owner = qnfo-gateway next revision, trigger =
   funnel gate (>=50 honest /papers/* req/day).
12. Awards / open-science prizes radar: folded into the funding radar cron (same grants.gov + RSS
   sources, keyword match on 'prize/award') - outputs submissions rows kind=award_eoi.
13. Explicit exclusion: never solicit citations or reciprocal promotion in any outreach (citation
   trading is fabrication-adjacent); citations come only from merit + discoverability.

## 5. Automation architecture

### 5.1 Data plane: qnfo-outreach D1 (applied 2026-09-03)

Tables (schema.sql in QNFO/qnfo-workers/qnfo-outreach/):

- contacts (id, email UNIQUE, name, org, role, audience, tags, source, source_ref, first_seen,
  last_contacted, contact_count, suppress, suppress_reason, status: new/verified/contacted/replied/
  bounced/opted_out)
- campaigns (id, name, audience, template_key, subject_template, body_template, channel, status,
  starts_at, daily_cap, total_cap, followup_days, notes)
- sends (id, campaign_id, contact_id, kind, channel, subject, body, status: draft/queued/sent/
  replied/bounced/failed/suppressed, message_id, sent_at, reply_to_id, created_at)
- replies (id, send_id, contact_id, from_addr, subject, body, classified_as, routed_to_user,
  auto_replied, received_at)
- rfc_topics (id, slug UNIQUE, title, question, status, created_at)
- rfc_responses (id, rfc_topic, contact_id, from_email, question, answer, received_at)
- submissions (id, kind, target, payload_ref, status, submitted_at, evidence, created_at)
- funnel_daily (day PK, mined, drafted, sent, replied, bounced, opted_out, submissions)
- pipeline_state (key PK, value, updated_at) - kill switch row: external_sends_enabled

Seeded this cycle: pipeline_state external_sends_enabled=1 (flip to 0 to halt remotely), 4 RFC
topics, 3 campaigns (RFC-practitioner, interview-academic, pitch-journalist) with date-gated
starts_at. No seeded contacts - contacts are mined or imported, never fabricated.

Legacy schema (pre-existing, from the 2026-09-01 scaffold session) shares this DB and remains the
operational history of the current pipeline: outreach_candidates (0 rows), outreach_campaigns (8
rows, real sends incl. a misaddress correction), outreach_sends (6 rows), sent_log (8),
cadence_runs (26). The new tables are additive - nothing was dropped. The worker's no-repeat gate
reads BOTH the new sends table AND legacy outreach_campaigns.recipient_email (status
sent/followed_up), so the two pipeline generations can never double-contact.

### 5.2 Compute plane: qnfo-outreach worker (v0.1.0, deployed 2026-09-03 - verified live, canonical repo synced)

Canonical repo dir: QNFO/qnfo-workers/qnfo-outreach (worker.js + wrangler.toml + schema.sql + README).
Self-doc header + VERSION via /health (FLEET-SELF-DOC-1).

- cron: 0 11 * * 1-5 (UTC), full pipeline (mine + draft + gated send). The legacy slot 0 9 * * * is
  tolerated (mine+draft only, never sends). The cloud-ops outreach job (0 9 * * 1-5 UTC) owns the
  legacy outreach_queue ('pending' rows, cap 3/day) - qnfo-outreach v0.1.0 does NOT touch that queue,
  eliminating the two-writer risk of the v0.1.0 scaffold (which drained status='queued' with no
  no-repeat check).
- pipeline run (scheduled): mine -> draft -> send(gated) -> funnel.
  - mine v0.1 (LIVE, verified 2026-09-03): GitHub search API (topic queries rotated daily, 3
    repos/run, polite rate, GH_TOKEN optional), owner public email -> contacts (role=practitioner,
    tags from repo topics). First live run: +1 contact (FritscheLab/slurm-playbook).
  - mine v0.2 (spec'd): Bluesky/Mastodon/RSS journalist sources, ORCID public emails, events-radar
    speaker lists.
  - draft: active campaigns with starts_at <= now; matching unsuppressed contacts without a prior
    send of that kind; up to daily_cap drafts.
  - send (gated): external sends require BOTH (a) Date >= ACTIVATION_AT (2026-09-15T00:00:00Z) and
    (b) pipeline_state external_sends_enabled=1. Caps: global 8/day, per-campaign daily_cap (2-5),
    per-domain 3/day, per-campaign total_cap. Suppression + no-repeat + SPAM-token blacklist enforced
    in the send path.
  - warm-up: 2026-09-08 .. 2026-09-15 the worker sends ONE self-check/day to alerts@qnfo.org
    (own-mailbox allowlist only) to verify the send path continuously.
- endpoints: /health (version+state+policy), /api/contacts|campaigns|sends|submissions|rfc_responses
  (auth-gated when OUTREACH_TOKEN set), /rfc/:slug/comment (public, min 20-char answer, open topics
  only), /run (GET = preview mine+draft only, no sends), /run?commit=1 (auth-gated full pipeline).
- bindings: OUTREACH_D1 (d1 qnfo-outreach), QNFO_AUDIT (d1 qnfo-audit, read-only no-repeat bridge),
  LIVING_PAPER (d1 living-paper), SEND_EMAIL (send_email; from rowan.quni@qnfo.org). All verified
  true via /health 2026-09-03.
- sends via EmailMessage/cloudflare:email; failures -> sends.status=failed, counted, never retried
  without review.

### 5.3 Reuse map (existing fleet, no duplication)

| Existing | Role in this strategy |
|---|---|
| qnfo-cloud-ops outreach job (0 9 * * 1-5 UTC) | continues as the sole drain of the legacy outreach_queue ('pending', cap 3/day); qnfo-outreach never touches it |
| qnfo-outreach no-repeat bridge | before ANY external send: skip if email present in (a) new sends table, (b) legacy outreach_campaigns (recipient_email, status sent/followed_up, same DB), or (c) qnfo-audit outreach_log (status sent/followup/replied); mark suppressed on hit (cross-system + cross-generation no-repeat-contact) |
| qnfo-email worker | inbound capture + triage + replies; bounces arrive via cf-bounce and update outreach_log |
| qnfo-email-orchestrator | template/dispatch helpers if needed in v0.2 |
| qnfo-social + Buffer | every send-worthy event also yields one factual social post (existing cadence) |
| research-daily-brief | adds "outreach this week" section (sends/replies/submissions) - P2-style extension |
| citation-watch / events-radar / errata pipeline | triggers for P-E, P-A, conference EOIs |
| qnfo-cloud-ops jobVisibility (P7 scorecard) | LIVE v1.11.0 (2026-09-03): reads funnel_daily 7d aggregates + accepted submissions via the OUTREACH d1 binding; weekly digest carries an outreach section |

### 5.4 Secrets and env

- EMAIL_API_KEY: existing pattern (qnfo-email); not needed (SEND_EMAIL binding).
- OUTREACH_TOKEN (SET 2026-09-03): gates /run?commit=1 and /api/* - worker secret + ~/.env mirror
  (OSF-CREDENTIAL-REDUNDANCY-1 pattern).
- GH_TOKEN (optional): raises GitHub API rate limits for awesome-list PRs (v0.2).
- GRANTS_API_KEY (grants.gov, free): funding radar (v0.2).
- ORCID token: ORCID profile updates (v0.2).
- DIGEST_TO stays alerts@qnfo.org everywhere; the worker itself sends NO digests to personal inboxes.

## 6. Messaging library (templates; all gates applied)

Subjects are human-like, token-free. Bodies are plain text, one ask, no internal gate names, no
persona, no telegraphing. Signature: "Rowan Brad Quni-Gudzinas, QNFO". Unsubscribe line present.

### 6.1 RFC - practitioner (kind=rfc, audience=practitioner)

Subject: "Energy per compute: a question from an open benchmark effort"
Body: "Hi {{name}} - I work on PaQit and the joules-per-compute benchmark at QNFO/QWAV, an open
(CC BY, Zenodo) effort to make system-level energy efficiency measurable. Your public work on
{{topic}} suggests you face this directly. Three questions, no obligation:
1. How does your organization measure energy per unit of compute today?
2. What blocks you from sharing energy data for one real workload?
3. Would a reproducible system-level benchmark change any procurement or design decision?
Replies feed the benchmark's next revision (credited or anonymous, your choice). If this is not your
area, no reply needed and no follow-up will come.
Rowan Brad Quni-Gudzinas, QNFO
(no further emails from me unless you reply; reply to opt out of any future contact)"

### 6.2 Async interview - academic (kind=interview)

Subject: "Three questions on energy accounting in quantum computing research"
Body: "Hi {{name}} - the QNFO/QWAV open research group runs a public benchmark of computational
energy cost (Zenodo DOIs, reproduction scripts). Your {{topic}} work is adjacent. As an asynchronous
informational interview:
1. Where is the largest unaccounted energy term in your latest results?
2. Which energy-scaling claims in the literature do you consider unreproduced?
3. What open problem deserves a benchmark before another theory paper?
Any reply helps. I will not send a follow-up unless you answer.
Rowan Brad Quni-Gudzinas, QNFO"

### 6.3 Journalist pitch (kind=pitch)

Subject: "Computing's energy cost: an open dataset and a reproducible benchmark"
Body: "Hi {{name}} - a pitch with data, not adjectives. QNFO/QWAV publishes open, computationally
verified work on the energy cost of computation: a system-level joules-per-compute benchmark, and
quantum error correction analyzed as a Landauer machine. Every claim ships with reproduction scripts
and Zenodo DOIs. A press kit (key numbers, quotable results, demo pointer) is available on request.
One question: what would make this quotable for your readers - a number, a demo, a dispute?
Rowan Brad Quni-Gudzinas, QNFO"

### 6.4 Grant EOI (kind=grant_eoi)

Subject: "Expression of interest: open benchmark for computational energy efficiency ({{topic}})"
Body: "Hello - QNFO/QWAV (open research group, Zenodo-verified corpus) proposes to contribute an
open, reproducible benchmark of system-level computational energy efficiency to {{topic}}. Existing
evidence: versioned DOIs, reproduction scripts, a demo kit. We would like to submit a full
expression of interest if the call fits. Which format does the program office prefer?
Rowan Brad Quni-Gudzinas, QNFO"

### 6.5 Citation thank-you (kind=citation_thanks)

Subject: "Thanks for the citation - related open work you may find useful"
Body: "Hi {{name}} - thank you for citing {{paper_title}}. You may also find useful {{related}}.
Both are open (CC BY, Zenodo DOIs). No reply expected.
Rowan Brad Quni-Gudzinas, QNFO"

### 6.6 Version note to prior engagers (kind=version_note)

Subject: "{{paper_title}} - new version adds {{delta_one_line}}"
Body: "Hi {{name}} - you previously engaged with {{paper_title}}. The new version (DOI {{doi}})
adds {{delta_one_line}}. One line of context, no action needed.
Rowan Brad Quni-Gudzinas, QNFO"

### 6.7 Opt-out acknowledgment (auto-reply)

Subject: "Re: {{original_subject}}"
Body: "Done - removed from all QNFO/QWAV contact lists. No further emails.
Rowan Brad Quni-Gudzinas, QNFO"

## 7. Deliverability and safety

- Caps (enforced in worker code on UTC day): global 8/day; per-campaign 2-5/day (template default 5);
  per-domain 3/day; per-campaign total_cap 20-40; one email per contact per program.
- Warm-up ladder: 2026-09-08..09-15 self-checks to own mailboxes only (1/day); external sends begin
  2026-09-15 at campaign caps - no bursts (young-domain reputation rule).
- Bounce handling: cf-bounce returns update outreach_log; sends.status=bounced once bridged; a
  bounced address is never re-tried. Hard bounces >2 in a day halve the next day's caps (auto).
- Suppression: contacts.suppress + pipeline_state kill switch; opt-out replies update both.
- No-repeat-contact across systems: AUDIT_D1 outreach_log bridge (5.3) + sends NOT EXISTS check.
- Subject hygiene: SPAM-token blacklist checked before every send; subjects are statements, not
  announcements.
- Sender identity: rowan.quni@qnfo.org (academic), qnfo@qnfo.org (general); SPF/DKIM/DMARC posture
  already hardened on all QNFO domains (email-composer skill; keep).
- Repair path: threading-by-subject clarification only (Repair-Send Protocol), never a full re-send.
- Personal-inbox rule: the pipeline never sends digests to personal inboxes; the only user-visible
  output is the human-required reply routing (P-F).

## 8. Measurement and experiments

- funnel_daily rows aggregate mined/drafted/sent/replied/bounced/opted_out/submissions per UTC day.
- Weekly: qnfo-cloud-ops jobVisibility (P7 scorecard, live) extends to read funnel_daily +
  submissions and reports an outreach section: sends, replies, reply rate, submissions accepted,
  contacts mined. Honest metrics only - no opens/clicks claims (we do not track pixels), no
  worker_invocations cited as external traffic.
- Experiment EXP-2026-004 (registered in qnfo-audit experiments this cycle; EXP-2026-001..003 are
  the parallel marketing-thread experiments: version-freshness bump, social framing, posting time),
  per EXPERIMENTATION-PROGRAM v1.0 rules, honest-only, aggregate-over-N, same-window: subject-line
  variants A/B across RFC sends, first 40 sends (2026-09-15 .. 2026-10-15), success metric = reply
  rate; never per-paper page-view A/B (baseline traffic is too small to reach significance).
- 90-day targets (directional, re-baselined after 2 weeks of scorecard data): reply rate >=5% on
  RFC/interview sends; >=1 media mention (honest); >=3 accepted open submissions; >=2 grant EOIs
  delivered; no bounce rate above 5%; zero test emails to external addresses.

## 9. Rollout (date-gated in code, zero user action)

| Phase | Date (UTC) | What fires automatically |
|---|---|---|
| 0 | 2026-09-03 | schema applied (verified: 16 tables, kill switch=1, 3 campaigns, 4 RFC topics); worker v0.1.0 deployed (full campaign pipeline); canonical repo dir QNFO/qnfo-workers/qnfo-outreach created (worker.js + schema.sql + wrangler.toml + metadata.json + README + deployed-current.worker.js); OUTREACH_TOKEN set (worker secret + ~/.env mirror); cron corrected to 0 11 * * 1-5; live /run preview mined +1 contact (FritscheLab/slurm-playbook) |
| 1 | 2026-09-03 (cron) | daily 11:00 UTC: miner populates contacts; campaigns draft sends (draft only until activation) |
| 2 | 2026-09-08 | warm-up window: 1 self-check/day to own mailboxes |
| 3 | 2026-09-15 | ACTIVATION_AT: external sends enabled (gated by kill switch + caps + no-repeat) |
| 4 | 2026-09-22 | journalist pitch campaign starts_at; submissions program (OSF, Zenodo communities, SWH) first batch |
| 5 | 2026-10-01 | funding radar v0.2 cron (grants.gov) + P-C2 package/dataset publishes |

Every phase logs to funnel_daily; failures land in D1 and the fleet audit digest (alerts@qnfo.org),
never in a personal inbox. Rollback: set pipeline_state external_sends_enabled=0 via any D1 write
(e.g., d1_database_query) - the worker checks it every run. No user action is required for any
phase; the kill switch exists as an emergency brake, not as a required step.

## 10. Excluded and conditional channels (with rationale)

- Traditional journals / APCs: excluded (NO-JOURNALS-1).
- SSRN (Elsevier), Hackernoon (paid): excluded - gatekeeping/paid.
- Wikipedia: excluded - COI policy forbids self-editing; automation would violate it.
- Reddit / Stack Exchange: monitor-only; automated self-promotion violates community rules.
- arXiv: conditional on endorsement status (honest; do not self-assert).
- Grants portals with anti-automation TOS: EOI by email only, flagged per opportunity.
- Cold social DMs (Bluesky/Mastodon): monitor-only; email remains the opt-in channel.

## 11. Claim sheet (FRAMEWORK-DOGFOOD-1)

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| qnfo-outreach D1 schema applied (9 tables, seeds) | d1_database_query PRAGMA + SELECT counts, this cycle | high | verified |
| qnfo-outreach worker v0.1.0 deployed with cron + bindings | /health version=0.1.0, bindings OUTREACH_D1+QNFO_AUDIT+SEND_EMAIL (+LIVING_PAPER, OUTREACH_TOKEN), cron 0 11 * * 1-5 (2026-09-03) | high | verified |
| Send path binding + templates verified; first external send date-gated | SEND_EMAIL binding true via /health; v0.1.0 sends fire >= 2026-09-15 (ACTIVATION_AT) under kill switch + caps | high | verified-by-binding; live send pending activation |
| External sends are date-gated and capped | ACTIVATION_AT + kill switch + caps in worker.js (read-back), this cycle | high | verified |
| No-repeat-contact bridged across cloud-ops and worker | v0.1.0 send path checks sends + legacy outreach_campaigns + qnfo-audit.outreach_log before every send (code read 2026-09-03) | high | verified by code read; first live collision test at Phase 3 |
| Per-venue API assumptions (PREreview/PRC/Qeios/Indico/pretalx) | documented flags; TOS checks before enable | medium | open |
| Funnel feeds P7 scorecard | qnfo-cloud-ops v1.11.0 deployed 2026-09-03: jobVisibility outreach section reads funnel_daily + submissions via OUTREACH binding (/health outreach:true, 3/3 polls) | high | verified-live |
| Grants radar key + journalist miner v0.2 | spec'd with secrets table | medium | dated (Phase 5 / v0.2) |
