# qnfo-research-exec

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: version_queue drain: Zenodo publishV2 + PDF + KG
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Zenodo version requests (ZENODO-VERSION-REQUESTS-1, 0.9.36)

Each cron run publishes at most one pending row of `qnfo-audit.zenodo_version_requests`
(schema: `migrations/2026-10-01-zenodo-version-requests.sql`): a new version of `record_id` whose files are
replaced by `files_json`, with `metadata_json` merged over the previous version's metadata. File URLs must be
`https://raw.githubusercontent.com/{rwnq8|QNFO}/<repo>/<40-hex commit>/<path>`. Queue a request with a D1 insert;
the row moves `pending -> publishing -> published | error` and records `result_doi` (or `error` and `draft_id`).
Offline test: `node qnfo-research-exec/zenodo-version-requests.test.mjs`.

## Zenodo metadata edits and creator identity (ZENODO-METADATA-EDITS-1, ZENODO-IDENTITY-1, 0.9.41)

New papers carry the creator as `Quni-Gudzinas, Rowan Brad` with affiliation `QNFO (independent research)` (STRATEGY-1
s2.2). The same queue now has a `kind` column (`migrations/2026-10-01-zenodo-version-requests-kind.sql`): `kind='metadata'`
rows edit a published record in place, setting the ORCID-matched creator's name and affiliation from
`metadata_json.creator_by_orcid`. Each run handles up to 8 such rows after the one version request; a record already
canonical is marked `unchanged` without an edit, and any failure after `edit` discards it.

## Accuracy layer (ACCURACY-GROUND-1, 0.12.0, owner directive 2026-10-10)

Generated text states only what the text it was given states. Instructions specify process and style, never topics or example nouns.

- Writer, reconcile and review preambles: every statement about a cited work must be derivable from that work's supplied bibliography entry; a thin entry is said to be thin; an unsupported statement about a cited work or the outside world is a HARD review finding.
- Reviser member (qnfo-paper-reviser 1.3.0): the auditor's `low` label is not trusted. `guardSeverity` demotes a `low` edit to `high` (flagged, recorded as an unconfirmed internal erratum, never applied) unless its category is a surface category (prose, format, meta, changelog), its replacement is at most 240 characters, every name, figure, year and link in it already occurs in the paper, and at most two content words are new. A terminology bridge between fields is an assertion and is `high`.
- Errata members (errata-hub 1.5.0, respond 0.5.0): `enforceCorrectionGrounding` makes a draft high risk (never sent by errata-publish) when its clarification, acknowledgement or changelog holds a name, year, figure, DOI or link found in neither the errata email nor the paper; a corrected reference must therefore come from the email or the paper. The classifier's `paper_doi` must occur in the email.
- The deterministic check is `ungroundedTerms`, the same method as q08-signal-engine `groundingProblems` (Q08-VERIFY-1). Suites: `ground.test.mjs` here, `qnfo-paper-reviser/ground.test.mjs`.
