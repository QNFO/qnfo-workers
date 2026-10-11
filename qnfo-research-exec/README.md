# qnfo-research-exec

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: research pipeline and version_queue drain (in-house publishV2 + KG + R2 + GitHub copy)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Publishing (NOZ-DOI-1, 0.12.3)

A paper is published in-house: its papers.qnfo.org page is its address, and `doi`, `zenodo_doi` and `zenodo_url` are written NULL on
every new or revised paper row. The version_queue drain (`publishV2`) updates the papers row, the knowledge-graph node
(`paper:<slug>`), the R2 copy and the GitHub copy, and queues the social post; it calls no outside registrar. The earlier
deposit, version-request, metadata-edit and related-link stages are removed. Offline test: `node qnfo-research-exec/inhouse-publish.test.mjs`.

## Accuracy layer (ACCURACY-GROUND-1, 0.12.0, owner directive 2026-10-10)

Generated text states only what the text it was given states. Instructions specify process and style, never topics or example nouns.

- Writer, reconcile and review preambles: every statement about a cited work must be derivable from that work's supplied bibliography entry; a thin entry is said to be thin; an unsupported statement about a cited work or the outside world is a HARD review finding.
- Reviser member (qnfo-paper-reviser 1.3.x): the auditor's `low` label is not trusted. `guardSeverity` demotes a `low` edit to `high` (flagged, recorded as an unconfirmed internal erratum, never applied) unless its category is a surface category (prose, format, meta, changelog), its replacement is at most 240 characters, every name, figure, year and link in it already occurs in the paper, and at most two content words are new. A terminology bridge between fields is an assertion and is `high`.
- Errata members (errata-hub 1.5.x, respond 0.5.x): `enforceCorrectionGrounding` makes a draft high risk (never sent by errata-publish) when its clarification, acknowledgement or changelog holds a name, year, figure, DOI or link found in neither the errata email nor the paper; a corrected reference must therefore come from the email or the paper. The classifier's `paper_doi` must occur in the email.
- The deterministic check is `ungroundedTerms`, the same method as q08-signal-engine `groundingProblems` (Q08-VERIFY-1). Suites: `ground.test.mjs` here, `qnfo-paper-reviser/ground.test.mjs`.
