# NLnet NGI Zero Proposal — Open, Verifiable, Decentralized Knowledge Generation

**Status:** SUBMISSION-READY DRAFT (calls open Sep 3, 2026 · deadline Nov 3, 2026 12:00 CEST)
**Prepared:** 2026-08-13 · Applicant: Rowan Brad Quni-Gudzinas (individual) · ORCID 0009-0002-4317-5604
**Theme fit:** NGI0 Commons Fund — "Reclaim the public nature of the internet" / open information society
**Ask:** €20,000–50,000 · **License:** all deliverables libre/open (MIT/Apache-2 code; CC-BY-SA content)

---

## Summary (for the NLnet form)

**Project name:** QNFO Open Knowledge Infrastructure (QOKI)

**One sentence:** Open-source the QNFO AI-assisted research pipeline and mirror its ~1,000-paper open corpus to IPFS/Filecoin with content-addressed, verifiable citations, so that high-volume AI-assisted knowledge production becomes public infrastructure — auditable, libre-licensed, and not owned by any platform.

**Problem:** High-volume AI-assisted research is scaling faster than the trust and persistence infrastructure of the web. QNFO (a two-year, solo-run, open research platform) has produced a DOI-registered corpus of ~1,000 method papers across seven program areas with a published audit discipline — yet the pipeline that produces them is closed-source and the corpus lives on centralized infrastructure. When knowledge production is AI-assisted at scale, openness of the *method* (audit tools, generation-detection, ignorance auditing) and *content addressing* of the corpus (CID-per-paper, verifiable citations) are what make the output trustworthy public goods rather than platform-dependent artifacts.

**Why NLnet/NGI Zero:** The deliverables are exactly the NGI Commons mandate — libre-licensed software and content that reclaim the public nature of knowledge. Individuals and organisations of any type are eligible (verified 2026-08-13 on nlnet.nl/NGI0/: "individuals and organisations of any type… rolling open calls with a deadline every two months"); the request fits the €5k–50k micro-grant band.

## What will be built (deliverables, all libre-licensed)

1. **QOKI-Pipeline** (MIT/Apache-2): open-source the QNFO publication pipeline — markdown→pandoc→PDF/CDP build, Zenodo deposit automation, D1 living-paper registry, pre-publication gates (title-duplication, map–territory, mojibake, language gate). This is currently operational but closed; opening it makes the audit discipline reproducible by any research organisation.
2. **QOKI-Audit** (MIT/Apache-2): publish the audit tooling as standalone public goods — the Universal Ignorance Audit (DOI 10.5281/zenodo.21901984), AI-generation detection, citation-audit and post-publication adversarial-review procedures (DOI 10.5281/zenodo.21901983).
3. **QOKI-Mirror** (MIT/Apache-2 + CC-BY-SA content): IPFS/Filecoin mirror of the full QNFO corpus (~1,000 papers: markdown, PDF, HTML) with a provenance manifest mapping DOI → slug → CID → license → audit trail, plus a verification tool that recomputes CIDs and reports drift. Content-addressed citations make paper integrity cryptographically checkable.
4. **Reference architecture** (CC-BY-SA): documentation so any open-science or AI-assisted research organisation can replicate the pipeline and the decentralized archive.

## Why it matters now

- EU Energy Efficiency Directive + ESG mandates are making "what does this cost to run" a procurement question — the same wave that made PUE/SERT/MLPerf standards; open knowledge infrastructure should not lag behind closed alternatives.
- AI-assisted research volume is exploding; trust infrastructure (auditability, provenance, persistence) is the missing piece. NLnet is positioned to fund exactly this public-goods layer.
- The corpus is live and operating today (papers.qnfo.org, 1,619 knowledge-graph paper nodes, 900+ Zenodo deposits) — this is not greenfield; it is opening and decentralizing an existing public asset.

## Applicant fit

- 20+ years software/systems engineering; built the entire QNFO platform (Cloudflare Workers/D1/R2/Vectorize, knowledge graph, publication pipeline, prior IPFS deployment 2026-07-18).
- Published method papers demonstrate the audit discipline: Universal Ignorance Audit (10.5281/zenodo.21901984), AI-assisted pipeline lessons (10.5281/zenodo.21901983), funding strategy (10.5281/zenodo.21922589), JPCUB energy-standard playbook (10.5281/zenodo.21905166).
- Honest gaps: individual applicant (no entity); JPCUB hardware measurement not yet done; team of one — mitigated by milestone-based scope and the already-operational pipeline.

## Milestones (draft)

| # | Deliverable | Timeframe | Funding |
|---|-------------|-----------|---------|
| 1 | Open-source QOKI-Pipeline + documentation | 2 months | €8,000 |
| 2 | Publish QOKI-Audit tooling (standalone) | 2 months | €7,000 |
| 3 | QOKI-Mirror: IPFS/Filecoin corpus mirror + provenance manifest + drift verification | 4 months | €20,000 |
| 4 | Reference architecture + adoption outreach | 2 months | €5,000 |

Total: €40,000 (within band; adjust to €20k for core pipeline+audit only if needed).

## Alignment note

This is the NLnet-targeted variant of the funding strategy at 10.5281/zenodo.21922589 (which ranks NLnet #1 of 11 funders on fit). The dossier is at `funding/DOSSIER.md`; the tracker at `funding/APPLICATIONS.md`.

## Pre-submission checklist (before Sep 3)

- [ ] Confirm exact current form fields on nlnet.nl/propose (form changes between cycles)
- [ ] Adjust budget to final band (€20k vs €40k)
- [ ] Prepare 50MB-attachment pack: DOSSIER, funding strategy PDF, JPCUB onepager
- [ ] Decide entity framing (individual vs fiscal sponsorship)
- [ ] Submit early (deadlines are hard; "don't wait until the last hour")
