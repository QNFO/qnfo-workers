---
title: "QNFO Funding Strategy — Verified Funder Landscape & Shortlist"
author: "Quni-Gudzinas, Rowan Brad"
date: "2026-08-13"
license: "cc-by-nc-sa-4.0"
doi: "10.5281/zenodo.XXXXXXX"
status: "published"
---

## Abstract

This paper presents a verified funder landscape and fit-score shortlist for sustaining QNFO, a two-year-old, solo-run, AI-assisted research platform that has produced an open corpus of approximately 1,000 method papers across seven program areas. Every funder fact was verified by live HTTP retrieval on 2026-08-13 across twenty-six pages spanning Web3 and IPFS ecosystem grantors, open-science philanthropy, and decentralized-science programs; anything not verified live is explicitly flagged. The analysis scores eleven funders on eligibility for an unaffiliated individual, topical fit with decentralized and epistemics-oriented research, and application friction, yielding a weighted ranking led by NLnet NGI Zero (calls open September 3, 2026; deadline November 3, 2026, 12:00 CEST) and Emergent Ventures, followed by the Foresight Institute, Filecoin Foundation, the Ethereum Ecosystem Support Program, Gitcoin, and the Effective Altruism funds. A sequencing calendar spans August 2026 through 2027, including the Sovereign Tech Agency Fellowship cycle. The paper documents application-readiness gaps (legal entity, residency, tax position, public identity), per-funder pitch skeletons, and framing cautions, including the risk of presenting corpus volume as rigor. It closes with an agent-executable action plan.

## Keywords

funding strategy; decentralized science; AI-assisted research; open knowledge infrastructure; grant landscape; Web3
- **Date:** 2026-08-13
- **Source note:** `QNFO research note (2026-08-12), included in this deposit as source-note-2026-08-12.md` (funding manifesto)
- **Method:** All funder facts below were verified by live HTTP fetch on 2026-08-13 (26 pages, status + title + keyword extraction). Anything not verified live is flagged `[VERIFY]`.
- **Evidence records (verified live, HTTP 200):**
  - Zenodo 10.5281/zenodo.21901984 — "The Universal Ignorance Audit: A Fifteen-Question Method for Systematic Inquiry into the Structure of Not-Knowing"
  - Zenodo 10.5281/zenodo.21901983 — "Knowing What We Do Not Know: Ignorance Auditing, AI-Generation Detection, and the Epistemic Lessons of an AI-Assisted Research Pipeline"

---

## 1. The Ask (One Paragraph)

QNFO is a two-year-old, solo-run, AI-assisted research platform that has produced an open corpus of ~1,000 method papers, organized across seven program areas (ultrametric physics, laws of form, information physics, paradigm engineering, consilience, platform, demos), with a documented audit discipline (citation audits, post-publication adversarial review, ignorance auditing) and an existing decentralized deployment history (IPFS). Actual spend is \$400–600/month for the DeepChat AI stack alone (a Claude evaluation PoC cost \$400 in under a week), with an optimized Cloudflare AI-infrastructure target of \$100–200/month — an optimistic cost-cutting projection, not the current total. All costs are paid from personal savings, which is not sustainable long-term as research velocity increases. The ask: \$25k–\$60k/year-scale support to (a) sustain the platform at current velocity, (b) open-source and decentralize the knowledge infrastructure (IPFS/Filecoin mirroring, open protocols), and (c) productize the audit methodology (Universal Ignorance Audit, AI-generation detection) as public goods. Primary funder categories: fast micro-grants (Emergent Ventures), open-internet infrastructure funds (NLnet NGI Zero), AI-epistemics grants (Foresight), and decentralized-storage grants (Filecoin).

## 2. Applicant Assets (citable evidence)

| Asset | Evidence | Use in applications |
|---|---|---|
| Two audited, DOI-registered method papers | Zenodo 21901984 + 21901983 (verified 2026-08-13) | Lead evidence of rigor |
| Corpus scale | KG: 1,619 Paper nodes (QNFO knowledge graph); source note claims "nearly 1,000 LLM co-authored papers" — the KG count includes all paper-type nodes, hence the difference | Throughput evidence — use carefully (§8) |
| Open infrastructure | qnfo.org platform on Cloudflare (Workers/D1/R2/Vectorize); prior IPFS deployment (2026-07-18) | Concrete deliverable base for NLnet/Filecoin |
| Audit methodology | Universal Ignorance Audit (15 questions, 5 phases); citation-audit and paper-claim-audit procedures | Foresight (epistemics) pitch core |
| GitHub org | QNFO (QWAV strategy paper repo, tagged releases) | FOSS funders will check |
| Public reach | ~96-account social registry across 4 platforms (QNFO-aligned) | Broader-impact evidence |
| Budget discipline | Documented cost gates (\$90/30d Cloudflare AI-gateway spend limit; monthly automated cost audit; Cloudflare budget target \$100/mo, hard cap \$200/mo; DeepChat stack actual spend \$400–600/mo; Claude PoC spike \$400/week) | Trust signal for funders |

## 3. Application-Readiness Gaps (Phase-0 Ignorance Audit — what we do NOT know)

These are unknown or unverified facts that materially affect eligibility. They do not block Tier-1 applications but must be resolved before Tier-3:

1. **Legal entity** — no registered entity known. Individuals are eligible for EV/NLnet/Foresight/Filecoin; SFF prefers organizations; Templeton/Sloan effectively require one. *Action: consider fiscal sponsorship or a lightweight non-profit if US foundations are targeted.*
2. **Residency/citizenship** — unknown. Affects Sovereign Tech Fellowship (German employment contract) and tax treatment of grants.
3. **Tax position** — grants are taxable income in most jurisdictions; crypto-denominated grants (Filecoin FIL, Gitcoin crypto checkout) need accounting. *Action: flag to accountant before first payout.*
4. **Public identity** — some funders publish winners. Decide whether the QNFO founder name is public.
5. **Budget floor — RESOLVED (2026-08-13)** — actual spend is **\$400–600/month for the DeepChat AI stack alone**, with a **\$400-in-under-a-week Claude evaluation PoC** spike; the **\$100–200/month figure is an optimistic cost-cutting projection for optimized Cloudflare AI infrastructure only**, not the current total. Annual run-rate baseline: **~\$6–8k (DeepChat) + Cloudflare + PoC spikes** — applications must budget for the real run-rate, not the optimistic projection.
6. **Willingness to meet crypto-payment requirements** — Gitcoin GG24 requires multi-chain checkout for donations; Filecoin pays in FIL.

## 4. Verified Funder Landscape

### Tier 1 — Apply Now (rolling or near-term deadlines)

| Funder | Status (verified 2026-08-13) | Eligibility | Amount | Deadline | URL |
|---|---|---|---|---|---|
| **Emergent Ventures** (Mercatus) | ACTIVE — low-overhead, rolling | Individuals worldwide, age 13+ | Grants, `[VERIFY]` typical \$1k–\$100k+ | Rolling | mercatus.org/emergent-ventures |
| **NLnet / NGI Zero** | ACTIVE — "calls open **September 3, 2026**, deadline **November 3, 2026 12:00 CEST**" (verified on nlnet.nl/propose) | "Individuals and organisations of any type" | Micro-grants €5k–50k | Nov 3, 2026 (then every 2 months, odd months) | nlnet.nl/propose/ |
| **Foresight Institute** | ACTIVE — "Application deadlines at the end of each month" | Individuals/teams | Grants + prizes | Month-end, monthly | foresight.org/engage/grants/ |

### Tier 2 — Q4 2026 / Conditional

| Funder | Status (verified) | Eligibility | Amount | Deadline | URL |
|---|---|---|---|---|---|
| **Filecoin Foundation** | ACTIVE — "Builder Next Step Grants \$5k–\$10k" + larger grant tracks | Builders/teams; data-tooling + research | \$5k–10k (Next Step), larger via proposals | Rolling | fil.org/grants |
| **Gitcoin GG24** | ACTIVE — "Applications open • Donations open"; round monitor Oct 14–28 | Open-source public goods | QF matching (community-driven) | Apply now; donations Oct 14–28 | grants.gitcoin.co/ |
| **Ethereum Foundation ESP** | ACTIVE — \$44.4M across 677 projects in 2024 | Public-goods builders, Ethereum-aligned | Varies `[VERIFY]` | Rolling `[VERIFY]` (has "How to Apply" page) | esp.ethereum.foundation/ |
| **Survival and Flourishing Fund** | ACTIVE — "2026 Grant Round"; Rolling Application | Organizations preferred; referral culture | Varies (SFF moved ~\$152MM total) | 2026 round + rolling | survivalandflourishing.fund/ |
| **EA Funds (LTFF / Transformative AI Fund)** | ACTIVE — "early-stage grants to individuals, new organizations" | Individuals/orgs, longtermist framing | Small-to-mid | Rolling | funds.effectivealtruism.org/ |
| **Manifund** | ACTIVE — "Fast, transparent grants" | Individuals/orgs; regrantor model (examples \$20k min, \$60k scale-up, \$85k target) | \$1k–\$100k via regrantors | Rolling | manifund.org/ |

### Tier 3 — 2027 / Long-Shot

| Funder | Status (verified) | Why deferred |
|---|---|---|
| **Sovereign Tech Agency Fellowship** | ACTIVE — €64k–82k/yr, TVöD-Bund; **2026 window closed April 6, 2026** | Annual cycle; German employment; next window expected ~spring 2027 `[VERIFY]`. FOSS infrastructure + documentation fit is strong. |
| **Templeton Foundation** | ACTIVE — >\$60M in 2026, accepts applications | Mission language ("awe and wonder") matches QNFO's vision near-verbatim, but typically funds institutions. Long-shot without an entity. |
| **Sloan Foundation** | ACTIVE — has "Open Source in Science" program + Open Calls | Institutional. Position QNFO as open-source science infrastructure only if an entity exists. |

### Excluded / Closed / Unverified (verified 2026-08-13)

| Funder | Finding |
|---|---|
| **Optimism RPGF** | optimism.io/rpgf and /retro-funding → 404. Retro Funding status unverified; treat as inactive until reconfirmed. |
| **Web3 Foundation Grants** | grants.web3.foundation redirects to main site; legacy Grants Program appears closed (successor: Decentralized Futures/JAM programs). |
| **Lightspeed Grants** | "Applications are closed" (one-shot 2023 round). Defunct. |
| **ACX Grants** | Substack URLs 404; status unverified. |
| **Open Philanthropy → Coefficient Giving** | Reorganized; no open calls; does not take unsolicited proposals. |
| **Schmidt Sciences** | "We proactively seek out grant opportunities and do not accept unsolicited proposals." |
| **Molecule / VitaDAO** | DeSci but bio-only (longevity, biotech IP). Not applicable to QNFO domains. |
| **DeSci Labs** | Tooling company, not a grantmaker. |
| **ResearchHub** | Community bounties only; no grant track for this use case. |
| **Cosmos Institute** | Initial sweep failed with a TLS error; independent live re-fetch (2026-08-13) returned HTTPS 200 — program status UNVERIFIED, check before relying. |
| **Interact (interact.org)** | Parked domain. |

**Additional candidates (DESIGN notes, not verified live):** Arweave (storage-network grants, Filecoin-adjacent); Polkadot Decentralized Futures (successor to the closed W3F Grants Program); AI Objectives Institute (AI-governance + epistemics); Gitcoin alternates (clr.fund, Giveth, Radicle Drips). All are secondary — the verified shortlist above covers the same niches with live-confirmed programs.

## 5. Fit-Score Matrix

Scores 1–5 (5 = best): E = Eligibility as an individual; F = Topical fit; Fr = Friction (rolling, simple, fast). Weighted total = E×2 + F×2 + Fr.

| Rank | Funder | E | F | Fr | Total | Ask target | When |
|---|---|---|---|---|---|---|---|
| 1 | NLnet NGI Zero | 5 | 5 | 4 | **24** | €20k–50k | Opens Sep 3; due Nov 3 |
| 2 | Emergent Ventures | 5 | 4 | 5 | **23** | \$20k–30k | Now (rolling) |
| 3 | Foresight Institute | 5 | 4 | 4 | **22** | \$10k–50k | Monthly |
| 4 | Filecoin Foundation | 4 | 4 | 3 | **19** | \$5k–10k first | Q4 2026 |
| 5 | Ethereum ESP | 4 | 3 | 3 | **17** | \$10k+ | Rolling |
| 6 | Gitcoin GG24 | 4 | 3 | 3 | **17** | Community QF | Apply by early Oct |
| 7 | EA Funds (LTFF) | 3 | 3 | 4 | **16** | \$10k–50k | Rolling |
| 8 | STA Fellowship | 3 | 4 | 2 | **16** | €64k–82k/yr | 2027 cycle |
| 9 | Templeton | 2 | 5 | 2 | **16** | \$100k+ | 2027, needs entity |
| 10 | SFF | 3 | 3 | 3 | **15** | Varies | 2026 round |
| 11 | Sloan | 2 | 4 | 2 | **14** | Varies | 2027, needs entity |

*Ranking note: weighted total orders the matrix; NLnet is #1 on fit, Emergent Ventures is #1 on time-to-decision (days-to-weeks vs. NLnet's ~3 months). Both are Tier-1 and independent — apply to both.*

## 6. Per-Funder Pitch Skeletons

**Emergent Ventures** — "A two-year, self-funded, zero-to-one attempt to industrialize scientific knowledge production: ~1,000 open, audited, AI-assisted papers, a live knowledge platform, and a published ignorance-audit methodology. The grant sustains one year of the human in the loop while the machine does more of the research — knowledge production as public infrastructure, not corporate product." *Ask: \$25k. One page. Fast decision.*

**NLnet NGI Zero** — "Open, decentralized, verifiable knowledge generation. Deliverable: (1) open-source the QNFO research pipeline (audit tools, ignorance-audit method, generation-detection), (2) IPFS-mirror the full corpus with content-addressed citations, (3) publish the protocol as libre-licensed content. Fits the NGI Commons theme: the public nature of knowledge." *Ask: €30k–50k. Submit after Sep 3.*

**Foresight Institute** — "Epistemics tooling for AI-assisted science: the Universal Ignorance Audit is a fifteen-question protocol for making not-knowing legible; QNFO's generation-detection work makes AI-assisted research auditable. Goal: apply the method across AI-for-science workflows and publish the benchmark." *Ask: \$20k–40k; check the current month's topic before applying.*

**Filecoin Foundation** — "A real dataset with a real persistence problem: ~1,000-paper corpus currently on centralized storage. Milestone: corpus + provenance manifest on IPFS/Filecoin with retrieval benchmarks; publishes a reference architecture for decentralized scholarly archives." *Ask: \$5k–10k Builder Next Step, then larger.*

**Gitcoin GG24** — public-good round listing of the open research pipeline ("decentralized science tooling") with matching pool + community donation drive via the existing 96-account social registry.

**EA Funds LTFF** — "Epistemic infrastructure for the long-term future: scalable detection of AI-generated claims and structured ignorance auditing, deployed as open tooling for researchers and evaluators." (Fits LTFF's epistemics-adjacent mandate; submit only if the longtermist framing is comfortable.)

**STA Fellowship (2027)** — full-time maintainer fellowship for the open knowledge infrastructure; strong fit for "community management and documentation" expansion noted in the 2026 call.

## 7. Sequencing Calendar

| Window | Action |
|---|---|
| Aug 2026 | Draft EV application + gather readiness-gap answers (entity, residency, budget floor) |
| Sep 3, 2026 | NLnet calls open → submit proposal early (deadlines are hard) |
| Sep–Oct 2026 | Foresight month-end application (if epistemics-aligned topic); Gitcoin GG24 listing |
| Nov 3, 2026 | NLnet deadline (12:00 CEST) |
| Q4 2026 | Filecoin Builder Next Step (after IPFS corpus milestone) |
| Q1–Q2 2027 | STA Fellowship window (watch sovereign.tech/programs/fellowship); Templeton/Sloan only if entity formed |

## 8. Risks & Framing Cautions

1. **The volume trap.** "Nearly 1,000 papers" reads as throughput to traditional funders — and throughput without external peer review can read as spam. Lead every application with the two audited Zenodo records and the audit methodology; present corpus volume only as evidence of an operational pipeline, never as the headline claim.
2. **Professionalize all copy.** The source note's typos ("HIMAN-IN-THE-LOOP", "MONITIZE", "WOINDERMENT") must never appear in applications. All proposal text will be freshly drafted.
3. **Centralization honesty.** QNFO currently runs on Cloudflare. Pitch decentralization (IPFS mirroring, open protocols) as the *funded work*, not as the *current state* — NLnet specifically checks that deliverables are libre-licensed.
4. **Crypto payments.** FIL-denominated grants and Gitcoin's crypto checkout have tax/accounting implications; resolve readiness gap #3 first.
5. **Doxxing.** Foresight, Gitcoin, and Filecoin publish funded projects publicly.
6. **The "sell a vision" phrase** from the source note must translate into concrete deliverables per funder — funders buy milestones, not manifestos.

## 9. Next Actions (agent-executed, per user standing preference for autonomous outreach)

1. Draft the **Emergent Ventures** one-page application (highest speed-to-money).
2. Prepare the **NLnet proposal** skeleton now so it is submission-ready on Sep 3 (deadline Nov 3, 12:00 CEST — hard).
3. Get readiness-gap answers (one short questionnaire: entity, residency, budget floor, crypto-wallet willingness, public-name preference).
4. Maintain this strategy as a living document; track funder-program changes in the QNFO knowledge graph.
