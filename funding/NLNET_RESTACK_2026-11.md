# NLnet Restack Fund proposal, ready to paste (deadline 2026-11-03, 12:00 CET)

**Status (2026-10-01, OWNER-QUEUE-DELEGATION-1): not submitted.** Under the owner's queue delegation the fleet does not
submit it: the budget is the applicant's own 500 hours of work, which the owner has said they will not do, and NLnet's
GenAI policy requires a log of every prompt and unedited output used to draft it. It stays here as a draft.

Prepared 2026-10-01 for the owner to review and submit (Identity doc tracker items 7 and 8). It replaces the August "QOKI"
draft (`funding/NLNET_PROPOSAL.md`), which led with an AI-assisted pipeline: Restack excludes "AI-related projects ...
unless they are already widely used throughout society (> 1 million active human users)" and names "reproducibility and trust
enhancing technologies" and "software supply chain management" as in scope ([Restack call](https://nlnet.nl/restack/),
read 2026-10-01). This proposal is that: provenance and integrity tooling for open research archives, usable by any
repository or self-hosted publisher. Field names and limits are from [nlnet.nl/propose](https://nlnet.nl/propose/)
(read 2026-10-01). Scoring: technical excellence 30%, relevance and impact 40%, value for money 30%; pass mark 5.0 of 7
([guide for applicants](https://nlnet.nl/restack/guideforapplicants/)).

**Before submitting, the owner confirms:** country of residence and the "European dimension" (eligibility); the hourly rate;
the repository URL for the work (a new public repo is assumed below); and the AI-disclosure field (NLnet asks which
generative AI was used and for the prompts; this draft was prepared with an AI assistant, so the answer is yes).

---

**Select a fund:** Restack

**Proposal title:** Verifiable preprints: provenance manifests and drift checks for open research archives

**Project website(s) / repositories:** https://github.com/QNFO (new public repository `verifiable-preprints`, to be created at
the start of the grant); live testbed: https://papers.qnfo.org

**Project overview** (max 1000 characters)

> Open research archives hand out persistent identifiers, but nothing checks that what a DOI, a landing page, a PDF and a
> mirror say about a paper stay the same. Versions drift, metadata on the landing page disagrees with the registry, text gets
> corrupted by encoding faults, and links rot, silently. This project builds a small, open toolkit that any repository or
> self-hosted publisher can run: (1) a provenance manifest per work that binds identifier, version, content hash and licence;
> (2) a drift verifier that recomputes hashes across the registry, landing page, files and mirrors and reports every
> mismatch; (3) a metadata consistency linter for DataCite/Zenodo records, citation meta tags, JSON-LD and FAIR Signposting
> links; (4) a CI action that blocks publishing a release that fails these checks. It is developed and validated on a live
> archive of several hundred openly licensed preprints, and released under Apache-2.0 with documentation.

**How much money do you request?** EUR 30,000

**Budget breakdown** (max 4000 characters)

> Single developer, 500 hours at EUR 60/hour = EUR 30,000. No hardware or travel.
>
> 1. Provenance manifest specification and reference implementation (80 h, EUR 4,800). A small JSON schema per work:
>    persistent identifier, concept and version identifiers, content hashes for every file (SHA-256 plus an optional IPFS CID),
>    licence, and the chain of versions. Generator for DataCite/Zenodo records and for static landing pages.
> 2. Drift verifier (140 h, EUR 8,400). Fetches the registry record, the landing page, the files and any mirrors; normalises
>    them (canonical text form, so formatting-only changes do not count as drift); recomputes hashes; reports identifier
>    mismatches, version mismatches, encoding corruption (e.g. double-encoded UTF-8), dead or redirected links, and licence
>    disagreements. Output: machine-readable report plus a human summary.
> 3. Metadata consistency linter (100 h, EUR 6,000). Cross-checks the registry metadata against the landing page's citation
>    meta tags (as used by scholarly indexers), Schema.org JSON-LD, and FAIR Signposting link headers (cite-as, describedby,
>    item, license). Emits fixes where they are mechanical.
> 4. CI integration (60 h, EUR 3,600). A reusable GitHub/Forgejo action and a command-line tool that fail a release when the
>    manifest, the verifier or the linter fail, so problems are caught before a DOI is minted.
> 5. Validation on a live archive (70 h, EUR 4,200). Run the toolkit against papers.qnfo.org (several hundred preprints with
>    DOIs) and a second, independent archive; publish the defect statistics and false-positive rate.
> 6. Documentation, packaging and community outreach (50 h, EUR 3,000). Install guide, specification document, a short
>    write-up of the validation results, and outreach to repository maintainers (see ecosystem).
>
> Milestones and payments follow these six tasks; each ends with a tagged release or a published report.

**Comparison with existing efforts** (max 4000 characters)

> Persistent identifier services (DataCite, Crossref, Zenodo) mint and resolve identifiers and keep version chains, but they
> do not verify that the content and metadata seen at the landing page, in the files and in mirrors still match the
> registered record. Crossmark shows update and retraction status for Crossref DOIs, but most preprint and repository DOIs
> are DataCite DOIs, and Crossmark does not check content integrity.
>
> Software Heritage archives source code with intrinsic identifiers (SWHIDs). This project applies the same idea, content
> hashes bound to identifiers, to research outputs and their metadata, and can record SWHIDs for any linked code.
>
> IPFS and similar systems provide content addressing but no scholarly metadata model and no cross-checking against
> registries. The manifest can carry a CID, so an archive can be mirrored and still be verified against its DOI.
>
> FAIR Signposting defines typed links between landing pages, metadata and content, and Robust Links address link rot. Both
> are standards; few self-hosted publishers implement them, and nothing checks them in CI. The linter implements and tests
> them, so adoption gets easier.
>
> What is new is the combination in one small toolkit, run automatically before and after publication: identifier, version,
> content hash, encoding integrity and metadata consistency checked together across every place a work appears. The defects
> it targets are measured, not hypothetical: on the testbed archive, an internal audit found 60 records whose page
> identifier differed from the DOI record and 24 where two stored DOIs disagreed, and a deployment fault double-encoded UTF-8
> on published pages until it was found by inspection on 2026-10-01.

**Technical challenges** (max 4000 characters)

> - Normalisation without false alarms: HTML and PDF renderings change for harmless reasons (timestamps, fonts, whitespace).
>   The verifier needs a canonical text form and per-format rules so that real drift is caught and formatting noise is not.
>   The false-positive rate will be measured and reported.
> - Legitimate change versus drift: works are revised. The manifest must separate a new version (expected, linked by the
>   version chain) from an unrecorded change to an existing version.
> - Concept versus version identifiers: Zenodo and DataCite distinguish them, and pages often cite one while the files belong
>   to the other. The checker must resolve both and report which one a page claims.
> - Reproducible builds of publication files: PDFs embed creation dates and tool versions. Deterministic build settings, or
>   hashing a canonical text layer, are needed so a rebuilt file verifies.
> - Rate limits and politeness: registry and repository APIs must be queried within their limits, with caching and
>   incremental runs for archives with thousands of records.
> - Encoding faults: detecting double-encoded UTF-8 and similar corruption reliably across languages without flagging
>   legitimate non-Latin text.

**Ecosystem and engagement** (max 2000 characters)

> Users: maintainers of institutional and community repositories (InvenioRDM, which Zenodo runs on, is open source),
> self-hosted publishers of preprints and reports, and research software engineers who publish with DOIs. Engagement:
> releases on a public forge under Apache-2.0; a reusable CI action; an issue and discussion space; a short report of the
> validation results; and direct outreach to InvenioRDM and FAIR Signposting implementers with concrete findings, offering
> the linter as an optional check. Where a defect is found in an upstream tool, the fix is contributed upstream rather than
> worked around.

**Relevant experience** (max 2000 characters)

> Fifteen years building and running research data systems. At the U.S. Federal Highway Administration I managed a federal
> research portfolio and worked on the national long-distance passenger travel forecasting model. At AARP's Public Policy
> Institute I led the Livability Index, which integrates 50+ data sources and is published and versioned as a public data
> product. For the past two years I have built and operated an open publishing system on Cloudflare Workers (databases,
> object storage, scheduled jobs) that deposits preprints on Zenodo with DOIs and serves them at papers.qnfo.org. The
> integrity gates that system already runs (duplicate titles, encoding faults, version and identifier convergence) are the
> starting point for this toolkit. Published method work: The Universal Ignorance Audit (10.5281/zenodo.21901984).

**Does (or did) the project have other funding sources?** (max 1000 characters)

> No. The testbed archive and its infrastructure have been self-funded. No other grant has been awarded for this work.

**Attachments (optional):** the provenance manifest example (one real record from papers.qnfo.org) and the defect counts
quoted above, exported from the testbed's audit tables.

**Generative AI disclosure:** the owner completes this field at submission (yes; the model used, and the prompts and outputs
as NLnet asks).

**Contact, type of applicant, organisation, country:** the owner completes these (type: individual; organisation: QNFO
(independent research), or blank).

---

## Notes for the owner
- The ask is EUR 30,000 (the call allows EUR 5,000-50,000 for a first proposal). Lower the hours, not the rate, to reduce it.
- Experience text uses the CV in the Identity doc; adjust it to the approved wording before pasting.
- The AI framing of the August draft is gone on purpose. The toolkit is useful to any archive; QNFO is the testbed.
